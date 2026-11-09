# Third-party notices

This package redistributes the following third-party code. The chain of provenance is
recorded below so any file can be traced back to its exact upstream revision and compared
byte for byte.

## dsh-all-usage 1.1.18

| Field | Value |
|---|---|
| Component | `dsh-all-usage` (host engine only) |
| Version | 1.1.18 |
| Upstream repository | <https://github.com/ParticleLight/dsh-all-usage> |
| Upstream tag | `v1.1.18` |
| Upstream commit | `3f05af7266609ed16c88296fce953dbb354f684b` |
| Source archive | <https://codeload.github.com/ParticleLight/dsh-all-usage/tar.gz/refs/tags/v1.1.18> |
| Source archive SHA-256 | `48e0cf086461b0ee5bb1b1886bef22130b117ddc054aa885dbee63d5ccdcf4f2` |
| Source archive size | 1,672,301 bytes |
| License | MIT |
| License text | `vendor/dsh-all-usage/LICENSE` (verbatim upstream copy, 1,083 bytes, identical to upstream `v1.1.18`) |
| Copyright | Copyright (c) 2026 dsh-all-usage contributors |
| Vendored path | `vendor/dsh-all-usage/` |
| Retrieved on | 2026-11-10 |

### Why it is included

The usage dashboard needs the aggregation, ledger, pricing and session-sync engine at host
runtime (routes under `/api/all-usage/*`). Vendoring it means installing this plugin does not
require the separate `dsh-all-usage` package.

### What was taken

`lib/index.js`, `lib/plugin.js`, `lib/aggregation.js`, `lib/ledger.js`, `lib/session-sync.js`,
`lib/pricing.js`, `lib/pricing-runtime.js`, `lib/balance.js`, `lib/http.js`, `lib/usage-core.js`,
`lib/version-check.js`, and `LICENSE`.

`lib/client.js` (the upstream standalone dashboard UI), `assets/`, `fixtures/`, `scripts/` and
`screenshots.json` are **not** redistributed. This plugin renders its own UI; the upstream
sidebar button is hidden by CSS.

### File-level provenance

Git blob SHA-1 of each file at upstream `v1.1.18` versus the vendored copy, so a reviewer can
confirm exactly which files carry local changes and which are untouched upstream bytes:

| File | Upstream blob | Vendored blob | Modified |
|---|---|---|---|
| `lib/aggregation.js` | `2880f6be7e44b78f65d3ee77b5790dbc78a09198` | `46161672aa8583ecfa3e506db61e94b48817f709` | yes |
| `lib/ledger.js` | `5f25850a3bb54ad7398aeaa56b85042773e65e7f` | `a5c88b3c1a7d6860895fa45d4d854d3b3be35232` | yes |
| `lib/session-sync.js` | `3336aa79f05c51cb39a42d6025c71e9e4ae238db` | `382c513ce7181cfee8142c1881d636e240bc1eb8` | yes |
| `lib/plugin.js` | `07fb2f3c81a28f3e44f44bc5f0a15a9b6f0579ff` | `9bac6fb78273811f08d330159d7d131cd17014ae` | yes |
| `lib/balance.js` | `5c771050635477c6f8a09096e9a01c3c6c6ab643` | same | no |
| `lib/http.js` | `cc33dc60bfa89cad03caebf8b3bafb37dba5cc55` | same | no |
| `lib/index.js` | `dd890e5ed12cf9861fe084498a96768099202492` | same | no |
| `lib/pricing.js` | `cb16fd366487f3aeb2af801334e3ec6bab41e840` | same | no |
| `lib/pricing-runtime.js` | `eea3cd7eb0a21339f620f4bc6172af9fea4ef708` | same | no |
| `lib/usage-core.js` | `96ef20ced575d896e884b5e6a94763a0ea17c650` | same | no |
| `lib/version-check.js` | `fbd30c7929bbec45be5a1d2adea5efba76271f23` | same | no |
| `LICENSE` | upstream text | unchanged verbatim | no |

Reproduce the comparison after downloading the archive above:

```bash
tar -xzf dsh-all-usage.tar.gz
# per file: sha1 of "blob <len>\0<content>" equals the Upstream blob column
git hash-object dsh-all-usage-1.1.18/lib/aggregation.js
```

### Local modifications

1. **Provider grouping** — `lib/aggregation.js`
   Providers matching `infer / inferai / infera / infera01 / inferaNN / infera*-vision` collapse
   into a single `infera` row so one account family does not split the same model across several
   rows. Aggregation and display only; raw session logs and billing are untouched.
   Added: `PROVIDER_GROUP_RULES`, `groupedProvider()`; used in `makeIdentity` and the
   `coerceIdentity` normalisation path.

2. **Weekly freeze of old sessions** — `lib/ledger.js`, `lib/session-sync.js`, `lib/plugin.js`
   After 03:00 local time every Tuesday, sessions whose last recorded event is before the
   previous Monday 00:00 are marked frozen in the ledger (`frozenAt` / `frozenThrough`).
   Frozen sessions are restored from the ledger on the next baseline instead of re-reading their
   logs; a new live event unfreezes a session automatically. Query results, records and
   re-pricing are unchanged.
   Added: `frozenAt` / `frozenThrough` round-trip in `normalizeLedgerRecord`; a frozen fast path
   in `scanOneSession`; `unfreezeLedgerRecord`, `freezeOldSessions`, `maybeFreeze`,
   `scheduleFreezeTimer` in `session-sync.js`; `sessionsFrozen` counter and `freezeTimer`
   lifetime in `plugin.js`.

3. **Ledger write coalescing** — `lib/ledger.js`
   The durable ledger is sharded over 256 files (upstream: 32) with a 5-second write debounce
   (upstream: 25 ms), because on a large history a single 40 MB shard rewrite blocked the host
   main thread for about 0.7 s on every flush. Shard unit name is `all_usage_ledger_v2`.

### Updating

Replace `vendor/dsh-all-usage/` with a newer upstream release, then re-apply the three
modifications above and regenerate the table. Upstream `CHANGELOG.md` is the reference for what
changed between versions; the modified surface is listed per file, so a diff against the new
tag shows immediately whether a modification still applies cleanly.

### Not distributed

The helper scripts used during development (`tools/` in the author's working copy) are excluded
from this repository and from the published npm package.
