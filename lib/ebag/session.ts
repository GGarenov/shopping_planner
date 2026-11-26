// Runs an eBag MCP session for the logged-in user inside an API route: auth, the user's tokens, connect, close,
// and the same error answers everywhere (401 login, 409 reconnect, 502 eBag down) — thrown as AppError, so
// apiHandler() answers them in the error contract.
import "server-only";
import { getTranslations } from "next-intl/server";
import type { User } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import type { Logger } from "@/lib/log";
import { connectEbag, type EbagApi } from "./api";
import { getConnectionRow, UserTokens } from "./oauth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function withUserEbag(
  log: Logger,
  run: (ctx: { api: EbagApi; user: User; supabase: Awaited<ReturnType<typeof createClient>> }) => Promise<Response>,
): Promise<Response> {
  const [t, common] = await Promise.all([getTranslations("ebag.api"), getTranslations("common")]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError(401, "unauthorized", common("loginAgain"));

  const admin = createAdminClient();
  const tokens = await UserTokens.load(admin, user.id);
  if (!tokens) throw new AppError(409, "reconnect", t("reconnect"));

  let api: EbagApi | null = null;
  try {
    api = await connectEbag(tokens, { delayMs: 250, retries: 4 });
    const res = await run({ api, user, supabase });
    await tokens.touch();
    return res;
  } catch (e) {
    if (e instanceof AppError) throw e;
    const row = await getConnectionRow(admin, user.id).catch(() => null);
    if (!row || row.status !== "connected") throw new AppError(409, "reconnect", t("expired"));
    log.error("ebag.session_failed", { user: user.id, err: e });
    throw new AppError(502, "ebag_down", t("down"));
  } finally {
    await api?.close().catch(() => {});
  }
}
