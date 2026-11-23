// POST /api/ebag/disconnect — "Прекъсни": revokes the grant at eBag (best effort) and deletes the stored tokens.
import { NextResponse, type NextRequest } from "next/server";
import { decryptJson } from "@/lib/crypto/secret";
import { getConnectionRow, revokeAtEbag, type UserConnection } from "@/lib/ebag/oauth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
      console.warn("ebag revoke failed", e);
    }
    const { error } = await admin.from("ebag_connections").delete().eq("user_id", user.id);
    if (error) {
      console.error("ebag disconnect failed", error.message);
      return NextResponse.redirect(new URL("/ebag?error=disconnect", req.url), 303);
    }
  }
  return NextResponse.redirect(new URL("/ebag?disconnected=1", req.url), 303);
}
