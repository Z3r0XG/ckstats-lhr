# CK Stats LHR (Low Hash Rate) Edition

This project is forked from the original awesome CKStats code by mrv777 (https://github.com/mrv777/ckstats). CKStats is designed to display Pool and User statistics for CKPool Solo (https://github.com/golden-guy/ckpool-solo). With low hash rate versions of CKPool being forked (primarily for nerdminers and other LHR devices), CKStats needed to be tweaked to be able to ingest and process values based on much smaller difficulties (less than 1), while still supporting normal difficulty tracking. This was tested against goldenguy's LHR version of CKPool Solo (https://github.com/golden-guy/ckpool-solo) but may work with others. 

ORIGINAL (SLIGHTLY MODIFIED) INSTRUCTIONS:

## Features

- Real-time pool statistics
- Historical data chart
- Responsive design with themed display
- User and worker information

## Technologies Used

- Next.js
- Tailwind CSS
- daisyUI
- Recharts
- TypeORM

## Deployment

1. Clone the repository (git clone https://github.com/Z3r0XG/ckstats-lhr.git)
2. Install pnpm: `curl -fsSL https://get.pnpm.io/install.sh | bash`
3. Install packages if needed: `sudo apt install postgresql postgresql-contrib nodejs nginx`
4. Go to the directory: `cd ckstats-lhr`
5. Set up the environment variables in `.env`
  - Example:
   ```
   API_URL="https://solo.ckpool.org"
   DB_HOST="server"
   DB_PORT="port"
   DB_USER="username"
   DB_PASSWORD="password"
   DB_NAME="database"
   ```
   Replace `username`, `password`, `server`, `port`, `database` with your actual PostgreSQL credentials, server details, and database names.
   You can also set the DB_SSL to true if you want to use SSL and set the DB_SSL_REJECT_UNAUTHORIZED to true if you want to reject untrusted SSL certificates (like self-signed certificates).
   If PostgreSQL is running locally, you can make `DB_HOST` `/var/run/postgresql/` (which connects via a Unix socket).  The username and password are then ignored (authentication is done based on the Unix user connection to the socket).
   If ckpool is running locally you can make `API_URL` the path to the logs directory.  For example `/home/ckpool-testnet/solobtc/logs`.
   
6. Install dependencies: `pnpm install`
7. Run database migrations: `pnpm migration:run`
8. Seed the database and test the connection: `pnpm seed`
9. Build the application: `pnpm build`
10. Start the production server: `pnpm start`
11. Set up cronjobs for regular updates:
   - Open the crontab editor: `crontab -e`
   - Add lines to run the scripts.  Example:
     ```
     */1 * * * * cd /path/to/your/project && /usr/local/bin/pnpm seed
     */1 * * * * cd /path/to/your/project && /usr/local/bin/pnpm update-users
     5 */2 * * * cd /path/to/your/project && /usr/local/bin/pnpm cleanup
     ```
   - Save and exit the editor
   
   These cronjobs will run the `seed` and `update-users` scripts every 1 minute to populate the database and clean up old statistics every 2 hours.


## Scripts

- `pnpm dev`: Start the development server
- `pnpm build`: Build the production application
- `pnpm start`: Start the production server
- `pnpm lint`: Run ESLint
- `pnpm lint:fix`: Run ESLint and fix issues
- `pnpm seed`: Save/Update pool stats to database
- `pnpm update-stats`: Update pool statistics #Currently not used
- `pnpm update-users`: Update user and worker information
- `pnpm cleanup`: Clean up old statistics
- `pnpm test`: Run tests
- `pnpm test:watch`: Run tests in watch mode
- `pnpm migration:run`: Run TypeORM database migrations
- `pnpm migration:run:skip`: Run TypeORM database migrations skipping the initial migration

## Client Error Reporting

This project includes a lightweight client-side error reporting endpoint.

- Endpoint: `POST /api/client-logs`
- Authentication: Optional `CLIENT_LOG_TOKEN` environment variable. If set, requests must include header `x-client-log-token: <token>`.
- Size limits: Payloads larger than 64 KiB are rejected with `413 Payload Too Large`. A basic in-memory rate limiter is enabled to limit request frequency.
- Logging: Reports are emitted to stderr prefixed with `[client-log]` as structured JSON, suitable for collection by systemd/journald.

View logs (example)
- `journalctl -f | grep '\[client-log\]'`
- For a specific service unit: `journalctl -u <unit> -f | grep '\[client-log\]'`

Test examples
- Without token:
  - `curl -v -X POST -H 'Content-Type: application/json' -d '{"message":"test"}' http://localhost:3000/api/client-logs`
- With token:
  - `curl -v -X POST -H 'Content-Type: application/json' -H 'x-client-log-token: your-token' -d '{"message":"test"}' http://localhost:3000/api/client-logs`

## License

GPL-3.0 license
