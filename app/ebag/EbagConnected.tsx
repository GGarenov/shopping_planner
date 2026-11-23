"use client";

import { useState } from "react";
import { CartSender } from "./CartSender";
import { EbagCart } from "./EbagCart";

/** Connected state: send the plan's list, then see and edit the live eBag cart (refreshed after sending). */
export function EbagConnected({ plan, today }: { plan: { id: string; ebagIds: number[]; summary: string } | null; today: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      {plan && (
        <section className="flex flex-col gap-3">
          <div className="card flex flex-col gap-1">
            <span className="font-semibold">Списък за седмицата</span>
            <span className="text-sm opacity-80">{plan.summary}</span>
            <span className="text-sm opacity-70">
              Преди добавяне проверяваме наличността. Изчерпаните сменяме с подобен продукт. Каквото вече има в количката ти, остава.
            </span>
          </div>
          <CartSender planId={plan.id} ebagIds={plan.ebagIds} onDone={() => setRefreshKey((k) => k + 1)} />
        </section>
      )}
      <EbagCart today={today} refreshKey={refreshKey} />
    </>
  );
}
