// POST /api/ebag/disconnect — "Прекъсни": revokes the grant at eBag (best effort) and deletes the stored tokens.
import { NextResponse, type NextRequest } from "next/server";
import { decryptJson } from "@/lib/crypto/secret";
import { getConnectionRow, revokeAtEbag, type UserConnection } from "@/lib/ebag/oauth";
import { apiHandler } from "@/lib/api/handler";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler("POST /api/ebag/disconnect", async ({ log }, req: NextRequest) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);

  const admin = createAdminClient();
  const row = await getConnectionRow(admin, user.id);
  if (row) {
    try {
      await revokeAtEbag(decryptJson<UserConnection>(row.tokens_encrypted));
    } catch (e) {
      log.warn("ebag.revoke_failed", { err: String(e) });
    }
    const { error } = await admin.from("ebag_connections").delete().eq("user_id", user.id);
    if (error) {
      log.error("ebag.disconnect_failed", { err: new Error(error.message) });
      return NextResponse.redirect(new URL("/ebag?error=disconnect", req.url), 303);
    }
  }
  log.info("ebag.disconnected", { user: user.id });
  return NextResponse.redirect(new URL("/ebag?disconnected=1", req.url), 303);
});
