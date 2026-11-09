# Changelog

## 0.2.0

First public release.

- Single sidebar footer entry: live tok/s, peak speed, today's tokens and cost.
- Popover with active sessions and today's usage summary.
- Full usage dashboard: cost, cache hit rate, token metrics, rolling 24-hour output trend,
  per-model / per-provider breakdown, workspace breakdown, recent calls.
- Embedded usage engine (`vendor/dsh-all-usage`, MIT) so no separate `dsh-all-usage`
  install is required; it steps aside automatically when the external plugin is enabled.
- DeepSeek Search / Fetch API billing in CNY per successful request, starting 2026-11-01.
- Ledger sharded over 256 files with a 5-second write debounce to keep the host responsive
  on large session histories.

## 0.1.0

Internal development version. Not published.
