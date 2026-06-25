import type { SerializedWorker } from '../lib/types/user';

// A worker counts as "idle" once it hasn't submitted a share in the last 24h. This single
// definition is shared by the user-page header's active count and the workers table's
// auto-hide-inactive toggle, so the header and the list always agree on what "active" means.
const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isWorkerIdle(
  worker: Pick<SerializedWorker, 'lastUpdate'>
): boolean {
  if (!worker.lastUpdate) return true;
  return Date.now() - new Date(worker.lastUpdate).getTime() > IDLE_THRESHOLD_MS;
}

export function isWorkerActive(
  worker: Pick<SerializedWorker, 'lastUpdate'>
): boolean {
  return !isWorkerIdle(worker);
}
