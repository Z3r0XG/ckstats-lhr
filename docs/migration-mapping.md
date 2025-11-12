# Migration mapping: bigint -> double precision

This document lists entity columns relevant to the `feat/fractional-stats` migration, the current DB type as represented in the entity decorator, the TypeScript type, and the decision taken (keep bigint vs convert to double precision). Use this as the authoritative mapping for the migration and PR notes.

Format:
- Entity: `EntityName`
  - Column: columnName
    - Entity DB type: `@Column(...)` value
    - TS type: (type in entity file)
    - Decision: keep bigint / convert to double precision
    - Notes: migration action or serialization note

---

## User
- Column: `authorised`
  - Entity DB type: `@Column('bigint', { default: '0' })`
  - TS type: `string`
  - Decision: keep bigint
  - Notes: authorization is a counter/flag stored as bigint — we serialize bigints as strings in API (preserve exactness).

## UserStats
- Column: `hashrate1m`, `hashrate5m`, `hashrate1hr`, `hashrate1d`, `hashrate7d`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision
  - Notes: fractional hashrates preserved as numbers (H/s). Use `convertHashrateFloat()` when ingesting.
- Column: `lastShare`
  - Entity DB type: `@Column('bigint', { default: '0' })`
  - TS type: `string`
  - Decision: keep bigint (serialize to string)
  - Notes: counter representing timestamps/sharenumbers; keep exact.
- Column: `workerCount`
  - Entity DB type: default `number`
  - TS type: `number`
  - Decision: keep as number (small integer)
- Column: `shares`
  - Entity DB type: `@Column('bigint', { default: '0' })`
  - TS type: `string`
  - Decision: keep bigint
- Column: `bestShare`
  - Entity DB type: `@Column('float', { default: 0 })`
  - TS type: `number`
  - Decision: keep float
- Column: `bestEver`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision
  - Notes: fractional difficulties preserved as number (double precision).

## Worker
- Column: `hashrate1m`, `hashrate5m`, `hashrate1hr`, `hashrate1d`, `hashrate7d`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision
  - Notes: per-worker fractional hashrate.
- Column: `lastUpdate`
  - Entity DB type: `timestamp`
  - TS type: `Date`
  - Decision: keep as timestamp
- Column: `shares`
  - Entity DB type: `@Column('bigint', { default: () => '0' })`
  - TS type: `string`
  - Decision: keep bigint
- Column: `bestShare`
  - Entity DB type: `@Column('float', { default: 0 })`
  - TS type: `number`
  - Decision: keep float
- Column: `bestEver`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision

## WorkerStats
- Column: `hashrate1m`, `hashrate5m`, `hashrate1hr`, `hashrate1d`, `hashrate7d`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision
- Column: `shares`
  - Entity DB type: `@Column('bigint', { default: '0' })`
  - TS type: `string`
  - Decision: keep bigint
- Column: `bestShare`
  - Entity DB type: `@Column('float', { default: 0 })`
  - TS type: `number`
  - Decision: keep float
- Column: `bestEver`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision

## PoolStats
- Column: `hashrate1m`, `hashrate5m`, `hashrate15m`, `hashrate1hr`, `hashrate6hr`, `hashrate1d`, `hashrate7d`
  - Entity DB type: `@Column('double precision', { default: 0 })`
  - TS type: `number`
  - Decision: convert to double precision
  - Notes: pool-level stats where fractional hashrates are useful for low-hash miners.
- Column: `diff`
  - Entity DB type: `@Column('float')`
  - TS type: `number`
  - Decision: keep float
- Column: `accepted`, `rejected`
  - Entity DB type: `@Column('bigint')`
  - TS type: `bigint`
  - Decision: keep bigint
- Column: `bestshare`
  - Entity DB type: `@Column('double precision')`
  - TS type: `number`
  - Decision: convert to double precision

---

Migration notes
- Migrations included:
  - `migrations/1710000000004-ChangePoolStatsBestshareToFloat.ts` (pool bestshare)
  - `migrations/1710000000005-ChangeHashratesAndBestEverToFloat.ts` (bulk ALTER TABLE to double precision)

- Down migrations round values back to bigint using `round(...)::bigint`.
- Counters (`shares`, `lastShare`, `accepted`, `rejected`, `User.authorised`) remain bigint and are serialized as strings in API responses where necessary (`serializeData`, JSON replacer for bigints).

API/ingest adjustments
- Ingestion helpers use `convertHashrateFloat()` for converting hashrate strings to numbers and `convertHashrate()` when an integer BigInt is required.
- `lib/api.ts` and the seed/update scripts now preserve numbers for numeric stats and only convert counters to strings when storing/serializing as required.

Testing & verification
- Run locally:
```bash
pnpm -w -s tsc --noEmit
pnpm test
```

DB verification (requires a dev Postgres instance):
- Ensure a dev `DATABASE_URL` is available and point `ormconfig.ts` / env accordingly.
- Run migrations (`npm`/`pnpm` migration runner) and then run the seed script. Verify no errors inserting fractional values into DB.

Rollback considerations
- Down migrations will round fractional stats to integers; data precision will be lost on downgrade. Document this in the PR and advise a backup snapshot if needed before applying to production.

---

If you want, I can now:
- commit and push these docs and remaining code changes to a feature branch and open the PR, or
- generate a PR-ready checklist and migration README for reviewers.
