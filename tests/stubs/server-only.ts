/**
 * Stands in for the `server-only` package under Vitest.
 *
 * The real one throws on import outside a React Server Component so that
 * a build fails rather than shipping server code to a browser. A Node
 * test run has no browser to protect and no build to fail, so importing
 * it there is a false positive — Next.js still enforces the genuine
 * check at build time, which is where it counts.
 */
export {};
