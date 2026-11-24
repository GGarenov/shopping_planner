// GET /api/ebag/callback — eBag redirects here after the user allows access; exchanges the code for tokens.
import { NextResponse, type NextRequest } from "next/server";
import { exchangeAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { EBAG_ISSUER, EBAG_RESOURCE, getAppClient, getMetadata, saveConnection } from "@/lib/ebag/oauth";
import { FLOW_COOKIE, flowCookieOptions, openFlow } from "@/lib/ebag/flowCookie";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler("GET /api/ebag/callback", async ({ log }, req: NextRequest) => {
  const done = (q: string) => {
    if (q !== "connected=1") log.warn("ebag.connect_rejected", { result: q });
    const res = NextResponse.redirect(new URL(`/ebag?${q}`, req.url), 303);
    res.cookies.set(FLOW_COOKIE, "", { ...flowCookieOptions, maxAge: 0 });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return done(p.get("error") === "access_denied" ? "error=denied" : "error=ebag");

  const flow = openFlow(req.cookies.get(FLOW_COOKIE)?.value);
  const code = p.get("code");
  if (!flow || !code || p.get("state") !== flow.state) return done("error=state");
  const iss = p.get("iss");
  if (iss && iss.replace(/\/$/, "") !== EBAG_ISSUER) return done("error=state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== flow.userId) return done("error=state");

  try {
    const admin = createAdminClient();
    const clientInformation = await getAppClient(admin, flow.redirect);
    const tokens = await exchangeAuthorization(EBAG_ISSUER, {
      metadata: await getMetadata(),
      clientInformation,
      authorizationCode: code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirect,
      resource: new URL(EBAG_RESOURCE),
    });
    await saveConnection(
      admin,
      user.id,
      { clientInformation, redirect: flow.redirect, tokens: { ...tokens, saved_at: new Date().toISOString() } },
      true,
    );
    log.info("ebag.connected", { user: user.id });
    return done("connected=1");
  } catch (e) {
    log.error("ebag.exchange_failed", { err: e });
    return done("error=exchange");
  }
});
