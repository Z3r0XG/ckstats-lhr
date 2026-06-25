/**
 * Next.js instrumentation hook — runs once when the server process boots (experimental hook enabled
 * in next.config.js for Next 14.2). This is where the in-process ingest loop is started, so
 * `next start` runs the web server AND ingestion in one process with persistent pool connections.
 *
 * POOL_INGEST chooses the driver: unset (default) → ingestion is driven by external cron (the
 * seed / update-users / cleanup scripts); =1/true → this process runs the loop itself. Gated to the
 * Node.js runtime (not edge); the dynamic import keeps the ingest module (typeorm/undici) out of
 * edge bundles.
 */
export async function register(): Promise<void> {
  // Positive NEXT_RUNTIME==='nodejs' guard around the dynamic import — Next uses this to keep the
  // node-only ingest module (typeorm/undici/fs) out of the edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const enabled =
      process.env.POOL_INGEST === '1' || process.env.POOL_INGEST === 'true';
    if (enabled) {
      const { startIngestLoop } = await import('./lib/ingest');
      startIngestLoop();
    } else {
      // Surface the driver choice so a misconfigured instance is never a silent mystery.
      console.log(
        '[ingest] in-process loop disabled (POOL_INGEST not set) — drive ingestion via cron ' +
          '(pnpm seed / update-users / cleanup), or set POOL_INGEST=1 to run it in-process.'
      );
    }
  }
}
