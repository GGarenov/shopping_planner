import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths reachable without logging in. /api/health is for uptime monitors. /welcome is the start page; /onboarding
 * (and /install): the questions come before any account — a guest account is made only when the plan is created.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/offline", "/api/health", "/welcome", "/onboarding", "/install"];

/** Same header name as lib/api/handler.ts (kept literal: middleware runs on the edge, without server-only code). */
const REQUEST_ID = "x-request-id";

const isPublic = (pathname: string) => PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * logged-out users to /login (and logged-in users away from it). Every request gets an ID (x-request-id: Vercel's
 * own ID when there is one), passed on to route handlers and server actions for their logs and sent back to the
 * browser, so a user's error report can be matched to the log lines.
 */
export async function updateSession(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  // Rebuilt after every cookie change, so the forwarded headers include the refreshed session cookies.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID, requestId);
    return NextResponse.next({ request: { headers } });
  };
  const withId = <R extends NextResponse>(res: R) => {
    res.headers.set(REQUEST_ID, requestId);
    return res;
  };
  let response = next();

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not put code between createServerClient and getUser(): it refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    // API calls get a JSON 401 instead of an HTML redirect.
    if (pathname.startsWith("/api/")) {
      const en = request.cookies.get("lang")?.value === "en"; // LOCALE_COOKIE; same text as common.loginAgain
      const message = en ? "Please log in again." : "Влез отново в профила си.";
      return withId(NextResponse.json({ error: { code: "unauthorized", message, requestId } }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    // The start page (and the installed app's start_url) shows what the app does; deeper pages were bookmarked
    // by someone with an account, so they go to the login screen.
    url.pathname = pathname === "/" ? "/welcome" : "/login";
    url.search = "";
    return withId(NextResponse.redirect(url));
  }

  // A guest may open /login to sign in to a real account; a signed-in user has nothing to do there.
  // Anyone signed in (a guest too) is past the welcome page: "/" takes them to their plan or the questions.
  if (user && (pathname === "/welcome" || (!user.is_anonymous && pathname === "/login"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withId(NextResponse.redirect(url));
  }

  return withId(response);
}
