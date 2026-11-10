# Changelog

## 0.2.3

The footer peak now records the sum of all sessions, not the fastest single session.

- `globalPeakTps` is updated in `snapshot()` from the summed live rate. It used to be raised
  inside `recordPeak()` from each session's own peak, so it could never exceed the fastest
  single session — with several sessions streaming at once the "max" read far too low.
- Per-session peak and per-model peak keep their original meaning (the session's own peak).
- Exposed the aggregate rule in `global.peakTps`; a unit case now asserts
  `global.peakTps > fastestSessionPeak × 1.5` when two sessions stream at the same rate.

## 0.2.2

Fix the opposite problem introduced in 0.2.1: the readout could sit at 0 while tokens were
still arriving.

- Compute the rate over a divisor clamped to `[2 s, 5 s]` instead of `now - firstSample`.
  Using the real span made a buffered flush (dozens of chunks arriving within tens of
  milliseconds) read as several thousand tok/s; using a span threshold then made the very next
  sample read as 0. The clamped divisor is stable in both directions.
- Remove the sample-count/span warmup gate that caused the 0; a single burst now reports a
  plausible rate instead of nothing.
- `STALL_MS` 2000 → 2500 and a `HOLD_MS` (1.5 s) carry-over so the value does not flash 0
  between two samples of the same stream.
- Expose `minDivisorMs`, `stallMs`, `holdMs`, and a `diag` block (frames / deltas / tokens) on
  `/live-tps/v1/stats` so this class of bug is observable instead of guessed at.

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
