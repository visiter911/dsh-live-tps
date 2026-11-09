/**
 * dsh-live-tps — 侧栏实时速度（host 半边）。
 *
 * 监听所有会话的 `session/event` 流与 `agent/assistant-stream` 帧，按滚动窗口
 * 估算每个会话的实时输出速度（tok/s，字符启发式，提供方上报 usage 时校正为
 * 精确值），并通过 webServer 暴露只读 HTTP 端点，供侧栏块每秒轮询。
 *
 * 用量面板所需的 `/api/all-usage/*` 由本插件内嵌挂载 dsh-all-usage 的主机引擎
 * 提供：外部 all-usage 插件启用时让它独占路由，停用时由本插件补上，因此关掉
 * 外部插件不会让面板失效。实时速度统计仍是纯内存、零持久化。
 */

import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const name = 'live-tps';
export const inject = ['webServer'];

const API_PATH = '/live-tps/v1';
const USAGE_PACKAGE = 'dsh-all-usage';
const USAGE_ENTRY = 'lib/plugin.js';
const USAGE_ROUTE = '/api/all-usage';
const USAGE_PROBE_ATTEMPTS = 20;
const USAGE_PROBE_DELAY_MS = 50;
// 主机端引擎已 vendored 进本包；外部 dsh-all-usage 可以整个卸载。
const VENDORED_USAGE_ROOT = fileURLToPath(new URL('./vendor/dsh-all-usage', import.meta.url));

const require = createRequire(import.meta.url);

/**
 * Node 的 ESM 缓存按 URL 永久复用，直接 import vendor 会让补丁在热重载后仍是旧代码。
 * 这里按 vendor/lib 的内容指纹复制一份到缓存目录，用新 URL 导入；vendor 一变就是新
 * 模块图，profile 热重载即可生效，无需重启宿主。
 */
function vendoredUsageEntry() {
	let stamp = '';
	try {
		const libDir = join(VENDORED_USAGE_ROOT, 'lib');
		const names = readdirSync(libDir).filter((name) => name.endsWith('.js')).sort();
		let acc = 17;
		for (const name of names) {
			const info = statSync(join(libDir, name));
			acc = (acc * 31 + Math.round(info.mtimeMs) + info.size) % 1000000007;
		}
		stamp = `${names.length}-${acc}`;
	} catch {
		return join(VENDORED_USAGE_ROOT, 'lib', 'plugin.js');
	}
	const target = join(dshHome(), 'cache', 'live-tps-engine', `engine-${stamp}`);
	const entry = join(target, 'lib', 'plugin.js');
	if (!existsSync(entry)) {
		try {
			const cacheDir = join(dshHome(), 'cache', 'live-tps-engine');
			mkdirSync(cacheDir, { recursive: true });
			cpSync(VENDORED_USAGE_ROOT, target, { recursive: true });
			for (const name of readdirSync(cacheDir)) {
				if (name !== `engine-${stamp}`) rmSync(join(cacheDir, name), { recursive: true, force: true });
			}
		} catch {
			return join(VENDORED_USAGE_ROOT, 'lib', 'plugin.js');
		}
	}
	return entry;
}

function usagePackageCandidates() {
	const candidates = [];
	const add = (file) => {
		if (typeof file === 'string' && file !== '' && !candidates.includes(file)) candidates.push(file);
	};
	add(vendoredUsageEntry());
	// Fallbacks for an older copy of this plugin that has no vendor/ directory.
	for (const base of [process.env.DSH_PROFILE_DIR, process.cwd()]) {
		if (typeof base !== 'string' || base === '') continue;
		try {
			add(require.resolve(USAGE_PACKAGE, { paths: [base] }));
		} catch {}
	}
	if (typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '') {
		const profile = process.env.DSH_PROFILE || 'desktop';
		add(join(process.env.DSH_HOME, 'profiles', profile, 'node_modules', USAGE_PACKAGE, USAGE_ENTRY));
	}
	try {
		add(require.resolve(USAGE_PACKAGE));
	} catch {}
	return candidates.filter((file) => existsSync(file));
}
const WINDOW_MS = 5000;
// 观察窗下限：观测跨度不足 1 秒时不报速度。流式输出常有突发（缓冲一次 flush
// 好几个 chunk），用不到 1 秒的跨度去除会算出几百上千 tok/s 的假峰值。
const MIN_SPAN_MS = 1000;
// 生成中但超过这么久没有新 token，视为卡住（网络停顿等），速度归零。
const STALL_MS = 2000;
const IDLE_TTL_MS = 180000;
const CHARS_PER_TOKEN = 4;
const CJK_TOKENS_PER_CHAR = 1;

function round1(value) {
	return Math.round(value * 10) / 10;
}

function makeSession(id) {
	return {
		id,
		status: 'idle', // idle | running | streaming | tool | retrying
		samples: [], // { t, tokens } 滚动窗口样本
		turnOutput: 0,
		sessionOutput: 0,
		stepEstimate: 0,
		turnStartedAt: null,
		lastChunkAt: null,
		lastEventAt: 0,
		model: null,
		provider: null,
		untaggedTokens: 0, // 模型未知时流入的估算 token，模型确定后回填聚合表
		peakTps: 0, // 本会话生命周期内的滚动窗口速度峰值
		streamEndedAt: null, // 上一次"停止生成"的时刻（流结束/工具调用/回合结束）
	};
}

function finiteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

const SEARCH_PRICE_CNY_PER_CALL = 5 / 1000;
const SEARCH_BILLING_FROM_DAY = '2026-11-01';
const SEARCH_STORE_VERSION = 1;
const SEARCH_STORE_FILENAME = 'live-tps-search-usage.json';
const SEARCH_PENDING_TTL_MS = 10 * 60 * 1000;

function pad2(value) {
	return String(value).padStart(2, '0');
}

/** 官方计费按北京时间自然日；中国无夏令时，固定 +08:00 计算即可。 */
function shanghaiDayKey(time) {
	const date = new Date(time + 8 * 60 * 60 * 1000);
	return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * 本插件自己的数据都放在 DSH 的 home 下：优先 $DSH_HOME（DSH 启动时会注入），
 * 否则退回 ~/.dsh。第三方发行版的 home 可能不在默认位置，因此不硬编码。
 */
function dshHome() {
	return typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
		? process.env.DSH_HOME
		: join(homedir(), '.dsh');
}

function searchStorePath() {
	return join(dshHome(), SEARCH_STORE_FILENAME);
}

function validDayText(value) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * 归一化 tool/result 的两种形态：
 * - 旧宿主：message.content 里包一个 `tool-result` 块，文本在其 content 中；
 * - 新宿主：message.content 直接是 text 块，`isError` / `toolCallId` 挂在 message 上。
 * 只认 message 上的 isError 会漏掉失败调用，导致失败请求被计入费用。
 */
function toolResultView(data) {
	const message = data?.message;
	if (message === null || typeof message !== 'object') return null;
	const blocks = Array.isArray(message.content) ? message.content : [];
	const block = blocks.find((item) => item !== null && typeof item === 'object' && item.type === 'tool-result') ?? null;
	const callId = typeof data.callId === 'string' ? data.callId
		: typeof message.source?.callId === 'string' ? message.source.callId
			: typeof block?.toolCallId === 'string' ? block.toolCallId
				: typeof message.toolCallId === 'string' ? message.toolCallId
					: null;
	if (callId === null) return null;
	const nested = block !== null && Array.isArray(block.content) ? block.content : blocks;
	const parts = [];
	for (const item of nested) {
		if (item !== null && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
	}
	const sources = data?.meta?.sources;
	return {
		callId,
		isError: block?.isError === true || message.isError === true,
		text: parts.join(''),
		sources: Array.isArray(sources) ? sources : null,
	};
}

/**
 * 统计 DeepSeek Search / Fetch API 的成功请求次数。
 *
 * 直连 provider 对 `web_search` 的每个 query 发一次 `/v1/tools/search`，对
 * `web_fetch` 发一次 `/v1/tools/fetch`；两者官方都是 ¥5 / 1000 次成功请求，
 * 失败与空结果不计费。这里只记录次数与日期，不保存查询内容。
 */
class SearchMeter {
	constructor(ctx, file = searchStorePath()) {
		this.ctx = ctx;
		this.file = file;
		this.days = new Map();
		this.pending = new Map();
	}

	load() {
		try {
			const raw = JSON.parse(readFileSync(this.file, 'utf8'));
			if (raw?.version !== SEARCH_STORE_VERSION || raw.days === null || typeof raw.days !== 'object') return;
			for (const [day, counts] of Object.entries(raw.days)) {
				if (!validDayText(day) || counts === null || typeof counts !== 'object') continue;
				const search = Math.max(0, Math.trunc(Number(counts.search) || 0));
				const fetch = Math.max(0, Math.trunc(Number(counts.fetch) || 0));
				if (search > 0 || fetch > 0) this.days.set(day, { search, fetch });
			}
		} catch {}
	}

	store() {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			const days = {};
			for (const day of [...this.days.keys()].sort()) days[day] = this.days.get(day);
			const temporary = `${this.file}.${process.pid}.tmp`;
			writeFileSync(temporary, JSON.stringify({ version: SEARCH_STORE_VERSION, updatedAt: Date.now(), days }));
			renameSync(temporary, this.file);
		} catch (error) {
			this.ctx?.logger?.warn(error instanceof Error ? error : new Error(String(error)));
		}
	}

	record(day, kind, count) {
		if (!(count > 0)) return;
		let entry = this.days.get(day);
		if (entry === undefined) {
			entry = { search: 0, fetch: 0 };
			this.days.set(day, entry);
		}
		entry[kind] += count;
		this.store();
	}

	prunePending(now) {
		if (this.pending.size < 64) return;
		for (const [key, value] of this.pending) {
			if (now - value.time > SEARCH_PENDING_TTL_MS) this.pending.delete(key);
		}
	}

	handle(event) {
		if (event === null || typeof event !== 'object') return;
		if (event.type === 'tool/call') {
			const data = event.data;
			const name = data?.name;
			if (name !== 'web_search' && name !== 'web_fetch') return;
			if (typeof data.callId !== 'string' || data.callId === '') return;
			let count = 1;
			if (name === 'web_search') {
				let args = data.arguments;
				if (typeof args === 'string') {
					try { args = JSON.parse(args); } catch { args = null; }
				}
				const queries = Array.isArray(args?.queries) ? args.queries : [];
				const unique = new Set();
				for (const query of queries) {
					if (typeof query === 'string' && query.trim() !== '') unique.add(query);
				}
				count = unique.size;
			}
			if (count > 0) {
				const at = Number.isFinite(event.time) ? event.time : Date.now();
				this.pending.set(data.callId, { kind: name === 'web_search' ? 'search' : 'fetch', count, time: at });
				this.prunePending(at);
			}
			return;
		}
		if (event.type !== 'tool/result') return;
		const data = event.data;
		const view = toolResultView(data);
		if (view === null) return;
		const pending = this.pending.get(view.callId);
		if (pending === undefined) return;
		this.pending.delete(view.callId);
		if (view.isError) return;
		if (pending.kind === 'search') {
			// 官方只对「有结果」的搜索计费：sources 缺失或为空都不计。
			if (view.sources === null || view.sources.length === 0) return;
		} else if (view.text.trim() === '') {
			return;
		}
		const at = Number.isFinite(event.time) ? event.time : pending.time;
		this.record(shanghaiDayKey(at), pending.kind, pending.count);
	}

	summary(start = null, end = null) {
		let search = 0;
		let fetch = 0;
		let billable = 0;
		let first = null;
		for (const [day, counts] of this.days) {
			if (first === null || day < first) first = day;
			if (start !== null && day < start) continue;
			if (end !== null && day > end) continue;
			search += counts.search;
			fetch += counts.fetch;
			if (day >= SEARCH_BILLING_FROM_DAY) billable += counts.search + counts.fetch;
		}
		return {
			calls: search + fetch,
			searchCalls: search,
			fetchCalls: fetch,
			billableCalls: billable,
			costCny: Math.round(billable * SEARCH_PRICE_CNY_PER_CALL * 1000000) / 1000000,
			currency: 'CNY',
			pricePerThousand: 5,
			effectiveFrom: '2026-11-01T00:00:00+08:00',
			since: first,
		};
	}
}

class LiveTps {
	constructor(ctx) {
		this.ctx = ctx;
		this.sessions = new Map();
		this.models = new Map(); // model -> { model, provider, outputTokens, peakTps } 进程级聚合
		this.evictedOutput = 0; // 被清理会话的累计输出，并入全局总量
		this.globalPeakTps = 0; // 本次宿主启动以来的最高会话速度
		this.liveFramesSeen = false; // 见到 agent/assistant-stream 帧后停用旧 chunk 通道防双计
		this.searchMeter = new SearchMeter(ctx);
	}

	estimate(text) {
		if (typeof text !== 'string' || text === '') return 0;
		// 逐字符码点判断，避免对每个字符做一次正则 test（长 chunk 下差 ~10 倍）。
		let cjk = 0;
		for (let index = 0; index < text.length; index += 1) {
			const code = text.charCodeAt(index);
			if ((code >= 0x3040 && code <= 0x30ff)
				|| (code >= 0x3400 && code <= 0x4dbf)
				|| (code >= 0x4e00 && code <= 0x9fff)
				|| (code >= 0xf900 && code <= 0xfaff)
				|| (code >= 0xac00 && code <= 0xd7af)) cjk += 1;
		}
		const other = text.length - cjk;
		return cjk * CJK_TOKENS_PER_CHAR + other / CHARS_PER_TOKEN;
	}

	/** 取（或建）模型聚合行；tokens 可为负（usage 校正回退），下限 0。 */
	addModelTokens(model, provider, tokens) {
		let entry = this.models.get(model);
		if (entry === undefined) {
			entry = { model, provider: null, outputTokens: 0, peakTps: 0 };
			this.models.set(model, entry);
		}
		if (provider && entry.provider !== provider) entry.provider = provider;
		if (tokens !== 0) entry.outputTokens = Math.max(0, entry.outputTokens + tokens);
		return entry;
	}

	addTokens(session, tokens, at) {
		if (!(tokens > 0)) return;
		// 事件/帧的时间戳可能缺失（frame.time 在部分宿主上为 undefined）。
		// 没有时间戳的样本会让窗口永远滑不出去、跨度塌到下限，算出上千 tok/s 的假值。
		const stamp = Number.isFinite(at) ? at : Date.now();
		session.turnOutput += tokens;
		session.sessionOutput += tokens;
		// 停表后又出字：上一段输出的样本不能带进新一段，否则窗口里新旧 token
		// 一起除以很短的新跨度，会算出几千 tok/s 的假尖峰。
		if (session.streamEndedAt !== null) {
			const resumedAt = session.streamEndedAt;
			session.samples = session.samples.filter((sample) => sample.t > resumedAt);
			session.streamEndedAt = null;
		}
		session.samples.push({ t: stamp, tokens });
		session.lastChunkAt = stamp;
		if (session.model !== null) this.addModelTokens(session.model, session.provider, tokens);
		else session.untaggedTokens += tokens;
	}

	/** 标记生成已停止（流结束 / 工具调用 / 重试 / 回合结束），速度立即归零。 */
	markStreamEnded(session, at) {
		session.streamEndedAt = Number.isFinite(at) ? at : Date.now();
	}

	onEvent(session, event) {
		session.lastEventAt = event.time;
		switch (event.type) {
			case 'turn/start':
				session.status = 'running';
				session.turnOutput = 0;
				session.turnStartedAt = event.time;
				break;
			case 'step/start':
				session.status = 'running';
				session.stepEstimate = 0;
				break;
			case 'assistant/chunk': {
				// 新版宿主把逐 delta 流挪进 `agent/assistant-stream` 帧通道；
				// 两通道互斥，见到帧后本通道一律忽略防双计。
				if (this.liveFramesSeen) break;
				const chunk = event.data?.chunk;
				if (!chunk) break;
				let text = '';
				if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') text = chunk.text ?? '';
				else if (chunk.type === 'tool-call-delta') text = chunk.argumentsDelta ?? '';
				const tokens = this.estimate(text);
				if (tokens > 0) {
					session.stepEstimate += tokens;
					this.addTokens(session, tokens, event.time);
					session.status = 'streaming';
				}
				break;
			}
			case 'assistant/message': {
				const source = event.data?.message?.source;
				const stepModel = typeof source?.model === 'string' && source.model !== '' ? source.model : session.model;
				const stepProvider = typeof source?.provider === 'string' && source.provider !== '' ? source.provider : session.provider;
				// 一步结束＝本轮输出到此为止，立即停表（后面还要等工具/下一轮）。
				this.markStreamEnded(session, event.time);
				// 模型已知：把流式期间攒下的未归属 token 回填进聚合表。
				if (stepModel !== null && session.untaggedTokens > 0) {
					this.addModelTokens(stepModel, stepProvider, session.untaggedTokens);
					session.untaggedTokens = 0;
				}
				// 提供方 usage 到达：把本步估算校正为精确输出 token 数（聚合表同步校正）。
				const actual = finiteNumber(event.data?.usage?.outputTokens);
				if (actual !== null) {
					const diff = actual - session.stepEstimate;
					if (diff !== 0) {
						if (diff > 0) {
							session.turnOutput += diff;
							session.sessionOutput += diff;
							const last = session.samples.at(-1);
							if (last) last.tokens += diff;
						} else {
							session.turnOutput = Math.max(0, session.turnOutput + diff);
							session.sessionOutput = Math.max(0, session.sessionOutput + diff);
							const last = session.samples.at(-1);
							if (last) last.tokens = Math.max(0, last.tokens + diff);
						}
						if (stepModel !== null) this.addModelTokens(stepModel, stepProvider, diff);
					}
				}
				if (stepModel !== null) session.model = stepModel;
				if (stepProvider !== null) session.provider = stepProvider;
				session.stepEstimate = 0;
				if (session.status === 'streaming') session.status = 'running';
				break;
			}
			case 'request/header': {
				// 尽早锁定模型名（首轮流式期间就能正确归属聚合表）。
				if (session.model === null) {
					const config = event.data?.header?.config;
					if (typeof config?.model === 'string' && config.model !== '') session.model = config.model;
					if (typeof config?.provider === 'string' && config.provider !== '') session.provider = config.provider;
				}
				break;
			}
			case 'tool/call':
				session.status = 'tool';
				this.markStreamEnded(session, event.time);
				break;
			case 'tool/result':
				if (session.status === 'tool') session.status = 'running';
				break;
			case 'llm/retry':
				session.status = 'retrying';
				this.markStreamEnded(session, event.time);
				break;
			case 'llm/retry-started':
				if (session.status === 'retrying') session.status = 'running';
				break;
			case 'step/end':
				session.stepEstimate = 0;
				this.markStreamEnded(session, event.time);
				break;
			case 'turn/end':
				session.status = 'idle';
				session.turnStartedAt = null;
				this.markStreamEnded(session, event.time);
				break;
		}
	}

	accept(sessionRecord, event) {
		const id = String(sessionRecord.id);
		let session = this.sessions.get(id);
		if (session === undefined) {
			session = makeSession(id);
			this.sessions.set(id, session);
		}
		try {
			this.searchMeter.handle(event);
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			this.onEvent(session, event);
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * 实时流通道：loop 每收到一个 model chunk 就广播 `agent/assistant-stream`
	 * 帧（start/chunk/end）。逐 chunk 估算在这里做；`start` 重置本尝试的估算基线
	 * （重试是同 turn/step 的新尝试）。
	 */
	acceptFrame(agent, frame) {
		this.liveFramesSeen = true;
		const id = String(agent.session.id);
		let session = this.sessions.get(id);
		if (session === undefined) {
			session = makeSession(id);
			this.sessions.set(id, session);
		}
		try {
			if (frame.type === 'start') {
				session.lastEventAt = Date.now();
				session.stepEstimate = 0;
				if (session.status === 'idle') session.status = 'running';
			} else if (frame.type === 'chunk') {
				session.lastEventAt = Date.now();
				const chunk = frame.chunk;
				if (chunk !== null && typeof chunk === 'object') {
					let text = '';
					if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') text = chunk.text ?? '';
					else if (chunk.type === 'tool-call-delta') text = chunk.argumentsDelta ?? '';
					const tokens = this.estimate(text);
					if (tokens > 0) {
						session.stepEstimate += tokens;
						this.addTokens(session, tokens, frame.time);
						session.status = 'streaming';
					}
				}
			} else if (frame.type === 'end') {
				// 流结束（committed / abandoned）：这一轮流式生成到此为止，立即停表。
				// 之前只靠 turn/step 事件，模型停止输出后速度还会在窗口里挂 5 秒。
				session.lastEventAt = Date.now();
				this.markStreamEnded(session, Number.isFinite(frame.time) ? frame.time : Date.now());
			}
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
		}
	}

	tps(session, now) {
		const cutoff = now - WINDOW_MS;
		while (session.samples.length > 0 && session.samples[0].t < cutoff) session.samples.shift();
		if (session.samples.length === 0) return 0;
		// 停止生成后立即归零：否则样本要在窗口里留 5 秒，界面看着像卡住。
		if (session.streamEndedAt !== null) return 0;
		let lastSampleAt = 0;
		for (const sample of session.samples) if (sample.t > lastSampleAt) lastSampleAt = sample.t;
		// 生成中但长时间没有新 token（网络停顿等），同样归零，避免误以为还在跑。
		if (now - lastSampleAt > STALL_MS) return 0;
		let first = now;
		let sum = 0;
		for (const sample of session.samples) {
			if (sample.t < first) first = sample.t;
			sum += sample.tokens;
		}
		if (!(sum > 0)) return 0;
		const span = now - first;
		// 只有一个样本、或观测跨度还太短时不报速度（就当"预热中"）。
		// 否则一个 300 token 的突发 chunk 除以 300ms 下限会得到 1000 tok/s 的假值。
		if (session.samples.length < 2 || span < MIN_SPAN_MS) return 0;
		return (sum / Math.min(WINDOW_MS, span)) * 1000;
	}

	prune(now) {
		for (const [id, session] of this.sessions) {
			if (session.status === 'idle' && now - session.lastEventAt > IDLE_TTL_MS) {
				if (session.untaggedTokens > 0 && session.model !== null) {
					this.addModelTokens(session.model, session.provider, session.untaggedTokens);
				}
				session.untaggedTokens = 0;
				this.evictedOutput += session.sessionOutput;
				this.sessions.delete(id);
			}
		}
	}

	/** 滚动窗口速度的峰值记账：会话级 + 进程级，同时保留按模型的峰值。 */
	recordPeak(session, tps) {
		if (!(tps > 0)) return;
		if (tps > session.peakTps) session.peakTps = round1(tps);
		if (session.peakTps > this.globalPeakTps) this.globalPeakTps = session.peakTps;
		if (session.model !== null) {
			const entry = this.addModelTokens(session.model, session.provider, 0);
			if (tps > entry.peakTps) entry.peakTps = round1(tps);
		}
	}

	snapshot() {
		const now = Date.now();
		this.prune(now);
		const rows = [];
		let globalTps = 0;
		let running = 0;
		let liveOutput = 0;
		for (const session of this.sessions.values()) {
			const tps = this.tps(session, now);
			globalTps += tps;
			if (session.status !== 'idle') running += 1;
			liveOutput += session.sessionOutput;
			this.recordPeak(session, tps);
			rows.push({
				id: session.id,
				status: session.status,
				tps: round1(tps),
				peakTps: round1(session.peakTps),
				turnOutput: Math.round(session.turnOutput),
				sessionOutput: Math.round(session.sessionOutput),
				turnMs: session.turnStartedAt === null ? null : Math.max(0, now - session.turnStartedAt),
				lastChunkAgeMs: session.lastChunkAt === null ? null : Math.max(0, now - session.lastChunkAt),
				lastEventAgeMs: Math.max(0, now - session.lastEventAt),
				model: session.model,
				provider: session.provider,
			});
		}
		rows.sort((a, b) => b.tps - a.tps || b.lastEventAgeMs - a.lastEventAgeMs);
		const models = [...this.models.values()]
			.map((entry) => ({
				model: entry.model,
				provider: entry.provider,
				outputTokens: Math.round(entry.outputTokens),
				peakTps: entry.peakTps,
			}))
			.sort((a, b) => b.outputTokens - a.outputTokens)
			.slice(0, 8);
		return {
			serverTime: now,
			windowMs: WINDOW_MS,
			global: {
				tps: round1(globalTps),
				peakTps: round1(this.globalPeakTps),
				running,
				tracked: rows.length,
				outputTotal: Math.round(liveOutput + this.evictedOutput),
			},
			sessions: rows.slice(0, 20),
			models,
			search: this.searchMeter.summary(),
		};
	}

	handle(req, res) {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		const url = new URL(req.url ?? '/', 'http://localhost');
		const path = url.pathname;
		if (path === `${API_PATH}/search`) {
			const start = url.searchParams.get('start');
			const end = url.searchParams.get('end');
			const invalid = (start !== null && !validDayText(start))
				|| (end !== null && !validDayText(end))
				|| (start !== null && end !== null && start > end);
			if (invalid) {
				sendJson(res, 400, { error: 'invalid-date-range' });
				return;
			}
			sendJson(res, 200, req.method === 'HEAD' ? null : this.searchMeter.summary(start, end));
			return;
		}
		if (path !== API_PATH && path !== `${API_PATH}/stats`) {
			sendJson(res, 404, { error: 'Not found' });
			return;
		}
		sendJson(res, 200, req.method === 'HEAD' ? null : this.snapshot());
	}

	/** 外部 dsh-all-usage 条目的启用状态；loader 不可用时返回 null。 */
	usageEntryEnabled() {
		const loader = this.ctx.loader;
		if (loader === undefined || loader === null || typeof loader.entries !== 'function') return null;
		try {
			for (const entry of loader.entries()) {
				if (entry?.options?.name !== USAGE_PACKAGE) continue;
				if (entry.disabled !== true) return true;
			}
			return false;
		} catch {
			return null;
		}
	}

	/** 外部引擎是否已经把 /api/all-usage 路由注册上（重复注册会直接抛错）。 */
	hasUsageRoute() {
		try {
			const server = this.ctx.webServer;
			for (const table of [server?.exact, server?.prefixes]) {
				if (table instanceof Map && table.has(USAGE_ROUTE)) return true;
			}
		} catch {}
		return false;
	}

	/**
	 * 外部 all-usage 插件停用时，把它的主机引擎挂到当前插件下，保证
	 * `/api/all-usage/*` 仍然可用。启用时绝不重复挂载：两个实例会抢同一组
	 * 路由和同一份账本存储。
	 */
	async mountUsageEngine() {
		const file = usagePackageCandidates()[0];
		if (file === undefined) {
			this.ctx.logger.warn('live-tps: dsh-all-usage not installed; usage panel will stay unavailable');
			return;
		}
		let mod;
		try {
			mod = await import(pathToFileURL(file).href);
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		const plugin = typeof mod?.default?.apply === 'function' ? mod.default : mod;
		if (typeof plugin?.apply !== 'function') return;

		let external = null;
		for (let attempt = 0; attempt < USAGE_PROBE_ATTEMPTS && external === null; attempt += 1) {
			external = this.usageEntryEnabled();
			if (external === null) {
				await new Promise((resolve) => setTimeout(resolve, USAGE_PROBE_DELAY_MS));
			}
		}
		if (external === true || this.hasUsageRoute()) return;
		// 停用的插件在 Cordis 里仍会有 fiber，registry.has() 不能用来判断它是否在跑；
		// loader 不可用时改为等真实路由出现（外部插件注册很快，停用的永远不会出现）。
		if (external === null) {
			for (let attempt = 0; attempt < USAGE_PROBE_ATTEMPTS; attempt += 1) {
				if (this.hasUsageRoute()) return;
				await new Promise((resolve) => setTimeout(resolve, USAGE_PROBE_DELAY_MS));
			}
		}

		this.ctx.plugin(plugin);
		this.ctx.logger.info('live-tps: mounted embedded dsh-all-usage engine');
	}

	start() {
		this.searchMeter.load();
		this.ctx.on('session/event', (session, event) => this.accept(session, event));
		// { global: true } 接收全部 agent（含子代理）；老宿主上此事件不存在，注册本身无害。
		this.ctx.on('agent/assistant-stream', ({ agent, frame }) => this.acceptFrame(agent, frame), { global: true });
		this.ctx.effect(() => this.ctx.webServer.register({
			kind: 'prefix',
			path: API_PATH,
			handler: (req, res) => this.handle(req, res),
		}), 'live-tps: read-only stats API');
		void this.mountUsageEngine();
	}
}

function sendJson(res, status, body) {
	const json = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': Buffer.byteLength(json),
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff',
	});
	res.end(json);
}

export function apply(ctx) {
	new LiveTps(ctx).start();
}

export { SearchMeter, LiveTps };
