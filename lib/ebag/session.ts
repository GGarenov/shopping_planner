// Runs an eBag MCP session for the logged-in user inside an API route: auth, the user's tokens, connect, close,
// and the same error answers everywhere (401 login, 409 reconnect, 502 eBag down).
import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { connectEbag, type EbagApi } from "./api";
import { getConnectionRow, UserTokens } from "./oauth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const fail = (status: number, error: string, reason?: string) => NextResponse.json({ error, reason }, { status });

export async function withUserEbag(
  run: (ctx: { api: EbagApi; user: User; supabase: Awaited<ReturnType<typeof createClient>> }) => Promise<Response>,
): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Влез отново в профила си.");

  const admin = createAdminClient();
  const tokens = await UserTokens.load(admin, user.id);
  if (!tokens) return fail(409, "Свържи eBag профила си отново.", "reconnect");

  let api: EbagApi | null = null;
  try {
    api = await connectEbag(tokens, { delayMs: 250, retries: 4 });
    const res = await run({ api, user, supabase });
    await tokens.touch();
    return res;
  } catch (e) {
    const row = await getConnectionRow(admin, user.id).catch(() => null);
    if (!row || row.status !== "connected") return fail(409, "Връзката с eBag е изтекла. Свържи профила си отново.", "reconnect");
    console.error("ebag session failed", { user: user.id, error: String(e) });
    return fail(502, "eBag не отговаря в момента. Опитай отново след малко.");
  } finally {
    await api?.close().catch(() => {});
  }
}
