import { config as loadEnv } from "dotenv";

/**
 * Bare `import "dotenv/config"` only ever loads a file named exactly `.env`
 * — it silently ignores `.env.local`, which is what docs/GETTING-STARTED.md
 * tells you to create. `.env.local` listed first so it wins on overlap.
 *
 * Must be imported for its side effect as the FIRST import in any entry
 * point that needs it (seed.ts) — esbuild hoists every import's `require()`
 * above ordinary statements, so a plain `loadEnv()` call placed after other
 * imports would run too late to affect a sibling import like `./client`,
 * which reads `process.env.DATABASE_URL` during its own module evaluation.
 */
loadEnv({ path: [".env.local", ".env"] });
