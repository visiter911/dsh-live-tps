# dsh-live-tps

DeepSeek Harness（DSH）侧栏插件：**实时输出速度** + **完整用量面板**，一个入口，不需要额外安装 `dsh-all-usage`。

[English](README.md) | 中文

## 它能做什么

侧栏底部出现一个常驻块，两行信息：

```
● 128.4 tok/s
max 794 · 今日 1.51M · $5.47
```

- **第一行**：当前所有活跃会话的实时输出速度（tok/s），带状态点（运行中 / 流式 / 工具调用 / 重试 / 空闲）。
- **第二行**：本次宿主启动以来的峰值速度、今日总处理 token、今日费用。
- 点击块展开小浮层：实时头部、活动会话列表（会话 ID、模型、速度、峰值），以及今日用量速览（成本、输入/输出/缓存/推理/调用/会话、日柱图、按模型列表）。
- 点浮层里的「用量统计 ↗」打开**整页仪表盘**：
  - 缓存命中率、总费用（含币种）
  - 今日 / 7 天 / 30 天 / 全部 四档区间
  - 输出趋势图（今日视图为最近 24 小时滚动窗口）
  - 输入 / 缓存读 / 输出 / 推理 / 调用 / 会话 六项指标
  - 用量分布：按模型或按供应商，可切换「按输出份额 / 按总处理份额」
  - 工作区分布、最近调用明细
  - DeepSeek 搜索 API 计费（¥，按成功请求计次）

## 安装

### 从 GitHub（推荐）

```bash
dsh plugin --profile <你的 profile> add "github:<owner>/dsh-live-tps"
```

例如桌面版：

```bash
dsh plugin --profile desktop add "github:visiter911/dsh-live-tps"
```

装完**重启 DeepSeek Harness**（客户端 JS 需要重新加载）。

### 从 npm

```bash
dsh plugin --profile desktop add dsh-live-tps
```

### 从本地目录开发

```bash
dsh plugin --profile desktop add /path/to/dsh-live-tps
```

本地目录安装是软链接，改 `client.js` 后需要整页刷新（Ctrl+R），改 `index.js` 需要重启宿主。

## 数据从哪来

| 数据 | 来源 | 是否落盘 |
|---|---|---|
| 实时 tok/s | 宿主 `session/event` 与 `agent/assistant-stream` 帧，5 秒滚动窗口 | 否，纯内存 |
| 用量/成本 | 内嵌的用量聚合引擎，扫描本地会话日志 | 是，`~/.dsh/storages/all_usage_ledger_v2_*.json` |
| 搜索计费 | 监听 `web_search` / `web_fetch` 工具调用，按成功次数计 | 是，`~/.dsh/live-tps-search-usage.json` |

所有数据都留在本机，插件不发起任何外部请求。

## HTTP 端点（只读）

| 端点 | 说明 |
|---|---|
| `GET /live-tps/v1/stats` | 实时速度快照 |
| `GET /live-tps/v1/search?start=YYYY-MM-DD&end=YYYY-MM-DD` | 搜索 API 计次与费用 |
| `GET /api/all-usage` | 完整用量快照 |
| `GET /api/all-usage/query?start=&end=` | 区间用量 |
| `GET /api/all-usage/records?start=&end=&limit=` | 调用明细 |
| `GET /api/all-usage/status` | 扫描状态 |
| `GET/POST /api/all-usage/pricing` | 价目与手动价目维护 |

如果外部已安装 `dsh-all-usage`，本插件会自动让路，不重复注册路由。

## 计价

- 模型费用来自 [models.dev](https://models.dev) 目录，可手动覆盖单价或把自定义模型别名映射到任意目录条目。
- DeepSeek 搜索 / 抓取按官方 **¥5 / 1000 次成功请求**（失败与无结果不计费）。
- 搜索计费自 2026-11-01 00:00（北京时间）起算，之前只计数。

## 已知限制

- 实时速度是**字符启发式估算**（CJK 约 1 token/字，其余约 4 字符/token），提供方上报 usage 后会校正为精确值。
- 宿主重启后实时速度归零（进程级内存统计）；用量与搜索计费持久化。
- 只支持 Web 平台（`dsh.client.platform: web`）。

## 第三方代码

`vendor/dsh-all-usage/` 是 [dsh-all-usage](https://github.com/ParticleLight/dsh-all-usage) 1.1.18 的主机端引擎，MIT 许可，含两处本地修改，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。
