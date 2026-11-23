import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic link with token hash (custom email template): ?token_hash=…&type=email.
 * Works in any browser, unlike the PKCE ?code= link.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  if (token_hash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("verifyOtp(token_hash) failed", error.code, error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
