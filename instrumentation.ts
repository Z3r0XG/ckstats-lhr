/**
 * Next.js instrumentation hook — runs once when the server process boots (experimental hook enabled
 * in next.config.js for Next 14.2). This is where the in-process multi-pool ingest loop is started,
 * so `next start` runs the web server AND ingestion in one process with persistent pool connections.
 *
 * Gated: only on the Node.js runtime (not edge), and only when POOL_INGEST is enabled — so exactly
 * one designated instance ingests, and `next dev` / other instances don't. Dynamic import keeps the
 * ingest module (typeorm/undici) out of any non-node bundle.
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
    }
  }
}
