import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Default Supabase magic link (PKCE): ?code=… — works when opened in the same browser that asked for it. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("exchangeCodeForSession failed", error.code, error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
