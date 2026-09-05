import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Matches tsconfig.json's "@/*": ["./src/*"] — needed so source files
    // under src/ can use the same @/ imports whether they're loaded by
    // Next.js or by a standalone Vitest test.
    alias: {
      "@": path.resolve(__dirname, "src"),
      /**
       * `server-only` throws the moment it is imported outside a React
       * Server Component, which is exactly what a Vitest run is. The
       * package exists to fail a BUILD that would ship server code to a
       * browser; under Node there is no browser to protect, so it is
       * stubbed out here. Next.js still enforces the real thing at build
       * time, which is the check that actually matters.
       */
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    /**
     * Test files share one real Postgres, and several suites deliberately
     * scan the WHOLE `leads` table because that is what their production
     * code does (the retargeting syncs, correctly, for AFD's volume). Run
     * in parallel, one file's cleanup can delete a row another file's scan
     * has already read, producing a foreign-key violation unrelated to
     * anything either test is asserting.
     *
     * docs/DECISIONS.md previously accepted that flake on the grounds it
     * had never been seen twice; it since has, and adding the registration
     * suite — which creates and deletes leads — makes it likelier still.
     * Serial file execution costs about 16s (9s -> 25s) and removes the
     * class entirely. These suites are what prove the RLS boundaries hold,
     * so a result that cannot be trusted is worth far less than the time
     * saved. Tests WITHIN a file still run normally.
     */
    fileParallelism: false,
    // RLS tests do real round trips against Postgres, including a schema
    // lookup pass in beforeAll — the default 5s hook timeout is too tight.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
