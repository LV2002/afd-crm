import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * The staff manual, inside the CRM.
 *
 * Served as the built book itself rather than wrapped in the app's
 * layout, for two reasons. It is a printed document — a serif column
 * with page breaks between chapters — and dropping that inside the
 * application chrome would fight the stylesheet and ruin the print. And
 * `docs/manual/manual.html` is a complete, self-contained HTML file
 * already; re-rendering its Markdown a second way here would be a second
 * thing to keep in step with the first.
 *
 * Signed in only, like the rest of the application. There is nothing
 * secret in a manual, but it names screens, roles and fee workflows, and
 * an internal tool's documentation is not something to leave on the open
 * web.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  try {
    /*
      Read at request time rather than imported, so rebuilding the manual
      and deploying is the whole update — no second copy in the bundle to
      drift. `next.config.ts` lists this file under
      `outputFileTracingIncludes` so it actually ships: a dynamic read is
      invisible to Next's dependency tracing, and without that line this
      route would work locally and 404 in production, which is the worst
      shape a bug can take.
    */
    const html = await readFile(join(process.cwd(), "docs/manual/manual.html"), "utf8");
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Private: it is behind a login, so no shared cache should hold
        // it. Still worth a short browser cache — it is 180 KB and people
        // flip back and forth between chapters.
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    // Said plainly, with the fix, rather than a 500. The likeliest reader
    // of this message is the person who can run the command.
    return new NextResponse(
      `<!doctype html><html lang="en"><head><meta charset="utf-8" />
       <title>Manual not built</title>
       <style>body{font-family:Georgia,serif;max-width:34em;margin:4rem auto;padding:0 1.5rem;line-height:1.6}code{font-family:monospace}</style>
       </head><body>
       <h1>The manual has not been built</h1>
       <p>The chapters live in <code>docs/manual/</code> as Markdown files, and are
       combined into one printable book by a build step that has not been run here.</p>
       <p>Run <code>npm run manual</code> and deploy again.</p>
       </body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
