// Build-time content-visibility resolver. `NEXT_PUBLIC_HIDDEN` (resolved in next.config.js from the
// HIDE_* per-element flags) is a comma-separated list of element IDs to hide. Everything is visible
// unless its ID — or an ancestor prefix — is in that list. IDs are dot-hierarchical, e.g.
// `dashboard.work.rejected.subtext`, so hiding `dashboard.work` hides every metric/subtext under it.
const HIDDEN: ReadonlySet<string> = new Set(
  (process.env.NEXT_PUBLIC_HIDDEN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

export function isVisible(id: string): boolean {
  if (HIDDEN.size === 0) return true;
  let prefix = '';
  for (const part of id.split('.')) {
    prefix = prefix ? `${prefix}.${part}` : part;
    if (HIDDEN.has(prefix)) return false;
  }
  return true;
}

/** True if any of the given element IDs is visible — for deciding whether to render a section/card
 *  at all (auto-collapse when every child is hidden). */
export function anyVisible(ids: string[]): boolean {
  return ids.some(isVisible);
}
