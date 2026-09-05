import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Uses the anon key plus the caller's session cookie, so
 * every query still goes through RLS as that user — this is NOT an
 * elevated-privilege client.
 *
 * Never importable from a client component: the `server-only` import
 * throws a build error if that happens.
 *
 * Wrapped in React's `cache()`, so one HTTP request builds ONE client no
 * matter how many components ask for it. Before this, a page with a
 * layout, a header widget and three server components built five clients
 * and each of them re-read the cookie jar and re-authenticated — the
 * single largest source of the "everything takes two seconds" feeling.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component with no response to write to.
            // Safe to ignore as long as middleware refreshes the session.
          }
        },
      },
    },
  );
});
