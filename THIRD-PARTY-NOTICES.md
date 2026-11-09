# Third-party notices

This package redistributes the following third-party code.

## dsh-all-usage 1.1.18

- Location: `vendor/dsh-all-usage/`
- Upstream: <https://github.com/ParticleLight/dsh-all-usage>
- License: MIT (copy retained at `vendor/dsh-all-usage/LICENSE`)
- Copyright (c) 2026 dsh-all-usage contributors

It is included because the usage dashboard needs the aggregation, ledger, pricing and
session-sync engine at host runtime. The vendored copy is a **modified** version of
upstream 1.1.18. Local modifications:

1. **Provider grouping** (`lib/aggregation.js`) — providers matching
   `infer / inferai / infera / infera01 / inferaNN / infera*-vision` collapse into a single
   `infera` row so one account family does not split the same model across several rows.
   Aggregation and display only; raw session logs and billing are untouched.

2. **Weekly freeze of old sessions** (`lib/ledger.js`, `lib/session-sync.js`, `lib/plugin.js`) —
   after 03:00 local time every Tuesday, sessions whose last recorded event is before the
   previous Monday 00:00 are marked frozen in the ledger (`frozenAt` / `frozenThrough`).
   Frozen sessions are restored from the ledger on the next baseline instead of re-reading
   their logs; a new live event unfreezes a session automatically. Detail, query and re-pricing
   behaviour are unchanged.

3. **Ledger write coalescing** (`lib/ledger.js`) — the durable ledger is sharded over 256 files
   (upstream: 32) with a 5-second write debounce (upstream: 25 ms), because a single 40 MB shard
   rewrite blocked the host main thread for about 0.7 s on every flush.

`lib/client.js` (the upstream standalone dashboard UI) is **not** redistributed: this plugin
renders its own UI and the upstream sidebar button is hidden.

Re-applying the modifications after replacing `vendor/` with a newer upstream release is
documented in `vendor/dsh-all-usage/package.json`; the helper scripts used during development
are not part of this package.
