// GET /api/ebag/connect — starts "Свържи eBag": OAuth authorization code + PKCE (SPEC §7.4).
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { EBAG_ISSUER, EBAG_RESOURCE, getAppClient, getMetadata, redirectUri, SCOPE } from "@/lib/ebag/oauth";
import { FLOW_COOKIE, flowCookieOptions, sealFlow } from "@/lib/ebag/flowCookie";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler("GET /api/ebag/connect", async ({ log }, req: NextRequest) => {
  const back = (q: string) => NextResponse.redirect(new URL(`/ebag?${q}`, req.url), 303);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
  // Guests too (taylor_the_app/issues.md, 2): the connection is deleted with the guest after 3 days.

  try {
    const redirect = redirectUri(req.nextUrl.origin);
    const clientInformation = await getAppClient(createAdminClient(), redirect);
    const state = randomBytes(16).toString("base64url");
    const { authorizationUrl, codeVerifier } = await startAuthorization(EBAG_ISSUER, {
      metadata: await getMetadata(),
      clientInformation,
      redirectUrl: redirect,
      scope: SCOPE,
      state,
      resource: new URL(EBAG_RESOURCE),
    });
    const res = NextResponse.redirect(authorizationUrl, 303);
    res.cookies.set(FLOW_COOKIE, sealFlow({ state, verifier: codeVerifier, userId: user.id, redirect }), flowCookieOptions);
    return res;
  } catch (e) {
    log.error("ebag.connect_start_failed", { err: e });
    return back("error=start");
  }
});
