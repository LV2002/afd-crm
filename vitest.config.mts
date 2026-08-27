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
    },
  },
  test: {
    environment: "node",
    // RLS tests do real round trips against Postgres, including a schema
    // lookup pass in beforeAll — the default 5s hook timeout is too tight.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
