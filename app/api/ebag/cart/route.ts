// POST /api/ebag/cart — puts items of the user's plan into THEIR eBag cart (SPEC §7.4). Never checks out.
// Body: { planId, ebagIds: number[] (≤ 10 per call), summary?: boolean }. The client sends the list in small
// batches (progress + stays far below the function time limit); items not reached in time come back in `pending`.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { connectEbag, type EbagApi } from "@/lib/ebag/api";
import { fillCartItem, getCartSummary, type CartItemResult } from "@/lib/ebag/cart";
import { getConnectionRow, UserTokens } from "@/lib/ebag/oauth";
import { getPlan } from "@/lib/plans/load";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 40_000;
const body = z.object({ planId: z.uuid(), ebagIds: z.array(z.number().int().positive()).max(10), summary: z.boolean().optional() });
const fail = (status: number, error: string, reason?: string) => NextResponse.json({ error, reason }, { status });

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Влез отново в профила си.");

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Невалидна заявка.");
  const plan = await getPlan(supabase, parsed.data.planId); // RLS: only the user's own plans
  if (!plan) return fail(404, "Планът не е намерен.");

  const admin = createAdminClient();
  const tokens = await UserTokens.load(admin, user.id);
  if (!tokens) return fail(409, "Свържи eBag профила си отново.", "reconnect");

  let api: EbagApi | null = null;
  try {
    api = await connectEbag(tokens, { delayMs: 250, retries: 4 });
    const wanted = new Set(parsed.data.ebagIds);
    const items = plan.shopping.filter((it) => wanted.has(it.ebag_id));
    const results: CartItemResult[] = [];
    const pending: number[] = [];
    for (const it of items) {
      if (Date.now() - t0 > BUDGET_MS) pending.push(it.ebag_id);
      else results.push(await fillCartItem(api, it));
    }
    const summary = parsed.data.summary && !pending.length ? await getCartSummary(api) : null;
    await tokens.touch();
    return NextResponse.json({ results, pending, summary });
  } catch (e) {
    const row = await getConnectionRow(admin, user.id).catch(() => null);
    if (!row || row.status !== "connected") return fail(409, "Връзката с eBag е изтекла. Свържи профила си отново.", "reconnect");
    console.error("ebag cart failed", { user: user.id, error: String(e) });
    return fail(502, "eBag не отговаря в момента. Опитай отново след малко.");
  } finally {
    await api?.close().catch(() => {});
  }
}
