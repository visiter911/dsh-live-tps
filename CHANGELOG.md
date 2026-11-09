# Changelog

## 0.2.1

Live speed now stops the instant generation ends, instead of coasting for the rest of the
5-second window.

- Stop the meter immediately on `assistant/message`, `tool/call`, `llm/retry`, `step/end`,
  `turn/end`, and on the `end` frame of `agent/assistant-stream`. Previously only the sliding
  window expired, so the readout kept showing the last speed for up to 5 seconds and looked
  like a stall.
- Report 0 while a session has produced tokens for less than `MIN_SPAN_MS` (1 s), and after
  `STALL_MS` (2 s) without a new token — a buffered burst can no longer be divided by a
  few-millisecond span and shown as several thousand tok/s.
- A resumed stream no longer inherits the previous segment's samples, which was the source of
  a spurious spike on resume.
- Chunk timestamps that are missing fall back to the arrival time instead of being stored as
  `undefined`, which previously kept samples in the window forever.

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
- `THIRD-PARTY-NOTICES.md` records the vendored engine's provenance: upstream tag `v1.1.18`,
  commit `3f05af7`, source archive SHA-256, per-file blob hashes and the three local changes.

## 0.1.0

Internal development version. Not published.
