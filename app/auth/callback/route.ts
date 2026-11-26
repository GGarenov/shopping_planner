// GET /auth/callback — where Google sign-in returns (taylor_the_app/loginless.md, part 3).
//   ?code=…                              → session; a guest's link makes the same user permanent (plan stays).
//   ?error_code=identity_already_exists → this Google account already has a user here, or
//   ?error_code=email_exists            → its email does (an older email + password account):
//                                          sign in to it instead, and move the guest's data over (lib/auth/guestMerge.ts).
//                                          Supabase links Google to an account with the same confirmed email.
// Always ends on `next` with ?account=saved|failed, shown once by <SaveAccount>.
import { NextResponse, type NextRequest } from "next/server";
import { isGuest, isSocialProvider, safeNext, type AccountStatus } from "@/lib/auth/guest";
import { MERGE_COOKIE, mergeCookieOptions, mergeGuestInto, openGuest, sealGuest } from "@/lib/auth/guestMerge";
import { requestLog } from "@/lib/requestLog";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Linking failed because the Google account or its email already belongs to someone here (2026-11-26: email_exists). */
const EXISTING_ACCOUNT = new Set(["identity_already_exists", "email_exists"]);

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
    if (EXISTING_ACCOUNT.has(errorCode) && isSocialProvider(provider)) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // The merge cookie is set: we already tried signing in to that account, and it failed too (e.g. Supabase
      // won't link Google to an unconfirmed email). Stop here instead of sending the user round in a loop.
      if (req.cookies.has(MERGE_COOKIE)) {
        log.warn("auth.existing_account_failed", { code: errorCode, description: url.searchParams.get("error_description") });
        const res = back("failed");
        res.cookies.set(MERGE_COOKIE, "", { ...mergeCookieOptions, maxAge: 0 });
        return res;
      }
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
    // Supabase explains the cause here (e.g. "Unable to exchange external code" = wrong Google client secret).
    log.warn("auth.callback_error", { code: errorCode, description: url.searchParams.get("error_description") });
    return back("failed");
  }

  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    log.warn("auth.exchange_failed", { code: error?.code, status: error?.status, message: error?.message });
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
