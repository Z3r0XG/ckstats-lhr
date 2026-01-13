# CKSTATS-LHR

Web-based statistics dashboard for CKPool with sub-"1" difficulty support for
low hash rate miners (ESP32 devices, NerdMiners, and others).

Next.js application providing real-time and historical pool
statistics, user metrics, and worker tracking for solo mining operations.

## Key Features/Additions

- **Low Hash Rate Compatibility**: Statistics display for sub-"1" difficulties
- **Top User Hashrates**: Active miner leaderboard by current hashrate
- **Top User Difficulties**: Historical tracking of highest difficulty shares ever submitted
- **High Scores Leaderboard**: Historical tracking of highest difficulty shares ever submitted by device type
- **Online Devices Dashboard**: Real-time worker tracking by device type with counts that highlight every connected client
- **Rejected Share Percentage**: Color-coded rejection rates with visual indicators
- **Privacy Controls**: User-controlled visibility toggle for public leaderboards
- **Historical Charts**: Time-series pool and user statistics with configurable retention
- **Workers Table Enhancements**: User-agent (device) strings are shown per worker and a hide-inactive toggle keeps active miners in focus
- **Async Dashboard Refresh**: Client-side polling updates dashboard every 60 seconds without full-page reloads

## Acknowledgment

This software is a fork of CKStats by mrv777. The original project provided the
foundation for CKPool statistics tracking. We honor and acknowledge mrv777's work
that made this enhanced version possible.

**Original project:** https://github.com/mrv777/ckstats

## Compatibility

Designed for CKPool instances supporting **fractional difficulty** (sub-"1"):
- **Recommended**: [CKPool-LHR](https://github.com/Z3r0XG/ckpool-lhr)
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

Install Node.js dependencies:
```bash
pnpm install
```

### 3. Configure Environment

Create `.env` file with required settings:

```bash
# CKPool API (required)
API_URL="https://solo.ckpool.org"

# PostgreSQL connection (required)
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="username"
DB_PASSWORD="password"
DB_NAME="ckstats"

# Optional settings
SITE_NAME="My Solo Pool Stats"
MEMPOOL_LINK_TAG="custom_tag"
DB_SSL="false"
DB_SSL_REJECT_UNAUTHORIZED="true"
```

**Configuration Notes:**

**API_URL**: CKPool data source. **REQUIRED**
- Type: String
- Values: HTTPS URL or local filesystem path
- Examples:
  - Remote API: `https://solo.ckpool.org`
  - Local logs: `/var/log/ckpool`
- Note: For local files, provide the path to CKPool's log directory

**DB_HOST**: PostgreSQL server address. **REQUIRED**
- Type: String
- Values: Hostname, IP address, or Unix socket path
- Default: `localhost`
- Examples:
  - TCP: `localhost` or `192.168.1.100`
  - Unix socket: `/var/run/postgresql/`
- Note: Unix socket ignores DB_USER and DB_PASSWORD (uses peer authentication)

**SITE_NAME**: Custom title for statistics page. **OPTIONAL**
- Type: String
- Default: `CKStats`

**MEMPOOL_LINK_TAG**: Mempool.space signature tag. **OPTIONAL**
- Type: String
- Default: `solock`
- Note: Links blocks to mempool.space with signature filtering

### 4. Initialize Database

Run migrations to create database schema:
```bash
pnpm migration:run
```

Seed initial data and verify connection:
```bash
pnpm seed
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

### 6. Configure Automation

Set up cron jobs for regular statistics updates.

Open crontab editor:
```bash
crontab -e
```

Add scheduled tasks:
```
# Update pool statistics every 1 minute
*/1 * * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm seed

# Update user, worker, and online device statistics every 1 minute
*/1 * * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm update-users

# Clean up old statistics every 2 hours
5 */2 * * * cd /path/to/ckstats-lhr && /usr/local/bin/pnpm cleanup
```

> [!NOTE]
> Cron Schedule Notes:
> - Before updating the codebase, restoring the database, or running migrations, always stop cron jobs and related services to prevent race conditions and unwanted data changes. Restart cron after all updates are complete.
> - Adjust intervals based on pool size and server resources. Higher frequency = more current data but increased database load.

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

### Data Collection (Cron Jobs)
- **`pnpm seed`**: Update pool statistics, online devices, and high scores from CKPool API (pool.status)
  - **`pnpm seed --force`**: Force immediate high scores refresh without waiting for scheduled interval
- **`pnpm update-users`**: Update user and worker statistics from CKPool API
- **`pnpm cleanup`**: Remove old statistics based on retention policy

### Maintenance
- **`pnpm vacuum`**: Execute `VACUUM FULL ANALYZE` to reclaim dead row space, compact tables, and update query planner statistics. Locks tables during execution; best run during off-peak hours or planned maintenance

---

## License

GNU Public license V3. See included LICENSE for details.

