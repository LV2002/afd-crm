/**
 * Connection doctor:  npm run db:check
 *
 * Answers one question — can this machine actually reach the database in
 * DATABASE_URL, and if not, why — without Next.js, auth or React in the
 * way. Exists because a bad DATABASE_URL previously surfaced only as a
 * page that never finished loading, which looks nothing like a database
 * problem and cost days of misdiagnosis.
 *
 * Prints the connection target with the password redacted, so the output
 * is safe to paste into a chat or an issue.
 */
import "./load-env";

import postgres from "postgres";

interface Parsed {
  host: string;
  port: string;
  user: string;
  database: string;
  redacted: string;
  hasPassword: boolean;
  looksLikePlaceholder: boolean;
}

/** Never print the password. Everything else is useful and safe to show. */
export function parseConnectionString(raw: string): Parsed | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const password = decodeURIComponent(url.password);
  const user = decodeURIComponent(url.username);
  const database = url.pathname.replace(/^\//, "");
  const port = url.port || "5432";
  const redacted = `${url.protocol}//${user}:${password ? "••••••" : "(none)"}@${url.hostname}:${port}/${database}`;
  return {
    host: url.hostname,
    port,
    user,
    database,
    redacted,
    hasPassword: password.length > 0,
    // Supabase shows the password as a literal [YOUR-PASSWORD] placeholder;
    // pasting the string without substituting it is a very common mistake.
    looksLikePlaceholder: /^\[.*\]$/.test(password) || /your.?password/i.test(password),
  };
}

export function describeTarget(parsed: Parsed): string[] {
  const notes: string[] = [];
  const pooled = parsed.host.includes("pooler.supabase.com");
  const direct = /^db\..*\.supabase\.co$/.test(parsed.host);

  if (pooled) {
    notes.push("✓ Using Supabase's connection pooler — correct for Vercel and for networks without IPv6.");
    if (parsed.port === "5432") {
      notes.push("• Port 5432 on the pooler is Session mode. Transaction mode (6543) is what the docs recommend.");
    }
    if (!parsed.user.includes(".")) {
      notes.push(
        "✗ On the pooler the username must be 'postgres.<project-ref>', not plain 'postgres'. Re-copy the string from Supabase → Connect → Transaction pooler.",
      );
    }
  } else if (direct) {
    notes.push(
      "✗ This is Supabase's DIRECT connection host. It resolves IPv6-only in many regions, which Vercel cannot reach at all and many home networks cannot either. Use the Transaction pooler string instead (Supabase → Connect → Transaction pooler, port 6543).",
    );
  }

  if (!parsed.hasPassword) {
    notes.push("✗ No password in the connection string.");
  }
  if (parsed.looksLikePlaceholder) {
    notes.push(
      "✗ The password still looks like Supabase's placeholder. Replace [YOUR-PASSWORD] — brackets included — with the real password.",
    );
  }
  return notes;
}

async function main(): Promise<number> {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("✗ DATABASE_URL is not set. Add it to .env.local.");
    return 1;
  }

  const parsed = parseConnectionString(raw);
  if (!parsed) {
    console.error("✗ DATABASE_URL is not a valid URL. Copy it fresh from Supabase → Connect.");
    console.error("  Common cause: quotes around the value, or spaces around the '='.");
    return 1;
  }

  console.log(`Connecting to: ${parsed.redacted}`);
  console.log(`  host ${parsed.host}  port ${parsed.port}  user ${parsed.user}  db ${parsed.database}`);
  for (const note of describeTarget(parsed)) console.log(`  ${note}`);
  console.log("");

  // Deliberately short: the point is to fail fast and say why, not to wait.
  const sql = postgres(raw, { max: 1, prepare: false, connect_timeout: 10 });
  const started = Date.now();
  try {
    const [row] = await sql`select current_user, current_database(), version() as version`;
    const ms = Date.now() - started;
    console.log(`✓ Connected in ${ms}ms`);
    console.log(`  as ${row.current_user} on ${row.current_database}`);
    console.log(`  ${String(row.version).split(",")[0]}`);

    const [{ count }] = await sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`;
    console.log(`  ${count} tables in the public schema`);
    if (count === 0) {
      console.log("  ! No tables yet — run: npm run db:migrate && npm run db:seed");
    }
    return 0;
  } catch (error) {
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const code = (error as { code?: string }).code ?? "";
    console.error(`✗ Failed after ${secs}s${code ? ` (${code})` : ""}: ${(error as Error).message}`);
    console.error("");

    if (code === "CONNECT_TIMEOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
      console.error("  The host accepted no connection at all — packets are going nowhere,");
      console.error("  which is why nothing errored until the timeout.");
      if (parsed.host.includes("pooler.supabase.com")) {
        // Already on the pooler, so the usual IPv6 explanation doesn't apply.
        console.error(`  You are already on the pooler, so this is not the IPv6 problem. Check that`);
        console.error(`  outbound port ${parsed.port} isn't blocked by a firewall/VPN, that the project`);
        console.error("  isn't paused (Supabase pauses free projects after inactivity — the dashboard");
        console.error("  will say so and offer Restore), and that the region in the host is right.");
      } else {
        console.error("  Switch DATABASE_URL to the Transaction pooler string");
        console.error("  (Supabase → Connect → Transaction pooler, port 6543).");
      }
    } else if (code === "ENOTFOUND") {
      console.error("  That hostname doesn't resolve. Check it for typos.");
    } else if (code === "ECONNREFUSED") {
      console.error("  Something answered but refused the connection — usually a wrong port.");
    } else if (/password|authentication/i.test((error as Error).message)) {
      console.error("  Reached the server, but the password was rejected. Reset it at");
      console.error("  Supabase → Project Settings → Database → Reset database password.");
    } else if (/Tenant or user not found/i.test((error as Error).message)) {
      console.error("  The pooler didn't recognise the username. On the pooler it must be");
      console.error("  'postgres.<project-ref>', not plain 'postgres'.");
    }
    return 1;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
