import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // RLS tests do real round trips against Postgres, including a schema
    // lookup pass in beforeAll — the default 5s hook timeout is too tight.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});
