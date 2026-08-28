import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Bare `import "dotenv/config"` only ever loads a file named exactly `.env`
// — it silently ignores `.env.local`, which is what docs/GETTING-STARTED.md
// tells you to create. `.env.local` listed first so it wins on overlap.
loadEnv({ path: [".env.local", ".env"] });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schemaFilter: ["public"],
});
