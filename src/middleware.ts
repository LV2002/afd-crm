import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `/r` is the public registration form. It is reached by prospective
 * students who have no account and never will, so it must not be bounced
 * to /login — the form's token is its own authorisation, and it grants
 * only the right to submit.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/r"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!user && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // `/api/*` is excluded entirely rather than added to PUBLIC_PATHS: a
  // cron route (CRON_SECRET) or a future webhook (HMAC signature, CLAUDE.md
  // non-negotiable #9) authenticates itself, and neither has a Supabase
  // session cookie to check in the first place — Vercel's own cron
  // invocation of /api/cron/sla-sweep has no such cookie, so leaving `/api`
  // inside this matcher would redirect it to /login before the route
  // handler's own auth ever runs, silently breaking every cron/webhook.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
