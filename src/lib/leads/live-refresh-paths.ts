/**
 * The screens that are lists of work, and so go stale the moment a lead
 * arrives. A lead's own page, a settings form or the finance screens are
 * deliberately not here: refreshing under somebody mid-edit is worse than
 * a number being a minute old.
 */
const LIVE_PATHS = ["/dashboard", "/leads", "/follow-ups", "/unassigned"];

export function isLivePath(pathname: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  // `/leads` itself, not `/leads/<id>`, `/leads/new` or `/leads/import`.
  return LIVE_PATHS.includes(path) || path.startsWith("/dashboard/");
}
