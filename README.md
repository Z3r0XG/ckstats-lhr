# CKSTATS-LHR

Web-based statistics dashboard for CKPool with sub-"1" difficulty support for
low hash rate miners (ESP32 devices, NerdMiners, and others).

Next.js application providing real-time and historical pool
statistics, user metrics, and worker tracking for solo mining operations.

## Key Features/Additions

- **Multi-Pool Aggregation**: Combine multiple CKPool instances of the **same coin** into one unified view — user/worker counts deduplicated by identity (a wallet or worker seen on several pools counts once), additive metrics (hashrate, shares, accepted/rejected) summed, and best-ever difficulty, last-share, and high scores preserved across pools
- **In-Process Ingestion**: Optionally run the capture-and-combine loop inside the server (`POOL_INGEST=1`, no cron needed) with old-stats pruning folded in — or drive the same cycle from external cron; operator's choice
- **Stale-Resilient Collection**: Pools are polled independently — an unreachable pool keeps its last-known stats (served stale, never zeroed) so an outage never deflates the combined totals
- **Pool Status Page** (`/status`): Per-pool up/down, uptime, connections, hashrate, and accepted/best difficulty, plus service-level health and data freshness on the dashboard
- **Flexible Data Sources**: Each pool can be a remote CKPool HTTPS API or a local CKPool log directory (the two are mixable), with tunable User-Agent, auth token, extra headers, and request timeout
- **Low Hash Rate Compatibility**: Statistics display for sub-"1" difficulties
- **High Scores Leaderboard**: Immutable best-ever-difficulty ledger per device/worker, preserved across pools and never lost
- **Online Devices Dashboard**: Real-time worker tracking by device type with counts that highlight every connected client
- **Rejected Share Percentage**: Color-coded rejection rates with visual indicators
- **Workers Table Enhancements**: User-agent (device) strings are shown per worker; per-worker eye icon toggle to manually show/hide individual workers; auto-hide inactive toggle hides workers with no activity in 24h; hidden workers shown in a collapsible section
- **Async Dashboard Refresh**: Client-side polling updates dashboard every 60 seconds without full-page reloads

## Acknowledgment

This software is a fork of CKStats by mrv777. The original project provided the
foundation for CKPool statistics tracking. We honor and acknowledge mrv777's work
that made this enhanced version possible.

**Original project:** https://github.com/mrv777/ckstats

## Compatibility

Designed for CKPool instances supporting **fractional difficulty** (sub-"1"):

- **Recommended**: [ckpool-lhr](https://github.com/Z3r0XG/ckpool-lhr)
- **Limited**: Original CKPool (difficulty tracking ≥1.0 only)
- **Untested**: Other CKPool forks (may work with reduced functionality)

## Technology Stack

- **Next.js 14.2+**: React framework with server-side rendering
- **TypeScript**: Type-safe development
- **TypeORM**: Database ORM with PostgreSQL
- **Tailwind CSS** + **daisyUI**: Responsive UI components
- **Recharts**: Data visualization
- **Jest**: Testing framework

---

## Prerequisites

- **PostgreSQL** 12+ database server
- **Node.js** 22.19+ runtime environment
- **pnpm** package manager
- **CKPool-LHR** or compatible CKPool instance
- **nginx** (optional)

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/Z3r0XG/ckstats-lhr.git
cd ckstats-lhr
```

### 2. Install Dependencies

Install pnpm if not already available:

```bash
curl -fsSL https://get.pnpm.io/install.sh | bash
```

Install system packages (Ubuntu/Debian):

```bash
sudo apt install postgresql postgresql-contrib nodejs nginx
```

### 2a. Configure PostgreSQL

Create the database user and database:

```bash
sudo -u postgres psql
```

Inside the PostgreSQL prompt:

```sql
CREATE USER ckstats WITH PASSWORD 'yourpassword';
CREATE DATABASE ckstats OWNER ckstats;
\q
```

To connect via Unix socket (no TCP, no password), add an ident map to `/etc/postgresql/<version>/main/pg_ident.conf`:

```
# MAPNAME       SYSTEM-USERNAME     PG-USERNAME
app_ckstats     <os-user>           ckstats
```

Then add this line to `/etc/postgresql/<version>/main/pg_hba.conf` **before** the `local all all peer` line:

```
local   ckstats   ckstats   peer   map=app_ckstats
```

Then reload PostgreSQL:

```bash
sudo systemctl reload postgresql
```

Set `DB_HOST=/var/run/postgresql` in `.env` to use the socket.

Install Node.js dependencies:

```bash
pnpm install
```

### 3. Configure Environment

Create `.env` file with required settings:

```bash
# CKPool data source (required).
# Single pool (an HTTPS URL or a local CKPool log path):
API_URL="https://solo.ckpool.org"
# ...or aggregate several pools of the SAME coin: API_URL also accepts a JSON array of URLs/paths,
# with optional display labels for the /status page (entries may mix http and local paths):
# API_URL='[{"url":"https://na.example.org","label":"NA"},{"url":"/var/log/ckpool-eu","label":"EU"}]'

# Ingestion driver (optional). Unset = drive ingestion with external cron (see Enable Ingestion);
# set POOL_INGEST=1 to run the capture+combine loop in-process instead.
POOL_INGEST="1"
POOL_INGEST_INTERVAL_SECONDS="60"
POOL_INGEST_CYCLE_TIMEOUT_SECONDS="120"
POOL_CLEANUP_INTERVAL_SECONDS="7200"
POOL_HEALTH_STALE_SECONDS="300"

# HTTP transport tuning (optional; affects HTTP sources only — defaults shown):
API_MAX_CONNS="4"
# API_REQUEST_TIMEOUT_SECONDS="5"   # opt-in; no app-level timeout by default
# API_KEEPALIVE_TIMEOUT_SECONDS="30"
# API_CONNECT_TIMEOUT_SECONDS="5"
# API_TCP_KEEPALIVE_SECONDS="30"
# API_CONN_MAX_AGE_SECONDS="300"

# PostgreSQL connection (required)
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ckstats"
DB_PASSWORD="yourpassword"
DB_NAME="ckstats"

# Optional settings
COIN="BTC"
SITE_NAME="My Solo Pool Stats"
MEMPOOL_LINK_TAG="custom_tag"
DB_SSL="false"
DB_SSL_REJECT_UNAUTHORIZED="true"
HIDE_ONLINE-DEVICES="true"
HIDE_USER_ODDS="true"
DONATION_ADDRESS="your_wallet_address_here"
DEFAULT_THEME="forest"
```

**Configuration Notes:**

**API_URL**: CKPool data source. **REQUIRED**

- Type: a single URL/path, or a JSON array (of URL strings or `{"url","label"}` objects) for multiple pools
- Values: each entry is an HTTPS URL or a local CKPool log directory (the two may be mixed); the optional `label` sets the pool's display name on the `/status` page (otherwise the hostname or directory name is used)
- Single pool: `API_URL="https://solo.ckpool.org"` — or a local log dir `/var/log/ckpool`
- Multiple pools (same coin): set a JSON array — see [Multi-Pool Aggregation](#multi-pool-aggregation)

**POOL_INGEST**: ingestion driver — unset/`0` (default) drives ingestion via external cron (`seed` / `update-users` / `cleanup`); `1`/`true` runs the capture+combine loop in-process (see [Enable Ingestion](#6-enable-ingestion)). **OPTIONAL**

**POOL_INGEST_INTERVAL_SECONDS**: seconds between in-process ingest cycles. **OPTIONAL**

- Default: `60`

**POOL_INGEST_CYCLE_TIMEOUT_SECONDS**: seconds after which a still-running ingest cycle is abandoned and its lock released so the next cycle can start. **OPTIONAL**

- Default: `120`

**POOL_CLEANUP_INTERVAL_SECONDS**: seconds between prunes of old time-series rows (folded into the in-process loop). **OPTIONAL**

- Default: `7200`
- Set to `0` to disable the in-loop prune entirely and run the `cleanup` script from system cron instead.

**POOL_HEALTH_STALE_SECONDS**: a pool reads as down on `/status` if its data hasn't advanced within this window. **OPTIONAL**

- Default: `300`

**DEBUG_ENDPOINTS**: set to `true` to enable the `/api/debug/*` routes (otherwise they return 404). `/api/debug/user/<address>` live-probes each configured pool for that address and reports `found`/`absent`/`error` per pool — for diagnosing why a user isn't ingesting. **OPTIONAL**

- Default: unset (disabled). Each call makes real outbound pool fetches, so leave it off in normal operation.

**Endpoint health check** (`pnpm check-endpoints`): probes every pool in one or more deployments' `.env` (`API_URL`) — `pool.status` + `/users` per region — and flags unreachable endpoints or the `/users` nginx mapping bug (a `301` instead of `200`/`404`). Exits non-zero on any issue, so it's usable from cron/CI after an nginx or DNS change.

```bash
pnpm check-endpoints .env                          # this deployment
pnpm check-endpoints /stats/ckstats-lhr_btc /stats/ckstats-lhr_bch   # several deployments
pnpm check-endpoints .env --addr <wallet>          # also confirm a real user resolves (found/absent)
```

**API_USER_AGENT**: `User-Agent` header sent to each CKPool API (HTTP sources only). **OPTIONAL**

**API_TOKEN**: bearer token sent as `Authorization: Bearer <token>`. **OPTIONAL**

**API_EXTRA_HEADERS**: JSON object of extra headers merged into each request, e.g. `{"X-Pool-Key":"abc"}` (malformed JSON is ignored). **OPTIONAL**

**API_REQUEST_TIMEOUT_SECONDS**: abort any single request exceeding this many seconds (omit or `0` = no app-level timeout). **OPTIONAL**

**API_MAX_CONNS**: max concurrent connections per pool origin (HTTP sources only). **OPTIONAL**

- Default: `4`

**API_KEEPALIVE_TIMEOUT_SECONDS**: idle keep-alive timeout. **OPTIONAL**

- Default: `30`

**API_CONNECT_TIMEOUT_SECONDS**: connection / TLS-handshake timeout. **OPTIONAL**

- Default: `5`

**API_TCP_KEEPALIVE_SECONDS**: OS-level TCP keepalive probe delay (`0` disables). **OPTIONAL**

- Default: `30`

**API_CONN_MAX_AGE_SECONDS**: how often the connection pool is recycled (`0` disables). **OPTIONAL**

- Default: `300`

**DB_HOST**: PostgreSQL server address. **REQUIRED**

- Type: String
- Values: Hostname, IP address, or Unix socket path
- Default: `localhost`
- Examples:
  - TCP: `localhost` or `192.168.1.100`
  - Unix socket: `/var/run/postgresql`
- Note: Unix socket uses peer authentication — the OS user running the app must match the DB user, or an ident map must be configured in `pg_hba.conf` and `pg_ident.conf`

**DB_PORT**: PostgreSQL server port. **REQUIRED**

- Default: `5432`

**DB_USER**: PostgreSQL username. **REQUIRED**

- Default: `postgres`

**DB_PASSWORD**: PostgreSQL password. **REQUIRED**

- Default: `password`

**DB_NAME**: PostgreSQL database name. **REQUIRED**

- Default: `postgres`

**DB_SSL**: enable SSL for the database connection. **OPTIONAL**

- Default: `false`
- Values: `'true'` | `'false'`

**DB_SSL_REJECT_UNAUTHORIZED**: when SSL is enabled, reject a connection presenting an invalid or self-signed certificate. **OPTIONAL**

- Default: `false`
- Values: `'true'` | `'false'`

**SITE_NAME**: Custom title for statistics page. **OPTIONAL**

- Type: String
- Default: `CKStats`

**COIN**: The coin this pool mines. Controls wallet address validation and UI labels. **OPTIONAL**

- Type: String
- Default: `BTC`
- Values: `BTC` | `BCH` | `DGB` | `CHTA` | `WJK`
- Note: `BTC` validates mainnet and testnet Bitcoin addresses. `BCH` validates both CashAddr (`bitcoincash:q...`) and legacy formats. `DGB` validates DigiByte addresses (legacy, P2SH, and bech32). `CHTA` validates Cheetahcoin addresses (`C...` P2PKH and `3...` P2SH). `WJK` validates Wojakcoin addresses (`W...` P2PKH and `3...` P2SH on mainnet; `m/n...` P2PKH and `2...` P2SH on testnet).

**MEMPOOL_LINK_TAG**: Pool tag for the mempool.space "Found Blocks" link. **OPTIONAL** (BTC only)

- Type: String
- Default: `solock`
- Note: Only shown when `COIN=BTC`. Sets the pool tag in `https://mempool.space/mining/pool/<tag>`

**HIDE\_\* flags**: Hide UI elements across the home, user, and worker pages. **OPTIONAL**

- Type: String per flag — set to `"true"` to hide; everything is shown by default.
- Naming: `HIDE_<PAGE>_<CARD>_<METRIC>_<SUBTEXT>` — a hyphen joins the words of one label, an underscore steps down a tier. Home-page flags have no page prefix; user and worker pages use `HIDE_USER_` and `HIDE_WORKER_`.
- Hierarchy: setting a parent hides all of its children — `HIDE_HASHRATES="true"` hides the whole card, `HIDE_WORK-SUBMITTED_REJECTED="true"` hides just the rejected box, `HIDE_WORK-SUBMITTED_REJECTED_PERCENTAGE="true"` hides only its subtext. A card or section whose children are all hidden collapses and the layout reflows.
- Resolved at build time — rebuild to apply changes. Header, footer, search, and nav are never hidden.

| Page   | Card / section    | Flag (parent hides all children)                                                                                      |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Home   | Stats Service     | `HIDE_STATS-SERVICE` · `_STREAMS` · `_LAST-UPDATE`                                                                    |
| Home   | Pool Service      | `HIDE_POOL-SERVICE` · `_UPTIME` · `_LAST-UPDATE`                                                                      |
| Home   | Connections       | `HIDE_CONNECTIONS` · `_USERS` (`_IDLE`) · `_WORKERS` (`_DISCONNECTED`)                                                |
| Home   | Difficulty        | `HIDE_DIFFICULTY` · `_NET-DIFF` · `_BEST-DIFF` (`_PROXIMITY`) · `_AVG-TIME`                                           |
| Home   | Work Submitted    | `HIDE_WORK-SUBMITTED` · `_EFFORT` · `_ACCEPTED` (`_PERCENTAGE`) · `_REJECTED` (`_PERCENTAGE`)                         |
| Home   | Share Counts      | `HIDE_SHARE-COUNTS` · `_TOTAL` · `_ACCEPTED` (`_PERCENTAGE`) · `_REJECTED` (`_PERCENTAGE`)                            |
| Home   | Shares Per Second | `HIDE_SHARES-PER-SECOND` · `_1M` · `_5M` · `_15M` · `_1H`                                                             |
| Home   | Hashrates         | `HIDE_HASHRATES` · `_1M` · `_5M` · `_15M` · `_1HR` · `_6HR` · `_1D` · `_7D`                                           |
| Home   | Chart             | `HIDE_CHART`                                                                                                          |
| Home   | Leaderboards      | `HIDE_LEADERBOARDS` · `_DIFFICULTIES` · `_HASHRATES` · `_LOYALTY`                                                     |
| Home   | High Scores       | `HIDE_HIGH-SCORES`                                                                                                    |
| Home   | Online Devices    | `HIDE_ONLINE-DEVICES`                                                                                                 |
| User   | Connection        | `HIDE_USER_CONNECTION` · `_WORKERS` (`_TOTAL`) · `_AUTHORISED` · `_LAST-SHARE`                                        |
| User   | Difficulty        | `HIDE_USER_DIFFICULTY` · `_ACCEPTED-WORK` (`_EFFORT`) · `_BEST-DIFF` (`_PROXIMITY`) · `_BEST-EVER` (`_PROXIMITY`)     |
| User   | Hashrates         | `HIDE_USER_HASHRATES` · `_5M` · `_1HR` · `_1D` · `_7D` (each + `_CHANGE`)                                             |
| User   | Odds              | `HIDE_USER_ODDS` · `_1-DAY` · `_1-WEEK` · `_1-MONTH` · `_1-YEAR`                                                      |
| User   | Chart             | `HIDE_USER_CHART`                                                                                                     |
| User   | Workers table     | `HIDE_USER_WORKERS`                                                                                                   |
| Worker | Connection        | `HIDE_WORKER_CONNECTION` · `_CLIENT` · `_UPTIME` · `_LAST-SHARE`                                                      |
| Worker | Difficulty        | `HIDE_WORKER_DIFFICULTY` · `_ACCEPTED-WORK` (`_EFFORT`) · `_BEST-DIFF` (`_PROXIMITY`) · `_BEST-EVER` (`_PROXIMITY`)   |
| Worker | Hashrates         | `HIDE_WORKER_HASHRATES` · `_1M` · `_5M` · `_1HR` · `_1D` · `_7D` (each + `_CHANGE`)                                   |
| Worker | Chart             | `HIDE_WORKER_CHART`                                                                                                   |
| Worker | Table             | `HIDE_WORKER_TABLE` · `_NAME` · `_CLIENT` · `_HASHRATE` · `_ACCEPTED-WORK` · `_BEST-DIFF` · `_LAST-SHARE` · `_UPTIME` |

The older `HIDE_REJECTED_STATS` flag (and the `SHOW_*` predecessors) still work as back-compat aliases — `HIDE_REJECTED_STATS` is superseded by `HIDE_WORK-SUBMITTED_REJECTED`.

**DONATION_ADDRESS**: Wallet address displayed in the footer donation link. **OPTIONAL**

- Type: String
- Default: `bc1q8qkesw5kyplv7hdxyseqls5m78w5tqdfd40lf5` (BTC) / `qz85msghggld3smflk8flv0yza4c0c5drqgdgeruug` (BCH) / `dgb1q6tf0myda7plmpksdqc8k4tf8q957z0fm0y9a5m` (DGB) / `CVXL3EHkrH8xWsv4ECtwWxJqzHQG9KujNq` (CHTA) / `WYNZktmkqQsJz9YAYRguWHAtWsyaHhzDg9` (WJK)
- Note: The payment URI scheme is derived from `COIN` (BTC → `bitcoin:`, BCH → `bitcoincash:`, DGB → `digibyte:`, CHTA → `cheetahcoin:`, WJK → `wojakcoin:`)

**DEFAULT_THEME**: Default DaisyUI theme for new visitors (no saved preference). **OPTIONAL**

- Type: String
- Default: `dim` (BCH) / `cupcake` (DGB) / `autumn` (CHTA) / `dark` (BTC and others)
- Values: Any theme name from the DaisyUI theme list (e.g. `dark`, `forest`, `light`, `dracula`)
- Note: Users who have previously selected a theme are unaffected

### 4. Initialize Database

Run migrations to create database schema:

```bash
pnpm migration:run
```

### 5. Build and Start

Build production application:

```bash
pnpm build
```

Start production server:

```bash
pnpm start
```

Application runs on `http://localhost:3000` by default.

---

### 6. Enable Ingestion

Each ingest cycle **captures** every configured pool's `pool.status` + active users (over persistent keep-alive connections, storing per-pool snapshots) and **combines** the latest snapshots into the dashboard tables (pool stats, users, workers, high scores). Pool stats and user stats come from different endpoints, so each can run on its own. Pools are captured independently — one slow or unreachable pool can't stall the others (see the resilience note under `API_URL`). Per-pool health and freshness are shown on the `/status` page.

There are two ways to drive it — pick **one**:

**A. External cron** (`POOL_INGEST` unset)

```cron
# Pool stats (pool.status) every minute
*/1 * * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm seed
# User & worker stats every minute
*/1 * * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm update-users
# Prune old statistics every 2 hours
5 */2 * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm cleanup
```

(`pnpm ingest` runs both halves in one shot if you prefer a single line instead of `seed` + `update-users`.)

**B. In-process loop** (`POOL_INGEST="1"`)

The server starts a background loop on boot that runs the full cycle every `POOL_INGEST_INTERVAL_SECONDS` and prunes old rows every `POOL_CLEANUP_INTERVAL_SECONDS` — no cron needed. Cycles never overlap. To switch from cron: remove the cron lines and set `POOL_INGEST="1"`.

Run a single cycle manually anytime (e.g. to verify a fresh install):

```bash
pnpm ingest
```

> [!NOTE]
>
> - Use one driver, not both. A per-database advisory lock keeps two ingest cycles from running against the same DB at once (the second skips), so running cron **and** the in-process loop together won't double-write — it is simply redundant.
> - Stop ingestion (the loop, or the cron lines) before restoring the database or running migrations, to avoid races.
> - Adjust the interval to pool size and server resources: shorter = more current data but more database load.

---

## Updating

```bash
# Stop ingestion first (the in-process loop, or pause the cron jobs)
git fetch && git pull
pnpm install          # pick up any new/changed dependencies
pnpm migration:run    # apply any new migrations
pnpm build
pnpm start
```

---

## Multi-Pool Aggregation

Set `API_URL` to a JSON array to aggregate several CKPool instances of the **same coin** into one combined view — a single dashboard, leaderboards, and `/status` page across all of them:

```bash
API_URL='[{"url":"https://na.example.org","label":"NA"},{"url":"https://eu.example.org","label":"EU"}]'
```

Each entry is an HTTPS URL or a local CKPool log directory (the two may be mixed); the optional `label` is the pool's display name on `/status`.

**How stats combine**

- Counts are deduplicated by identity — a wallet or worker seen on several pools counts once.
- Additive metrics (hashrate, shares, accepted/rejected) are summed.
- Best-ever difficulty and last-share are taken as the max; high scores and user records are preserved across pools.

**Resilience**

Pools are captured independently — one slow or unreachable pool can't stall the others. An unreachable pool keeps its last-known stats (served stale, never zeroed) and is shown as **down** on `/status` until it recovers, so an outage never drops the combined totals to zero.

**Operating it**

- Drive ingestion with cron or the in-process loop — see [Enable Ingestion](#6-enable-ingestion).
- HTTP request/connection tuning via the `API_*` vars; the `/status` down threshold via `POOL_HEALTH_STALE_SECONDS` (see the environment reference above).
- Only aggregate pools of the **same coin** — combining different coins is meaningless.

---

## Available Scripts

### Development

- **`pnpm dev`**: Start development server with hot reload
- **`pnpm lint`**: Run ESLint for code quality checks
- **`pnpm lint:fix`**: Run ESLint and automatically fix issues
- **`pnpm test`**: Run Jest test suite
- **`pnpm test:watch`**: Run tests in watch mode for development

### Production

- **`pnpm build`**: Build optimized production application
- **`pnpm start`**: Start production server

### Database

- **`pnpm migration:run`**: Run all pending TypeORM migrations
- **`pnpm migration:run:skip`**: Run migrations, skipping initial migration

### Data Collection

- **`pnpm ingest`**: Run a single full capture+combine cycle (both halves), then exit. The in-process loop (`POOL_INGEST="1"`) does this continuously; this is for manual runs and verifying a fresh install.
- **`pnpm seed`**: Capture + combine the **pool stats** half (`pool.status`). For the cron driver.
- **`pnpm update-users`**: Capture + combine the **user/worker stats** half. For the cron driver.
- **`pnpm cleanup`**: Remove old statistics based on the retention policy. Also folded into the in-process loop on the `POOL_CLEANUP_INTERVAL_SECONDS` cadence; run it manually for an immediate prune.

### Maintenance

- **`pnpm vacuum`**: Execute `VACUUM FULL ANALYZE` to reclaim dead row space, compact tables, and update query planner statistics. Locks tables during execution; best run during off-peak hours or planned maintenance

---

## License

GNU Public license V3. See included LICENSE for details.
