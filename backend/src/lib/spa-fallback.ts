const SPA_PATHS = new Set(['/', '/kiosk', '/tablet', '/dashboard', '/entities', '/functions', '/system', '/settings', '/memoria', '/backend', '/admin'])

/** Missing assets and API paths must never receive index.html with status 200. */
export function isSpaPath(path: string): boolean {
  return SPA_PATHS.has(path.length > 1 ? path.replace(/\/+$/, '') : path)
}
