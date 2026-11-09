# dsh-live-tps

A DeepSeek Harness (DSH) sidebar plugin: **live output speed** plus a **full usage dashboard** in one entry. No separate `dsh-all-usage` install required.

English | [中文](README.zh.md)

## What it does

A persistent block sits at the bottom of the sidebar with two lines:

```
● 128.4 tok/s
max 794 · today 1.51M · $5.47
```

- **Line 1** — live output speed across all active sessions (tok/s) with a status dot (running / streaming / tool call / retrying / idle).
- **Line 2** — peak speed since the host started, today's total processed tokens, today's cost.
- Click the block for a popover: live header, active session list (session id, model, speed, peak), and today's usage at a glance (cost, input/output/cache/reasoning/calls/sessions, daily bars, per-model list).
- Click **Usage ↗** in the popover for the **full dashboard**:
  - cache hit rate and total cost with currency
  - today / 7d / 30d / all ranges
  - output trend chart (today view is a rolling 24-hour window)
  - input / cache read / output / reasoning / calls / sessions metrics
  - breakdown by model or provider, toggle between "share by output" and "share by total"
  - workspace breakdown and recent call detail
  - DeepSeek search API billing in CNY, counted per successful request

## Install

### From GitHub (recommended)

```bash
dsh plugin --profile <your-profile> add "github:<owner>/dsh-live-tps"
```

For the desktop profile:

```bash
dsh plugin --profile desktop add "github:CHANGE-ME/dsh-live-tps"
```

Restart DeepSeek Harness afterwards — the client JavaScript must be reloaded.

### From npm

```bash
dsh plugin --profile desktop add dsh-live-tps
```

### From a local checkout (development)

```bash
dsh plugin --profile desktop add /path/to/dsh-live-tps
```

A local install is a symlink: client changes need a full page reload (Ctrl+R), host changes need a restart.

## Where the data comes from

| Data | Source | Persisted |
|---|---|---|
| Live tok/s | host `session/event` and `agent/assistant-stream` frames, 5-second rolling window | No, memory only |
| Usage / cost | embedded aggregation engine scanning local session logs | Yes, `~/.dsh/storages/all_usage_ledger_v2_*.json` |
| Search billing | `web_search` / `web_fetch` tool calls, counted on success | Yes, `~/.dsh/live-tps-search-usage.json` |

Everything stays on the local machine; the plugin makes no outbound requests.

## HTTP endpoints (read-only)

| Endpoint | Purpose |
|---|---|
| `GET /live-tps/v1/stats` | live speed snapshot |
| `GET /live-tps/v1/search?start=YYYY-MM-DD&end=YYYY-MM-DD` | search API call count and cost |
| `GET /api/all-usage` | full usage snapshot |
| `GET /api/all-usage/query?start=&end=` | ranged usage |
| `GET /api/all-usage/records?start=&end=&limit=` | call records |
| `GET /api/all-usage/status` | scan status |
| `GET/POST /api/all-usage/pricing` | price catalog and manual overrides |

If an external `dsh-all-usage` is installed and enabled, this plugin steps aside and does not register duplicate routes.

## Pricing

- Model costs come from the [models.dev](https://models.dev) catalog; unit prices can be overridden manually and custom model aliases can be mapped to any catalog entry.
- DeepSeek search / fetch billing follows the official rate of **CNY 5 per 1,000 successful requests**; failures and empty results are free.
- Search billing starts at 2026-11-01 00:00 (+08:00); earlier calls are counted but not charged.

## Known limitations

- Live speed is a **character heuristic** (about 1 token per CJK character, otherwise 4 characters per token), corrected to exact values once the provider reports usage.
- Live speed resets when the host restarts (process-lifetime memory); usage and search billing persist.
- Web platform only (`dsh.client.platform: web`).

## Third-party code

`vendor/dsh-all-usage/` is the host engine of [dsh-all-usage](https://github.com/ParticleLight/dsh-all-usage) 1.1.18 (MIT) with two local modifications. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

MIT — see [LICENSE](LICENSE).
