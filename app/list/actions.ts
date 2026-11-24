"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requestLog } from "@/lib/requestLog";

const input = z.object({
  planId: z.uuid(),
  ebagIds: z.array(z.number().int().positive()).min(1).max(200),
  checked: z.boolean(),
});

/** Saves checkbox state for items of one plan. RLS only allows plans that belong to the logged-in user. */
export async function setChecked(planId: string, ebagIds: number[], checked: boolean): Promise<{ ok: boolean }> {
  const parsed = input.safeParse({ planId, ebagIds, checked });
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const rows = parsed.data.ebagIds.map((ebag_id) => ({ plan_id: parsed.data.planId, ebag_id, checked: parsed.data.checked }));
  const { error } = await supabase.from("shopping_checks").upsert(rows, { onConflict: "plan_id,ebag_id" });
  if (error) (await requestLog({ action: "setChecked" })).error("list.save_checks_failed", { err: new Error(error.message) });
  return { ok: !error };
}
