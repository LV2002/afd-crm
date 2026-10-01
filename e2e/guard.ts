/**
 * The seatbelt.
 *
 * This suite signs in, creates leads, confirms admissions, records payments
 * and deletes things. Run against the live CRM it would do every one of
 * those to real students, and some of it — a recorded payment, a receipt
 * number — cannot be undone, because the ledger is append-only by design.
 *
 * So: local only, unless somebody deliberately says otherwise. The variable
 * is named for what it means rather than for how it is used, so that typing
 * it is a decision rather than a shrug.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function assertSafeTarget(): void {
  if (process.env.E2E_ALLOW_NON_LOCAL === "1") return;

  const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
  const host = safeHost(baseUrl);
  if (!host || !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run the end-to-end suite against ${baseUrl}.\n` +
        `These tests create leads, confirm admissions and delete records — on a live\n` +
        `instance they would do that to real students, and a recorded payment cannot\n` +
        `be undone.\n\n` +
        `Run them against a local server (npm run e2e), or against a throwaway\n` +
        `staging instance with E2E_ALLOW_NON_LOCAL=1 set deliberately.`,
    );
  }

  // The app can be served locally and still be talking to the production
  // database, which is the same disaster through a different door.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseHost = safeHost(supabaseUrl);
  if (supabaseUrl && supabaseHost && !LOCAL_HOSTS.has(supabaseHost)) {
    throw new Error(
      `Refusing to run: the server is local but NEXT_PUBLIC_SUPABASE_URL points at\n` +
        `${supabaseUrl}. A local page writing to a hosted database is the same\n` +
        `problem as running against production.\n\n` +
        `Point it at a local Supabase stack, or set E2E_ALLOW_NON_LOCAL=1 if this\n` +
        `really is a throwaway instance.`,
    );
  }
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
