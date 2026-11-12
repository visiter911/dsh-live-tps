/**
 * dsh-live-tps — 侧栏底部的实时速度 + 用量统计（client 半边）。
 *
 * 侧栏块显示实时 tok/s、峰值与今日摘要；点击展开一个小浮层（活动会话 +
 * 今日快照）。点「用量统计 ↗」打开自绘的整页仪表盘：费用、token 分项、
 * 输出趋势、按模型/供应商、工作区与最近调用。
 *
 * 数据由 host 半边的 dsh-all-usage 聚合引擎提供（/api/all-usage/*）；
 * 原插件的底部按钮仍被隐藏，页面由本插件渲染。
 */
window.__ModuleLoader__.load({
	id: 'dsh-live-tps',
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const React = require('react');
		const ReactDOM = (() => {
			try { return require('react-dom'); } catch { return null; }
		})();
		const h = React.createElement;
		const { useCallback, useEffect, useRef, useState } = React;

		const API = '/live-tps/v1';
		const USAGE = '/api/all-usage';
		const LIVE = '/live-tps/v1';
		const zh = (navigator.language || '').toLowerCase().startsWith('zh');

		const L = zh
			? {
				title: '实时输出',
				peak: '峰值',
				output: '累计输出',
				running: '运行中',
				tok: 'tok',
				offline: '离线',
				hint: '点击查看实时输出与用量',
				sessions: '活动会话',
				empty: '暂无活动会话',
				usage: '用量统计',
				today: '今日',
				note: '进程级统计，宿主重启后清零',
				openFull: '打开完整用量面板',
				usageUnavailable: '用量数据不可用',
				scanningNote: '后台扫描中，数据可能不完整',
				sourceShort: '来自会话日志聚合',
				byModelFull: '按模型',
				usageTitle: '用量统计',
				costLabel: '总费用',
				cacheHitRate: 'cache',
				searchApi: '搜索 API',
				searchUnit: '次搜索',
				fetchUnit: '次抓取',
				searchApiHint: 'DeepSeek 官方 ¥5 / 1000 次成功请求；失败与无结果不计费，自 2026-11-01 00:00 起计费。',
				searchBillableFrom: '计费自 11-01',
				inputLabel: '输入',
				outputLabel: '输出',
				cacheLabel: '缓存读',
				reasoningLabel: '推理',
				callsLabel: '调用',
				sessionsLabel: '会话',
				modelsLabel: '模型',
				trendLabel: '总处理趋势',
				byModel: '模型',
				byProvider: '供应商',
				workspaceLabel: '工作区',
				recentLabel: '最近调用',
				rangeToday: '今日',
				range7: '7 天',
				range30: '30 天',
				rangeAll: '全部',
				loadingShort: '加载中…',
				loadFailed: '加载失败',
				retry: '重试',
				close: '关闭',
				refresh: '刷新',
				scanning: '索引中',
				synced: '已同步',
				updated: '更新于',
				unpriced: '未计价',
				noRecords: '该范围内没有调用记录',
				noModels: '该范围内没有模型用量',
				recordsUnavailable: '最近调用不可用',
				sourceNote: '数据来自本地会话日志聚合，金额按官方价目估算',
				shareByOutput: '按输出份额',
				shareByTotal: '按总处理份额',
				breakdownLabel: '用量分布',
				workspacesCount: (n) => `${n} 个工作区`,
				recentCount: (n) => `最新 ${n} 条`,
				modelsCount: (n) => `${n} 个模型`,
				perCall: '次',
				shortOut: '输出',
				shortTotal: '总处理',
				unknownProvider: '未知供应商',
				retired: '已删除工作区',
			}
			: {
				title: 'Live output',
				peak: 'Peak',
				output: 'Output',
				running: 'running',
				tok: 'tok',
				offline: 'offline',
				hint: 'Open live output and usage',
				sessions: 'Active sessions',
				empty: 'No active sessions',
				usage: 'Usage',
				today: 'Today',
				note: 'Process-lifetime stats; resets when the host restarts',
				openFull: 'Open full usage panel',
				usageUnavailable: 'Usage data unavailable',
				scanningNote: 'Background scan in progress; data may be incomplete',
				sourceShort: 'Aggregated from session logs',
				byModelFull: 'By model',
				usageTitle: 'Usage',
				costLabel: 'Cost',
				cacheHitRate: 'cache',
				searchApi: 'Search API',
				searchUnit: 'searches',
				fetchUnit: 'fetches',
				searchApiHint: 'DeepSeek official: ¥5 per 1,000 successful requests; failures and empty results are free; billing starts 2026-11-01 00:00 (+08:00).',
				searchBillableFrom: 'billable from 11-01',
				inputLabel: 'Input',
				outputLabel: 'Output',
				cacheLabel: 'Cache read',
				reasoningLabel: 'Reasoning',
				callsLabel: 'Calls',
				sessionsLabel: 'Sessions',
				modelsLabel: 'Models',
				trendLabel: 'Total processed trend',
				byModel: 'Models',
				byProvider: 'Providers',
				workspaceLabel: 'Workspaces',
				recentLabel: 'Recent calls',
				rangeToday: 'Today',
				range7: '7d',
				range30: '30d',
				rangeAll: 'All',
				loadingShort: 'Loading…',
				loadFailed: 'Failed to load',
				retry: 'Retry',
				close: 'Close',
				refresh: 'Refresh',
				scanning: 'Indexing',
				synced: 'Synced',
				updated: 'Updated',
				unpriced: 'Unpriced',
				noRecords: 'No calls in this range',
				noModels: 'No model usage in this range',
				recordsUnavailable: 'Recent calls unavailable',
				sourceNote: 'Aggregated from local session logs; costs are estimates from official rates',
				shareByOutput: 'Share by output',
				shareByTotal: 'Share by total',
				breakdownLabel: 'Breakdown',
				workspacesCount: (n) => `${n} workspaces`,
				recentCount: (n) => `latest ${n}`,
				modelsCount: (n) => `${n} models`,
				perCall: 'call',
				shortOut: 'out',
				shortTotal: 'total',
				unknownProvider: 'unknown',
				retired: 'Deleted workspace',
			};

		const RANGES = [
			{ id: 'today', days: 1, label: L.rangeToday },
			{ id: '7d', days: 7, label: L.range7 },
			{ id: '30d', days: 30, label: L.range30 },
			{ id: 'all', days: null, label: L.rangeAll },
		];

		const CSS = [
			'.lt-root{flex:1 1 auto;min-width:0;position:relative;box-sizing:border-box}',
			'.lt-block{display:flex;flex-direction:column;gap:1px;width:100%;box-sizing:border-box;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#e5e5e5);padding:6px 10px 7px;font:inherit;text-align:left;cursor:pointer}',
			'.lt-block:hover,.lt-block.lt-open{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18))}',
			'.lt-block:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d9fff);outline-offset:-2px}',
			'.lt-line1{display:flex;align-items:center;gap:6px;min-width:0;font-variant-numeric:tabular-nums}',
			'.lt-tps{font-size:13px;font-weight:650;letter-spacing:.1px}',
			'.lt-unit{font-size:11px;font-weight:500;opacity:.62;white-space:nowrap}',
			'.lt-line2{font-size:11px;line-height:1.35;color:var(--dsw-alias-label-secondary,#a0a0a0);font-variant-numeric:tabular-nums;padding-left:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.lt-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#8b8b8b}',
			'.lt-dot.lt-streaming{background:#34d399;box-shadow:0 0 6px #34d39980;animation:lt-pulse 1s ease-in-out infinite}',
			'.lt-dot.lt-running{background:#facc15}',
			'.lt-dot.lt-tool{background:#60a5fa}',
			'.lt-dot.lt-retrying{background:#fb923c;animation:lt-pulse .7s ease-in-out infinite}',
			'.lt-dot.lt-idle{background:#8b8b8b}',
			'@keyframes lt-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
			'.lt-pop{position:fixed;z-index:1200;box-sizing:border-box;border-radius:12px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#1e1e1e) 96%,transparent);color:var(--dsw-alias-label-primary,#e5e5e5);box-shadow:0 12px 38px rgba(0,0,0,.32);backdrop-filter:blur(12px);padding:12px;font-size:12px;line-height:1.5;max-height:min(70vh,560px);overflow:auto}',
			'.lt-pop *{font-variant-numeric:tabular-nums}',
			'.lt-pop-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;opacity:.85}',
			'.lt-pop-title{font-weight:650;font-size:12px}',
			'.lt-pop-meta{font-size:11px;color:var(--dsw-alias-label-secondary,#a0a0a0)}',
			'.lt-pop-big{font-size:22px;font-weight:700;letter-spacing:.2px;margin-top:1px}',
			'.lt-pop-big small{font-size:11px;font-weight:500;opacity:.65;margin-left:4px}',
			'.lt-pop-grid{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary,#a0a0a0)}',
			'.lt-sec{margin-top:7px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25))}',
			'.lt-sec-head{font-size:11px;font-weight:600;opacity:.6;margin-bottom:2px}',
			'.lt-usage-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}',
			'.lt-usage-head .lt-sec-head{margin-bottom:0}',
			'.lt-usage-link{border:0;background:transparent;color:inherit;font:inherit;font-size:11px;font-weight:600;opacity:.6;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:3px}',
			'.lt-usage-link:hover{opacity:1;text-decoration:underline}',
			'.lt-quick{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary,#a0a0a0);font-variant-numeric:tabular-nums;margin-top:3px}',
			'.lt-quick b{font-size:13px;color:var(--dsw-alias-label-primary,#e5e5e5)}',
			'.lt-muted{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-weight:400}',
			'.lt-range{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.12));border-radius:8px;padding:2px}',
			'.lt-range button{flex:1;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#a0a0a0);border-radius:6px;padding:2px 6px;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}',
			'.lt-range button.on{background:var(--dsw-alias-bg-overlay,#2a2a2a);color:var(--dsw-alias-label-primary,#e5e5e5);font-weight:600}',
			'.lt-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px 12px;margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary,#a0a0a0)}',
			'.lt-metric{display:flex;justify-content:space-between;gap:8px;min-width:0}',
			'.lt-metric b{font-weight:600;color:var(--dsw-alias-label-primary,#e5e5e5)}',
			'.lt-bars{display:flex;align-items:flex-end;gap:2px;height:36px;margin-top:7px}',
			'.lt-bar{flex:1;min-width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary,#4d9fff);opacity:.7}',
			'.lt-refresh{border:0;background:transparent;color:var(--dsw-alias-brand-primary,#4d9fff);cursor:pointer;font:inherit;font-size:10px;padding:0;flex:none}',
			'.lt-row{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;opacity:.9}',
			'.lt-sid{font-family:var(--ds-font-family-code,monospace);opacity:.72;flex:none}',
			'.lt-model{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.75}',
			'.lt-num{margin-left:auto;font-weight:600;flex:none}',
			'.lt-peaknum{flex:none;opacity:.75;font-size:11px;min-width:52px;text-align:right}',
			'.lt-empty{opacity:.6;font-size:11px}',
			'.lt-note{margin-top:7px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));font-size:10px;color:var(--dsw-alias-label-secondary,#a0a0a0);opacity:.85;display:flex;align-items:center;justify-content:space-between;gap:8px}',
			// dsh-all-usage 仍挂载并提供数据与完整面板；它的底部按钮由本插件代管，隐藏掉。
			'button.uh-side-entry{display:none!important}',

			// ── 用量仪表盘 ─────────────────────────────────────────────
			'.lu-backdrop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,9,12,.58);backdrop-filter:blur(6px);animation:lu-fade .14s ease-out}',
			'.lu-dialog{width:min(1120px,96vw);max-height:min(90vh,920px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#111);color:var(--dsw-alias-label-primary,#e5e5e5);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:16px;box-shadow:0 32px 90px rgba(0,0,0,.5);overflow:hidden;animation:lu-rise .16s ease-out}',
			'@keyframes lu-fade{from{opacity:0}to{opacity:1}}',
			'@keyframes lu-rise{from{opacity:0;transform:translateY(8px) scale(.995)}to{opacity:1;transform:none}}',
			'.lu-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 22px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));background:var(--dsw-alias-bg-layer-1,#171717)}',
			'.lu-title{font-size:16px;font-weight:650;letter-spacing:.01em;line-height:1.2}',
			'.lu-sub{margin-top:5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-sub i{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e);flex:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 18%,transparent)}',
			'.lu-sub i.busy{background:var(--dsw-alias-state-warn-primary,#f59e0b);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 18%,transparent)}',
			'.lu-sub em{font-style:normal;color:var(--dsw-alias-state-error-primary,#ef4444)}',
			'.lu-head-right{display:flex;align-items:center;gap:8px;flex:none}',
			'.lu-seg{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:9px;background:var(--dsw-alias-bg-layer-2,#1e1e1e)}',
			'.lu-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#a0a0a0);font:inherit;font-size:11px;line-height:1;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}',
			'.lu-seg button:hover{color:var(--dsw-alias-label-primary,#e5e5e5)}',
			'.lu-seg button.on{background:var(--dsw-alias-bg-overlay,#2a2a2a);color:var(--dsw-alias-label-primary,#e5e5e5);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}',
			'.lu-iconbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#a0a0a0);cursor:pointer;flex:none}',
			'.lu-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));color:var(--dsw-alias-label-primary,#e5e5e5)}',
			'.lu-iconbtn:focus-visible,.lu-seg button:focus-visible,.lu-toggle button:focus-visible,.lu-linkbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d9fff);outline-offset:1px}',
			'.lu-iconbtn.spin svg{animation:lu-spin .9s linear infinite}',
			'@keyframes lu-spin{to{transform:rotate(360deg)}}',
			'.lu-body{padding:18px 22px 20px;overflow:auto;min-height:0}',
			'.lu-hero{display:grid;grid-template-columns:minmax(230px,290px) minmax(0,1fr);gap:26px;align-items:end}',
			'.lu-cache-hit{display:flex;align-items:baseline;gap:4px;margin-bottom:3px}',
			'.lu-cache-hit-label{font-size:9px;letter-spacing:.05em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-cache-hit-value{font-size:12px;line-height:1.2;font-weight:600;color:var(--dsw-alias-state-success-primary,#3fbf7f);font-variant-numeric:tabular-nums}',
			'.lu-eyebrow{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-weight:600}',
			'.lu-cost{margin-top:5px;font-size:34px;line-height:1.05;font-weight:700;letter-spacing:-.025em;font-variant-numeric:tabular-nums}',
			'.lu-cost small{margin-left:6px;font-size:10.5px;font-weight:500;letter-spacing:.05em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-cost-sub{margin-top:7px;font-size:11px;color:var(--dsw-alias-label-secondary,#a0a0a0);font-variant-numeric:tabular-nums;display:flex;gap:6px;flex-wrap:wrap}',
			'.lu-search{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;margin-top:6px;font-size:10px;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-variant-numeric:tabular-nums}',
			'.lu-search-tag{font-size:9px;letter-spacing:.05em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-search-cost{color:var(--dsw-alias-state-success-primary,#3fbf7f);font-weight:600}',
			'.lu-search-note{opacity:.8}',
			'.lu-chart-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#a0a0a0)}',
			'.lu-muted{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-variant-numeric:tabular-nums}',
			'.lu-chart{display:flex;align-items:flex-end;gap:2px;height:104px;margin-top:9px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
			'.lu-col{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center;cursor:default}',
			'.lu-bar{width:100%;max-width:34px;min-height:2px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,var(--dsw-alias-brand-primary,#4d9fff),color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 24%,transparent));opacity:.55;transition:opacity .12s ease}',
			'.lu-col:hover .lu-bar,.lu-col.now .lu-bar{opacity:.95}',
			'.lu-axis{position:relative;height:13px;margin-top:5px}',
			'.lu-axis span{position:absolute;transform:translateX(-50%);font-size:8.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap}',
			'.lu-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;margin-top:18px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
			'.lu-metric{padding:9px 12px 9px 0;min-width:0}',
			'.lu-metric + .lu-metric{border-left:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));padding-left:12px}',
			'.lu-metric-label{display:block;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap}',
			'.lu-metric-value{display:block;margin-top:2px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
			'.lu-section{margin-top:20px;min-width:0}',
			'.lu-first{margin-top:0}',
			'.lu-cols{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:22px;margin-top:20px}',
			'.lu-cols .lu-section{margin-top:0}',
			'.lu-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}',
			'.lu-sec-title{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-primary,#e5e5e5)}',
			'.lu-sec-sub{font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-share-btn{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;font-size:9.5px;padding:0;cursor:pointer;border-bottom:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.45))}',
			'.lu-share-btn:hover{color:var(--dsw-alias-brand-primary,#4d9fff);border-bottom-color:currentColor}',
			'.lu-sec-right{display:flex;align-items:center;gap:8px}',
			'.lu-toggle{display:inline-flex;gap:2px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,#1e1e1e);border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
			'.lu-toggle button{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;font-size:10px;padding:3px 8px;border-radius:5px;cursor:pointer;white-space:nowrap}',
			'.lu-toggle button.on{background:var(--dsw-alias-bg-overlay,#2a2a2a);color:var(--dsw-alias-label-primary,#e5e5e5);font-weight:600}',
			'.lu-list{border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
			'.lu-list.scroll{max-height:296px;overflow:auto;padding-right:4px}',
			'.lu-row{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));min-width:0}',
			'.lu-row:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#171717) 72%,transparent)}',
			'.lu-dot{width:6px;height:6px;border-radius:50%;flex:none}',
			'.lu-row-main{flex:1;min-width:0}',
			'.lu-row-name{font-size:11.5px;font-weight:550;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.lu-row-sub{font-size:9.5px;line-height:1.3;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.lu-row-out{min-width:62px;text-align:right;font-size:10.5px;color:var(--dsw-alias-label-secondary,#a0a0a0);font-variant-numeric:tabular-nums;flex:none}',
			'.lu-row-cost{min-width:64px;text-align:right;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;flex:none}',
			'.lu-share{height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.18));margin-top:-1px;position:relative;overflow:hidden}',
			'.lu-share i{display:block;height:1px;background:var(--dsw-alias-brand-primary,#4d9fff);opacity:.55}',
			'.lu-empty{padding:22px 0;text-align:center;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-ws-row{padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));min-width:0}',
			'.lu-ws-top{display:flex;align-items:baseline;gap:8px;min-width:0}',
			'.lu-ws-name{flex:1;min-width:0;font-size:11.5px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.lu-ws-cost{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;flex:none}',
			'.lu-ws-sub{font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
			'.lu-records{border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18))}',
			'.lu-record{display:grid;grid-template-columns:84px minmax(0,1fr) 64px 64px;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));min-width:0}',
			'.lu-record:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#171717) 72%,transparent)}',
			'.lu-rec-time{font-family:var(--ds-font-family-code,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a);white-space:nowrap}',
			'.lu-rec-model{min-width:0;display:flex;align-items:center;gap:6px}',
			'.lu-rec-model span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}',
			'.lu-rec-out{text-align:right;font-size:10.5px;color:var(--dsw-alias-label-secondary,#a0a0a0);font-variant-numeric:tabular-nums}',
			'.lu-rec-cost{text-align:right;font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums}',
			'.lu-rec-cost.muted{font-weight:400;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:20px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'.lu-linkbtn{border:0;background:transparent;color:var(--dsw-alias-brand-primary,#4d9fff);font:inherit;font-size:10px;padding:0;cursor:pointer}',
			'.lu-error{margin-top:14px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ef4444) 8%,transparent);border-radius:8px;font-size:11px;color:var(--dsw-alias-state-error-primary,#ef4444);display:flex;align-items:center;justify-content:space-between;gap:10px}',
			'.lu-loading{display:flex;align-items:center;justify-content:center;padding:60px 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
			'@media (max-width:900px){.lu-hero{grid-template-columns:1fr;gap:16px}.lu-cols{grid-template-columns:1fr;gap:20px}.lu-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.lu-metric:nth-child(4){border-left:0;padding-left:0}.lu-backdrop{padding:8px}.lu-dialog{max-height:94vh;border-radius:12px}}',
			'@media (max-width:620px){.lu-record{grid-template-columns:70px minmax(0,1fr) 62px}.lu-rec-out{display:none}.lu-head{flex-wrap:wrap}.lu-head-right{width:100%;justify-content:flex-end}.lu-foot{flex-direction:column;align-items:flex-start}}',
			'@media (prefers-reduced-motion:reduce){.lu-backdrop,.lu-dialog,.lu-bar,.lu-iconbtn.spin svg{animation:none;transition:none}}',
		].join('\n');

		const PALETTE = ['#5b9dff', '#3ecf8e', '#f5b544', '#e879a6', '#a78bfa', '#4dd4e8', '#f28b52', '#8f9bb3'];

		const ICON_CLOSE = h('svg', {
			width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
		}, h('path', {
			d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
		}));

		const ICON_REFRESH = h('svg', {
			width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
		}, h('path', {
			d: 'M13 8a5 5 0 1 1-1.46-3.54M13 3v3.2h-3.2', stroke: 'currentColor', strokeWidth: 1.4,
			strokeLinecap: 'round', strokeLinejoin: 'round',
		}));

		function pad2(value) {
			return String(value).padStart(2, '0');
		}

		function localDay(offsetDays) {
			const date = new Date();
			date.setDate(date.getDate() + offsetDays);
			return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
		}

		function scopeFor(rangeId) {
			const range = RANGES.find((item) => item.id === rangeId) ?? RANGES[0];
			const end = localDay(0);
			const start = range.days === null ? '2000-01-01' : localDay(1 - range.days);
			return { start, end };
		}

		async function fetchJson(url) {
			const response = await fetch(url, { cache: 'no-store' });
			if (!response.ok) throw new Error('HTTP ' + response.status);
			return response.json();
		}

		async function fetchUsage(rangeId) {
			const scope = scopeFor(rangeId);
			return fetchJson(`${USAGE}/query?start=${scope.start}&end=${scope.end}`);
		}

		let workspacePromise = null;
		function loadWorkspaces() {
			if (workspacePromise === null) {
				workspacePromise = fetchJson(USAGE)
					.then((snapshot) => {
						const map = {};
						for (const row of snapshot?.workspaces ?? []) {
							map[row.id] = { title: row.title || '', path: row.path || '' };
						}
						return map;
					})
					.catch(() => {
						workspacePromise = null;
						return {};
					});
			}
			return workspacePromise;
		}

		function fmtInt(value) {
			const number = Number(value);
			return Number.isFinite(number) ? Math.round(number).toLocaleString('en-US') : '0';
		}

		function fmtTokens(value) {
			const number = Number(value);
			if (!Number.isFinite(number) || number <= 0) return '0';
			if (number >= 1e12) return (number / 1e12).toFixed(2) + 'T';
			if (number >= 1e9) return (number / 1e9).toFixed(2) + 'B';
			if (number >= 1e7) return (number / 1e6).toFixed(1) + 'M';
			if (number >= 1e6) return (number / 1e6).toFixed(2) + 'M';
			if (number >= 1e4) return (number / 1e3).toFixed(1) + 'K';
			if (number >= 1e3) return (number / 1e3).toFixed(2) + 'K';
			return fmtInt(number);
		}

		function fmtMoney(value) {
			const amount = Number(value);
			if (!Number.isFinite(amount) || amount <= 0) return '$0';
			if (amount >= 1000) return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
			if (amount >= 1) return '$' + amount.toFixed(2);
			if (amount >= 0.01) return '$' + amount.toFixed(3);
			return '$' + amount.toFixed(4);
		}

		function fmtCny(value) {
			const amount = Number(value);
			if (!Number.isFinite(amount) || amount <= 0) return '¥0';
			if (amount >= 1) return '¥' + amount.toFixed(2);
			return '¥' + String(Number(amount.toFixed(4)));
		}

		function fmtTps(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0';
			return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
		}

		function fmtClock(ms) {
			if (!Number.isFinite(ms)) return '—';
			const date = new Date(ms);
			return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
		}

		function fmtTime(ms) {
			if (!Number.isFinite(ms)) return '—';
			const date = new Date(ms);
			return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
		}

		function fmtRange(scope) {
			if (scope === undefined || scope === null) return '';
			if (scope.start === scope.end) return scope.start;
			if (scope.start.slice(0, 4) === scope.end.slice(0, 4)) return `${scope.start} → ${scope.end.slice(5)}`;
			return `${scope.start} → ${scope.end}`;
		}

		function costOf(row) {
			const value = Number(row && row.cost && row.cost.total);
			return Number.isFinite(value) ? value : 0;
		}

		function providerColor(name) {
			const text = String(name ?? '');
			let hash = 0;
			for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
			return PALETTE[hash % PALETTE.length];
		}

		// 「今日」的柱状图显示最近 24 小时：用昨天的小时桶补齐今天不足 24 小时的部分。
		function mergeRolling24(previousHourly, currentHourly) {
			const current = Array.isArray(currentHourly) ? currentHourly : [];
			const previous = Array.isArray(previousHourly) ? previousHourly : [];
			const missing = Math.max(0, 24 - current.length);
			const merged = [...(missing > 0 ? previous.slice(-missing) : []), ...current];
			return merged.length > 24 ? merged.slice(-24) : merged;
		}

		/** 总处理 = 输入 + 缓存读 + 输出（趋势图与「总处理份额」口径一致）。 */
		function bucketTotal(bucket) {
			const tokens = bucket?.tokens ?? {};
			const input = Number(tokens.input) || 0;
			const cacheRead = Number(tokens.cacheRead) || 0;
			const output = Number(tokens.output) || 0;
			return input + cacheRead + output;
		}

		function buildChart(data, range) {
			if (range === 'today') {
				const hourly = Array.isArray(data?.rollingHourly) && data.rollingHourly.length > 0
					? data.rollingHourly
					: (Array.isArray(data?.hourly) ? data.hourly : []);
				if (hourly.length > 0) {
					const rows = hourly.map((bucket) => {
						const date = new Date(bucket.time);
						const hour = pad2(date.getHours());
						return {
							key: String(bucket.time),
							short: hour,
							label: `${date.getMonth() + 1}/${date.getDate()} ${hour}:00`,
							value: bucketTotal(bucket),
							cost: bucket.cost?.total,
							calls: bucket.calls ?? 0,
						};
					});
					return { rows, step: Math.max(1, Math.ceil(rows.length / 8)), caption: `${rows.length}h` };
				}
			}
			const days = (data?.daily ?? []).slice(-60);
			return {
				rows: days.map((day) => ({
					key: day.date,
					short: day.date.slice(5).replace('-', '/'),
					label: day.date,
					value: bucketTotal(day),
					cost: day.cost?.total,
					calls: day.calls ?? 0,
				})),
				step: days.length > 10 ? Math.max(1, Math.ceil(days.length / 8)) : 1,
				caption: days.length > 0 ? `${days.length}d` : '',
			};
		}

		function overallStatus(sessions) {
			if (sessions.some((row) => row.status === 'streaming')) return 'streaming';
			if (sessions.some((row) => row.status === 'retrying')) return 'retrying';
			if (sessions.some((row) => row.status === 'tool')) return 'tool';
			if (sessions.some((row) => row.status === 'running')) return 'running';
			return 'idle';
		}

		function shortSession(id) {
			const text = String(id);
			const body = text.startsWith('session-') ? text.slice(8) : text;
			return body.slice(0, 6);
		}

		/** 忽略 serverTime 与各种 age 字段：这些每秒都变，但界面不需要因此重渲染。 */
		function statsKey(stats) {
			if (stats === null) return '';
			const global = stats.global ?? {};
			const parts = [global.tps, global.peakTps, global.running, global.tracked, global.outputTotal];
			for (const row of stats.sessions ?? []) {
				parts.push(row.id, row.status, row.tps, row.peakTps, row.turnOutput, row.sessionOutput, row.model);
			}
			for (const row of stats.models ?? []) parts.push(row.model, row.outputTokens, row.peakTps);
			parts.push(stats.search?.searchCalls, stats.search?.fetchCalls, stats.search?.costCny);
			return parts.join('|');
		}

		function Metric({ label, value }) {
			return h('div', { className: 'lu-metric' },
				h('span', { className: 'lu-metric-label' }, label),
				h('b', { className: 'lu-metric-value' }, value),
			);
		}

		function SectionHead({ title, sub, right }) {
			return h('div', { className: 'lu-sec-head' },
				h('span', { className: 'lu-sec-title' }, title),
				h('div', { className: 'lu-sec-right' },
					sub === undefined ? null : h('span', { className: 'lu-sec-sub' }, sub),
					right ?? null,
				),
			);
		}

		const UsagePage = React.memo(function UsagePage({ open, onClose }) {
			const [range, setRange] = useState('today');
			const [data, setData] = useState(null);
			const [records, setRecords] = useState(null);
			const [status, setStatus] = useState(null);
			const [searchUsage, setSearchUsage] = useState(null);
			const [workspaces, setWorkspaces] = useState(null);
			const [loading, setLoading] = useState(false);
			const [error, setError] = useState('');
			const [reload, setReload] = useState(0);
			const [view, setView] = useState('model');
			const [shareMetric, setShareMetric] = useState('output');
			const closeRef = useRef(null);

			useEffect(() => {
				if (!open) return undefined;
				let stop = false;
				loadWorkspaces().then((map) => { if (!stop) setWorkspaces(map); });
				return () => { stop = true; };
			}, [open]);

			useEffect(() => {
				if (!open) return undefined;
				let stop = false;
				let timer = null;
				const scope = scopeFor(range);
				setData(null);
				setRecords(null);
				setSearchUsage(null);
				setError('');
				const load = async (first) => {
					if (first) setLoading(true);
					try {
						const previousDay = localDay(-1);
						const [query, recordPage, statusPage, previous, searchPage] = await Promise.all([
							fetchJson(`${USAGE}/query?start=${scope.start}&end=${scope.end}`),
							fetchJson(`${USAGE}/records?start=${scope.start}&end=${scope.end}&limit=12`).catch(() => null),
							fetchJson(`${USAGE}/status`).catch(() => null),
							range === 'today'
								? fetchJson(`${USAGE}/query?start=${previousDay}&end=${previousDay}`).catch(() => null)
								: Promise.resolve(null),
							fetchJson(`${LIVE}/search?start=${scope.start}&end=${scope.end}`).catch(() => null),
						]);
						if (stop) return;
						setData(previous === null ? query : { ...query, rollingHourly: mergeRolling24(previous.hourly, query.hourly) });
						setRecords(recordPage);
						setStatus(statusPage);
						setSearchUsage(searchPage);
						setError('');
					} catch (err) {
						if (!stop) setError(String((err && err.message) || err));
					} finally {
						if (!stop) setLoading(false);
					}
				};
				load(true);
				timer = setInterval(() => load(false), 30000);
				return () => {
					stop = true;
					if (timer !== null) clearInterval(timer);
				};
			}, [open, range, reload]);

			useEffect(() => {
				if (!open) return undefined;
				const onKey = (event) => {
					if (event.key === 'Escape') onClose();
				};
				document.addEventListener('keydown', onKey);
				const previousOverflow = document.body.style.overflow;
				document.body.style.overflow = 'hidden';
				const focusTimer = setTimeout(() => {
					if (closeRef.current !== null) closeRef.current.focus();
				}, 40);
				return () => {
					document.removeEventListener('keydown', onKey);
					document.body.style.overflow = previousOverflow;
					clearTimeout(focusTimer);
				};
			}, [open, onClose]);

			if (!open) return null;

			const scope = data?.scope ?? scopeFor(range);
			const totals = data?.totals ?? null;
			const costTotal = totals === null ? 0 : costOf(totals);
			const chart = buildChart(data, range);
			const maxBucket = chart.rows.reduce((max, row) => Math.max(max, row.value), 0);
			const scanning = data !== null
				? data.partial === true
				: (status?.scan?.started === true && status?.scan?.done === false);
			const scanText = scanning
				? (status?.scan && status.scan.total > 0
					? `${L.scanning} ${fmtInt(status.scan.scanned)}/${fmtInt(status.scan.total)}`
					: L.scanning)
				: L.synced;
			const avgCost = totals !== null && totals.calls > 0 ? costTotal / totals.calls : 0;
			const currency = totals?.cost?.currency || 'USD';
			const cacheHitDenom = totals === null ? 0 : (totals.input ?? 0) + (totals.cacheRead ?? 0) + (totals.cacheWrite ?? 0);
			const cacheHitRate = cacheHitDenom > 0 ? ((totals.cacheRead ?? 0) / cacheHitDenom) * 100 : null;

			const modelRows = [];
			for (const row of data?.perModel ?? []) {
				if (!(row.calls > 0 || row.output > 0 || row.input > 0 || row.cacheRead > 0)) continue;
				modelRows.push({ ...row, costTotal: costOf(row) });
			}
			modelRows.sort((a, b) => b.costTotal - a.costTotal || b.output - a.output);

			const providerMap = new Map();
			for (const row of modelRows) {
				const key = row.provider || L.unknownProvider;
				let entry = providerMap.get(key);
				if (entry === undefined) {
					entry = { key: 'provider:' + key, provider: key, models: 0, output: 0, input: 0, cacheRead: 0, calls: 0, costTotal: 0 };
					providerMap.set(key, entry);
				}
				entry.models += 1;
				entry.output += row.output || 0;
				entry.input += row.input || 0;
				entry.cacheRead += row.cacheRead || 0;
				entry.calls += row.calls || 0;
				entry.costTotal += row.costTotal;
			}
			const providerRows = [...providerMap.values()]
				.sort((a, b) => b.costTotal - a.costTotal || b.output - a.output);
			const rows = view === 'provider' ? providerRows : modelRows;
			const metricValue = (row) => shareMetric === 'total'
				? (row.input || 0) + (row.cacheRead || 0) + (row.output || 0)
				: (row.output || 0);
			const maxMetric = rows.reduce((max, row) => Math.max(max, metricValue(row)), 0);

			const listRows = rows.length === 0
				? h('div', { className: 'lu-empty' }, L.noModels)
				: rows.map((row) => {
					const isProvider = view === 'provider';
					const fallback = String(row.model ?? '');
					const separator = fallback.indexOf(' / ');
					const modelName = row.actualModel || row.requestedModel
						|| (separator >= 0 ? fallback.slice(separator + 3) : fallback);
					const name = isProvider ? row.provider : (modelName || '—');
					const sub = isProvider ? L.modelsCount(row.models) : null;
					const value = metricValue(row);
					const share = maxMetric > 0 ? Math.round(value / maxMetric * 100) : 0;
					const key = isProvider ? row.key : (row.identityKey || name);
					return h('div', { key },
						h('div', { className: 'lu-row' },
							isProvider ? h('span', { className: 'lu-dot', style: { background: providerColor(row.provider) } }) : null,
							h('div', { className: 'lu-row-main' },
								h('div', { className: 'lu-row-name', title: name }, name),
								sub === null ? null : h('div', { className: 'lu-row-sub' }, sub),
							),
							h('span', { className: 'lu-row-out', title: shareMetric === 'total' ? L.shortTotal : L.shortOut }, fmtTokens(value)),
							h('span', { className: 'lu-row-cost', title: L.costLabel }, fmtMoney(row.costTotal)),
						),
						h('div', { className: 'lu-share' }, h('i', { style: { width: share + '%' } })),
					);
				});

			const wsRows = (data?.perWorkspace ?? []).map((row) => {
				const info = workspaces !== null ? workspaces[row.workspaceId] : undefined;
				const title = info !== undefined && (info.title || info.path)
					? (info.title || info.path)
					: (row.workspaceId === 'retired:deleted' ? L.retired : String(row.workspaceId).slice(0, 8));
				return { ...row, title, path: info?.path ?? '', costTotal: costOf(row) };
			}).sort((a, b) => b.costTotal - a.costTotal || b.output - a.output).slice(0, 6);
			const wsMax = wsRows.reduce((max, row) => Math.max(max, row.output || 0), 0);

			const wsList = wsRows.length === 0
				? h('div', { className: 'lu-empty' }, L.noRecords)
				: wsRows.map((row) => {
					const share = wsMax > 0 ? Math.round((row.output || 0) / wsMax * 100) : 0;
					const meta = `${fmtTokens(row.output)} ${L.shortOut} · ${fmtInt(row.calls)} ${L.callsLabel}`;
					return h('div', { key: row.workspaceId },
						h('div', { className: 'lu-ws-row' },
							h('div', { className: 'lu-ws-top' },
								h('span', { className: 'lu-ws-name', title: row.path || row.title }, row.title),
								h('span', { className: 'lu-ws-cost' }, fmtMoney(row.costTotal)),
							),
							h('div', { className: 'lu-ws-sub', title: row.path || undefined }, row.path === '' ? meta : `${meta} · ${row.path}`),
						),
						h('div', { className: 'lu-share' }, h('i', { style: { width: share + '%' } })),
					);
				});

			const recordItems = records?.items ?? [];
			let recordsBody;
			if (records === null) {
				recordsBody = h('div', { className: 'lu-empty' }, L.recordsUnavailable);
			} else if (recordItems.length === 0) {
				recordsBody = h('div', { className: 'lu-empty' }, L.noRecords);
			} else {
				recordsBody = recordItems.slice(0, 10).map((item) => {
					const priced = item.cost?.status === 'priced';
					const when = range === 'today'
						? fmtTime(item.time)
						: `${item.date.slice(5)} ${fmtClock(item.time)}`;
					const model = item.actualModel || item.requestedModel || item.model;
					return h('div', { className: 'lu-record', key: item.id },
						h('span', { className: 'lu-rec-time' }, when),
						h('div', { className: 'lu-rec-model' },
							h('span', { className: 'lu-dot', style: { background: providerColor(item.provider) } }),
							h('span', { title: item.model }, model),
						),
						h('span', { className: 'lu-rec-out' }, fmtTokens(item.values?.output ?? 0)),
						h('span', {
							className: 'lu-rec-cost' + (priced ? '' : ' muted'),
							title: priced ? '' : (item.cost?.reason || L.unpriced),
						}, priced ? fmtMoney(item.cost.total) : '—'),
					);
				});
			}

			const subBits = [
				h('i', { key: 'dot', className: scanning ? 'busy' : '' }),
				h('span', { key: 'scan' }, scanText),
				h('span', { key: 'sep1' }, '·'),
				h('span', { key: 'range' }, fmtRange(scope)),
				h('span', { key: 'sep2' }, '·'),
				h('span', { key: 'updated' }, `${L.updated} ${data === null ? '—' : fmtClock(data.updatedAt)}`),
			];
			if (error !== '') subBits.push(h('em', { key: 'error' }, `· ${L.loadFailed}`));

			const header = h('div', { className: 'lu-head' },
				h('div', null,
					h('div', { className: 'lu-title', id: 'lu-title' }, L.usageTitle),
					h('div', { className: 'lu-sub' }, subBits),
				),
				h('div', { className: 'lu-head-right' },
					h('div', { className: 'lu-seg', role: 'tablist', 'aria-label': L.usageTitle },
						RANGES.map((item) => h('button', {
							type: 'button',
							key: item.id,
							role: 'tab',
							'aria-selected': range === item.id,
							className: range === item.id ? 'on' : '',
							onClick: () => setRange(item.id),
						}, item.label)),
					),
					h('button', {
						type: 'button',
						className: 'lu-iconbtn' + (loading ? ' spin' : ''),
						title: L.refresh,
						'aria-label': L.refresh,
						onClick: () => setReload((value) => value + 1),
					}, ICON_REFRESH),
					h('button', {
						type: 'button',
						className: 'lu-iconbtn',
						title: L.close,
						'aria-label': L.close,
						onClick: onClose,
						ref: closeRef,
					}, ICON_CLOSE),
				),
			);

			let body;
			if (data === null) {
				body = error !== ''
					? h('div', { className: 'lu-error' },
						h('span', null, `${L.loadFailed}: ${error}`),
						h('button', {
							type: 'button',
							className: 'lu-linkbtn',
							onClick: () => setReload((value) => value + 1),
						}, L.retry),
					)
					: h('div', { className: 'lu-loading' }, L.loadingShort);
			} else {
				const chartBody = chart.rows.length === 0
					? h('div', { className: 'lu-empty' }, L.noRecords)
					: chart.rows.map((row, index) => {
						const pct = maxBucket > 0
							? Math.max(row.value > 0 ? 4 : 1.5, (row.value / maxBucket) * 100)
							: 1.5;
						return h('div', {
							className: 'lu-col' + (index === chart.rows.length - 1 ? ' now' : ''),
							key: row.key,
							title: `${row.label} · ${fmtTokens(row.value)} ${L.shortTotal} · ${fmtMoney(row.cost)} · ${fmtInt(row.calls)} ${L.callsLabel}`,
						}, h('div', { className: 'lu-bar', style: { height: `${pct}%` } }));
					});

				const hero = h('div', { className: 'lu-hero' },
					h('div', null,
						cacheHitRate === null ? null : h('div', {
							className: 'lu-cache-hit',
							title: `${L.cacheLabel}: ${fmtTokens(totals.cacheRead ?? 0)} / ${fmtTokens(cacheHitDenom)}`,
						},
							h('span', { className: 'lu-cache-hit-label' }, L.cacheHitRate),
							h('span', { className: 'lu-cache-hit-value' }, `${cacheHitRate.toFixed(1)}%`),
						),
						h('div', { className: 'lu-eyebrow' }, L.costLabel),
						h('div', { className: 'lu-cost' }, fmtMoney(costTotal), h('small', null, currency)),
						h('div', { className: 'lu-cost-sub' },
							h('span', null, `${fmtTokens((totals.input ?? 0) + (totals.cacheRead ?? 0) + (totals.output ?? 0))} ${L.shortTotal}`),
							h('span', null, '·'),
							h('span', null, `${fmtInt(totals.calls)} ${L.callsLabel}`),
							avgCost > 0 ? h('span', null, '·') : null,
							avgCost > 0 ? h('span', null, `${fmtMoney(avgCost)}/${L.perCall}`) : null,
						),
						searchUsage === null ? null : h('div', {
							className: 'lu-search',
							title: L.searchApiHint,
						},
							h('span', { className: 'lu-search-tag' }, L.searchApi),
							h('span', null, `${fmtInt(searchUsage.searchCalls)} ${L.searchUnit}`),
							searchUsage.fetchCalls > 0 ? h('span', null, `· ${fmtInt(searchUsage.fetchCalls)} ${L.fetchUnit}`) : null,
							h('span', { className: 'lu-search-cost' }, fmtCny(searchUsage.costCny)),
							searchUsage.billableCalls > 0 ? null : h('span', { className: 'lu-search-note' }, L.searchBillableFrom),
						),
					),
					h('div', null,
						h('div', { className: 'lu-chart-head' },
							h('span', null, L.trendLabel),
							h('span', { className: 'lu-muted' }, chart.caption),
						),
						h('div', { className: 'lu-chart' }, chartBody),
						h('div', { className: 'lu-axis' }, chart.rows.map((row, index) => (
							index % chart.step === 0
								? h('span', {
									key: row.key,
									style: { left: `${((index + 0.5) / chart.rows.length) * 100}%` },
								}, row.short)
								: null
						))),
					),
				);

				const metrics = h('div', { className: 'lu-metrics' },
					h(Metric, { label: L.inputLabel, value: fmtTokens(totals.input) }),
					h(Metric, { label: L.cacheLabel, value: fmtTokens(totals.cacheRead) }),
					h(Metric, { label: L.outputLabel, value: fmtTokens(totals.output) }),
					h(Metric, { label: L.reasoningLabel, value: fmtTokens(totals.reasoning) }),
					h(Metric, { label: L.callsLabel, value: fmtInt(totals.calls) }),
					h(Metric, { label: L.sessionsLabel, value: fmtInt(totals.sessions) }),
				);

				const modelSection = h('div', { className: 'lu-section' },
					h(SectionHead, {
						title: L.breakdownLabel,
						sub: h('button', {
							type: 'button',
							className: 'lu-share-btn',
							title: shareMetric === 'output' ? L.shareByTotal : L.shareByOutput,
							onClick: () => setShareMetric((value) => value === 'output' ? 'total' : 'output'),
						}, shareMetric === 'output' ? L.shareByOutput : L.shareByTotal),
						right: h('div', { className: 'lu-toggle' },
							h('button', {
								type: 'button',
								className: view === 'model' ? 'on' : '',
								onClick: () => setView('model'),
							}, L.byModel),
							h('button', {
								type: 'button',
								className: view === 'provider' ? 'on' : '',
								onClick: () => setView('provider'),
							}, L.byProvider),
						),
					}),
					h('div', { className: 'lu-list scroll' }, listRows),
				);

				const workspaceSection = h('div', { className: 'lu-section' },
					h(SectionHead, {
						title: L.workspaceLabel,
						sub: L.workspacesCount((data.perWorkspace ?? []).length),
					}),
					h('div', { className: 'lu-list' }, wsList),
				);

				const recordsSection = h('div', { className: 'lu-section' },
					h(SectionHead, {
						title: L.recentLabel,
						sub: recordItems.length > 0 ? L.recentCount(Math.min(recordItems.length, 10)) : '',
					}),
					h('div', { className: 'lu-records' }, recordsBody),
				);

				body = h(React.Fragment, null,
					hero,
					metrics,
					h('div', { className: 'lu-cols' }, modelSection, workspaceSection),
					recordsSection,
					h('div', { className: 'lu-foot' },
						h('span', null, L.sourceNote),
						h('span', { className: 'lu-muted' }, `${L.updated} ${fmtClock(data.updatedAt)} · ${scanText}`),
					),
				);
			}

			const node = h('div', {
				className: 'lu-backdrop',
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
			},
				h('div', {
					className: 'lu-dialog',
					role: 'dialog',
					'aria-modal': 'true',
					'aria-labelledby': 'lu-title',
				}, header, h('div', { className: 'lu-body' }, body)),
			);

			return ReactDOM !== null && typeof ReactDOM.createPortal === 'function'
				? ReactDOM.createPortal(node, document.body)
				: node;
		});

		function LiveTps(props) {
			const wide = props.wide !== false;
			const [stats, setStats] = useState(null);
			const [failures, setFailures] = useState(0);
			const [open, setOpen] = useState(false);
			const [range, setRange] = useState('today');
			const [today, setToday] = useState(null);
			const [usage, setUsage] = useState(null);
			const [usageError, setUsageError] = useState('');
			const [usageLoading, setUsageLoading] = useState(false);
			const [refreshSeq, setRefreshSeq] = useState(0);
			const [pageOpen, setPageOpen] = useState(false);
			const [pos, setPos] = useState(null);
			const rootRef = useRef(null);

			const placePopover = () => {
				const el = rootRef.current;
				if (el === null) return null;
				const rect = el.getBoundingClientRect();
				const width = Math.min(380, window.innerWidth - 16);
				return {
					width,
					left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
					bottom: Math.max(8, window.innerHeight - rect.top + 8),
				};
			};

			const openPage = useCallback(() => {
				setOpen(false);
				setPageOpen(true);
			}, []);
			const closePage = useCallback(() => setPageOpen(false), []);

			useEffect(() => {
				let stop = false;
				let lastKey = '';
				const tick = async () => {
					if (document.hidden) return;
					try {
						const response = await fetch(`${API}/stats`, { cache: 'no-store' });
						if (!response.ok) throw new Error(String(response.status));
						const body = await response.json();
						if (stop) return;
						setFailures(0);
						const key = statsKey(body);
						if (key === lastKey) return;
						lastKey = key;
						setStats(body);
					} catch {
						if (!stop) setFailures((value) => value + 1);
					}
				};
				tick();
				const timer = setInterval(tick, 1000);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, []);

			useEffect(() => {
				if (!wide) return undefined;
				let stop = false;
				const tick = async () => {
					try {
						const body = await fetchUsage('today');
						if (!stop) setToday(body);
					} catch {
						// 保留上一份数据；错误只在整页里提示。
					}
				};
				tick();
				const timer = setInterval(tick, 60000);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, [wide, refreshSeq]);

			// 弹窗里的用量：按所选范围取数，打开期间每 30 秒自动刷新。
			useEffect(() => {
				if (!wide || !open) return undefined;
				let stop = false;
				const tick = async () => {
					setUsageLoading(true);
					try {
						const body = await fetchUsage(range);
						if (!stop) {
							setUsage(body);
							setUsageError('');
						}
					} catch (error) {
						if (!stop) setUsageError(String((error && error.message) || error));
					} finally {
						if (!stop) setUsageLoading(false);
					}
				};
				tick();
				const timer = setInterval(tick, 30000);
				return () => {
					stop = true;
					clearInterval(timer);
				};
			}, [wide, open, range, refreshSeq]);

			useEffect(() => {
				if (!open) return undefined;
				const onPointer = (event) => {
					const el = rootRef.current;
					if (el !== null && !el.contains(event.target)) setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === 'Escape') setOpen(false);
				};
				document.addEventListener('pointerdown', onPointer);
				document.addEventListener('keydown', onKey);
				return () => {
					document.removeEventListener('pointerdown', onPointer);
					document.removeEventListener('keydown', onKey);
				};
			}, [open]);

			useEffect(() => {
				if (!open) return undefined;
				const onResize = () => setPos(placePopover());
				window.addEventListener('resize', onResize);
				return () => window.removeEventListener('resize', onResize);
			}, [open]);

			useEffect(() => {
				if (!wide) setOpen(false);
			}, [wide]);

			const page = h(UsagePage, { open: pageOpen, onClose: closePage });

			if (!wide) return page;

			const offline = stats === null && failures >= 5;
			const sessions = stats?.sessions ?? [];
			const tps = stats?.global?.tps ?? 0;
			const peak = stats?.global?.peakTps ?? 0;
			const outputTotal = stats?.global?.outputTotal ?? 0;
			const running = stats?.global?.running ?? 0;
			const status = offline ? 'idle' : overallStatus(sessions);
			// 服务端已按「停止即归零」计算，这里不再按年龄二次衰减，避免两处口径打架。
			const visible = sessions.filter((row) => row.status !== 'idle' || (row.lastChunkAgeMs ?? 1e9) < 15000).slice(0, 5);
			const todayTotals = today?.totals ?? null;

			const footerMeta = [offline ? L.offline : `max ${peak > 0 ? fmtTps(peak) : '—'}`];
			if (todayTotals !== null) {
				footerMeta.push(`${L.today} ${fmtTokens(todayTotals.output)}`);
				footerMeta.push(fmtMoney(costOf(todayTotals)));
			}

			const block = h('button', {
				type: 'button',
				className: 'lt-block' + (open ? ' lt-open' : ''),
				onClick: () => {
					if (!open) {
						const next = placePopover();
						if (next !== null) setPos(next);
					}
					setOpen(!open);
				},
				'aria-expanded': open,
				'aria-label': L.title,
				title: L.hint,
			},
				h('span', { className: 'lt-line1' },
					h('span', { className: 'lt-dot lt-' + status }),
					h('span', { className: 'lt-tps' }, offline ? '—' : fmtTps(tps)),
					h('span', { className: 'lt-unit' }, ' tok/s'),
				),
				h('span', { className: 'lt-line2' }, footerMeta.join(' · ')),
			);

			if (!open) {
				return h(React.Fragment, null,
					h('div', { className: 'lt-root', ref: rootRef }, block),
					page,
				);
			}

			const sessionRows = visible.length === 0
				? h('div', { className: 'lt-empty' }, L.empty)
				: visible.map((row) => h('div', { className: 'lt-row', key: row.id },
					h('span', { className: 'lt-dot lt-' + row.status }),
					h('span', { className: 'lt-sid' }, shortSession(row.id)),
					row.model === null ? null : h('span', { className: 'lt-model', title: row.model }, row.model),
					h('span', { className: 'lt-num' }, fmtTps(row.tps)),
					h('span', { className: 'lt-peaknum' }, `⚡${fmtTps(row.peakTps)}`),
				));

			const totals = usage?.totals ?? null;
			const cost = totals?.cost ?? null;
			const perModel = (usage?.perModel ?? [])
				.filter((row) => row.calls > 0 || row.output > 0 || row.input > 0 || row.cacheRead > 0)
				.sort((a, b) => Number(b.cost?.total ?? 0) - Number(a.cost?.total ?? 0) || b.output - a.output)
				.slice(0, 6);
			const daily = (usage?.daily ?? []).slice(-30);
			const barMax = daily.reduce((max, day) => Math.max(max, bucketTotal(day)), 0);

			const metric = (label, value) => h('div', { className: 'lt-metric', key: label },
				h('span', null, label),
				h('b', null, value),
			);

			const usageBody = usageError !== ''
				? h('div', { className: 'lt-empty' }, `${L.usageUnavailable} (${usageError})`)
				: totals === null
					? h('div', { className: 'lt-empty' }, usageLoading ? L.loadingShort : L.empty)
					: h(React.Fragment, null,
						h('div', { className: 'lt-pop-big' }, fmtMoney(cost?.total), h('small', null, ` ${cost?.currency ?? 'USD'}`)),
						h('div', { className: 'lt-metrics' },
							metric(L.inputLabel, fmtTokens(totals.input)),
							metric(L.outputLabel, fmtTokens(totals.output)),
							metric(L.cacheLabel, fmtTokens(totals.cacheRead)),
							totals.reasoning > 0 ? metric(L.reasoningLabel, fmtTokens(totals.reasoning)) : null,
							metric(L.callsLabel, fmtTokens(totals.calls)),
							metric(L.sessionsLabel, fmtTokens(totals.sessions)),
						),
						daily.length > 1
							? h('div', { className: 'lt-bars' }, daily.map((day) => h('div', {
								className: 'lt-bar',
								key: day.date,
								title: `${day.date} · ${fmtTokens(bucketTotal(day))} ${L.shortTotal} · ${fmtMoney(day.cost?.total)}`,
								style: { height: `${Math.max(6, Math.round((bucketTotal(day) / (barMax || 1)) * 100))}%` },
							})))
							: null,
						perModel.length === 0
							? null
							: h('div', { className: 'lt-sec' },
								h('div', { className: 'lt-sec-head' }, L.byModelFull),
								perModel.map((row) => h('div', { className: 'lt-row', key: row.identityKey, title: row.model },
									h('span', { className: 'lt-model' }, row.actualModel ?? row.requestedModel ?? row.model),
									h('span', { className: 'lt-num' }, fmtTokens(row.output)),
									h('span', { className: 'lt-peaknum' }, fmtMoney(row.cost?.total)),
								)),
							),
					);

			const rangeTabs = h('div', { className: 'lt-range' }, RANGES.map((item) => h('button', {
				type: 'button',
				key: item.id,
				className: range === item.id ? 'on' : '',
				onClick: () => {
					setRange(item.id);
					setUsage(null);
					setUsageError('');
				},
			}, item.label)));

			const popover = h('div', {
				className: 'lt-pop',
				role: 'dialog',
				'aria-label': L.title,
				style: pos === null ? undefined : {
					width: `${pos.width}px`,
					left: `${pos.left}px`,
					bottom: `${pos.bottom}px`,
				},
			},
				h('div', { className: 'lt-pop-head' },
					h('span', { className: 'lt-pop-title' }, L.title),
					h('span', { className: 'lt-pop-meta' }, `${L.running} ${running}`),
				),
				h('div', { className: 'lt-pop-big' },
					offline ? '—' : fmtTps(tps),
					h('small', null, ' tok/s'),
				),
				h('div', { className: 'lt-pop-grid' },
					h('span', null, `${L.peak} ${peak > 0 ? fmtTps(peak) : '—'}`),
					h('span', null, `${L.output} ${fmtTokens(outputTotal)} ${L.tok}`),
					h('span', null, `${stats?.global?.tracked ?? 0} ${L.sessions}`),
				),
				h('div', { className: 'lt-sec' },
					h('div', { className: 'lt-sec-head' }, L.sessions),
					sessionRows,
				),
				h('div', { className: 'lt-sec' },
					h('div', { className: 'lt-usage-head' },
						h('button', {
							type: 'button',
							className: 'lt-sec-head lt-usage-link',
							onClick: openPage,
							title: L.openFull,
						}, L.usage, h('span', { 'aria-hidden': 'true' }, ' ↗')),
						rangeTabs,
					),
					usageBody,
					h('div', { className: 'lt-note' },
						h('span', null, usage?.partial === true ? L.scanningNote : L.sourceShort),
						h('button', {
							type: 'button',
							className: 'lt-refresh',
							onClick: () => setRefreshSeq((value) => value + 1),
						}, L.refresh),
					),
				),
			);

			return h(React.Fragment, null,
				h('div', { className: 'lt-root', ref: rootRef }, block, popover),
				page,
			);
		}

		const inject = ['slots'];

		function apply(ctx) {
			const style = document.createElement('style');
			style.dataset.plugin = 'dsh-live-tps';
			style.textContent = CSS;
			document.head.appendChild(style);
			ctx.effect(() => () => style.remove(), 'live-tps: styles');
			ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
				name: 'sidebar.footer.action',
				id: 'live-tps',
				order: -10,
			}, LiveTps));
		}

		exports.name = 'live-tps';
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
