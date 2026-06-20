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
- **Node.js** 18+ runtime environment
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
HIDE_REJECTED_STATS="false"
HIDE_SHARE_COUNTS="false"
DONATION_ADDRESS="your_wallet_address_here"
DEFAULT_THEME="forest"
```

**Configuration Notes:**

**API_URL**: CKPool data source. **REQUIRED**

- Type: a single URL/path, or a JSON array (of URL strings or `{"url","label"}` objects) for multiple pools
- Values: each entry is an HTTPS URL or a local CKPool log directory (the two may be mixed); the optional `label` sets the pool's display name on the `/status` page (otherwise the hostname or directory name is used)
- Single pool: `API_URL="https://solo.ckpool.org"` — or a local log dir `/var/log/ckpool`
- Multiple pools (same coin): set a JSON array — see [Multi-Pool Aggregation](#multi-pool-aggregation)

**POOL_INGEST / POOL_INGEST_INTERVAL_SECONDS / POOL_CLEANUP_INTERVAL_SECONDS / POOL_HEALTH_STALE_SECONDS**: Control ingestion (see [Enable Ingestion](#6-enable-ingestion)). **OPTIONAL**

- `POOL_INGEST`: chooses the ingestion driver. Unset/`0` (default) = drive ingestion with external **cron** (the `seed` / `update-users` / `cleanup` scripts). `1`/`true` = run the capture+combine loop **in-process**. Use one driver or the other, not both.
- `POOL_INGEST_INTERVAL_SECONDS`: seconds between in-process cycles (default `60`).
- `POOL_CLEANUP_INTERVAL_SECONDS`: seconds between prunes of old time-series rows, folded into the in-process loop (default `7200`).
- `POOL_HEALTH_STALE_SECONDS`: a pool reads as **down** on `/status` if its data hasn't advanced within this window (default `300`).

**API_USER_AGENT / API_TOKEN / API_EXTRA_HEADERS / API_REQUEST_TIMEOUT_SECONDS**: Tune the outbound HTTP requests made to each CKPool API. **OPTIONAL**

- `API_USER_AGENT`: `User-Agent` header to send (e.g. `ckstats/1.0`). Useful when a pool rate-limits by identity — aggregating several pools multiplies request volume, so a whitelisted agent avoids throttling.
- `API_TOKEN`: sent as `Authorization: Bearer <token>`.
- `API_EXTRA_HEADERS`: a JSON object of additional headers, e.g. `{"X-Pool-Key":"abc"}` (merged last). Malformed JSON is ignored with a warning.
- `API_REQUEST_TIMEOUT_SECONDS`: abort any single request that exceeds this many seconds (omit or `0` = no app-level timeout).
- Note: these affect HTTP requests only (no effect on local-file reads); with none set, no extra headers or auth are sent.

**API_MAX_CONNS / API_KEEPALIVE_TIMEOUT_SECONDS / API_CONNECT_TIMEOUT_SECONDS / API_TCP_KEEPALIVE_SECONDS / API_CONN_MAX_AGE_SECONDS**: Persistent keep-alive connection-pool tuning for HTTP sources (no effect on local files). **OPTIONAL**

- `API_MAX_CONNS`: max concurrent connections per pool origin (default `4`); keep small so bursts don't trip a pool's connection limit.
- `API_KEEPALIVE_TIMEOUT_SECONDS`: idle keep-alive timeout (default `30`). Keep it **below** your origin/proxy idle timeout (and the poll interval), so the client refreshes a connection before the server closes it — too high and a silently-dropped socket can wedge a pool.
- `API_CONNECT_TIMEOUT_SECONDS`: connection / TLS-handshake timeout (default `5`).
- `API_TCP_KEEPALIVE_SECONDS`: OS-level TCP keepalive probe delay, to detect a dead peer without waiting on a request timeout (default `30`; `0` disables).
- `API_CONN_MAX_AGE_SECONDS`: how often the connection pool is recycled — a fresh Agent swapped in off the fetch path — bounding connection age so a stale socket can't wedge a pool (default `300`; `0` disables).

**DB_HOST**: PostgreSQL server address. **REQUIRED**

- Type: String
- Values: Hostname, IP address, or Unix socket path
- Default: `localhost`
- Examples:
  - TCP: `localhost` or `192.168.1.100`
  - Unix socket: `/var/run/postgresql`
- Note: Unix socket uses peer authentication — the OS user running the app must match the DB user, or an ident map must be configured in `pg_hba.conf` and `pg_ident.conf`

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

**HIDE_SHARE_COUNTS**: Hide the accepted/rejected share counts box on the pool stats display. **OPTIONAL**

- Type: String
- Default: `false` (shown)
- Values: `'true'` | `'false'`
- Note: Stats are shown by default; set `'true'` to hide. Legacy `SHOW_SHARE_COUNTS` is still honored for backwards compatibility.

**HIDE_REJECTED_STATS**: Hide the rejected-work box on the pool stats display. **OPTIONAL**

- Type: String
- Default: `false` (shown)
- Values: `'true'` | `'false'`
- Note: Stats are shown by default; set `'true'` to hide. Useful when rejected difficulty is skewed by a misconfigured miner. Legacy `SHOW_REJECTED_STATS` is still honored for backwards compatibility.

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
> - Use one driver, not both — running cron **and** the in-process loop against the same DB double-writes.
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
