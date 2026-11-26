// GET /auth/callback — where Google sign-in returns (taylor_the_app/loginless.md, part 3).
//   ?code=…                              → session; a guest's link makes the same user permanent (plan stays).
//   ?error_code=identity_already_exists → this Google account already has a user here: sign in to it instead,
//                                          and move the guest's data over (lib/auth/guestMerge.ts).
// Always ends on `next` with ?account=saved|failed, shown once by <SaveAccount>.
import { NextResponse, type NextRequest } from "next/server";
import { isGuest, isSocialProvider, safeNext, type AccountStatus } from "@/lib/auth/guest";
import { MERGE_COOKIE, mergeCookieOptions, mergeGuestInto, openGuest, sealGuest } from "@/lib/auth/guestMerge";
import { requestLog } from "@/lib/requestLog";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const provider = url.searchParams.get("provider");
  const log = await requestLog({ action: "authCallback", provider });
  const back = (status: AccountStatus) => {
    const to = new URL(next, url.origin);
    to.searchParams.set("account", status);
    return NextResponse.redirect(to, 303);
  };
  const supabase = await createClient();

  const errorCode = url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (errorCode) {
    if (errorCode === "identity_already_exists" && isSocialProvider(provider)) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && isGuest(user)) {
        const redirectTo = `${url.origin}/auth/callback?${new URLSearchParams({ next, provider })}`;
        const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
        if (!error && data.url) {
          log.info("auth.guest_existing_account", {});
          const res = NextResponse.redirect(data.url, 303);
          res.cookies.set(MERGE_COOKIE, sealGuest(user.id), mergeCookieOptions);
          return res;
        }
        log.error("auth.sign_in_start_failed", { err: error ?? new Error("no URL") });
        return back("failed");
      }
    }
    // access_denied: the user pressed "Cancel" at Google — not an error worth more than a warning.
    log.warn("auth.callback_error", { code: errorCode });
    return back("failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    log.warn("auth.exchange_failed", { code: error?.code, status: error?.status });
    return back("failed");
  }

  const guestId = openGuest(req.cookies.get(MERGE_COOKIE)?.value);
  if (guestId) {
    try {
      const result = await mergeGuestInto(createAdminClient(), guestId, data.user.id);
      log.info("auth.guest_merged", { result });
    } catch (e) {
      // The sign-in itself worked; only the guest's plan didn't follow. The user can make a new one.
      log.error("auth.guest_merge_failed", { err: e });
    }
  }
  const res = back("saved");
  if (req.cookies.has(MERGE_COOKIE)) res.cookies.set(MERGE_COOKIE, "", { ...mergeCookieOptions, maxAge: 0 });
  return res;
}
