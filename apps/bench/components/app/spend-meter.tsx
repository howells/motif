"use client";

import { useQuery } from "@tanstack/react-query";

import type { SpendData } from "@/lib/app/client/schemas";
import { SPEND_KEY, fetchSpend } from "@/lib/app/client/settled";
import { spendLines } from "@/lib/app/client/spend";
import { monthName } from "@/lib/app/money";

/** Your spending this month, against the one cap, kept up to date as runs
 * settle. The bar is your spend, then your holds for runs still going. */
export function SpendMeter({ initial }: { readonly initial: SpendData }) {
  const { data: spend } = useQuery({
    initialData: initial,
    queryFn: fetchSpend,
    queryKey: SPEND_KEY,
  });
  const cap = Math.max(spend.capMicros, 1);
  const spent = Math.min(100, (spend.mine.spentMicros / cap) * 100);
  const held = Math.min(100 - spent, (spend.mine.heldMicros / cap) * 100);
  const lines = spendLines(spend);
  return (
    <div className="flex flex-col gap-1">
      <span className="type-small text-muted">{monthName(spend.month)}</span>
      <span className="app-value">{lines.spent}</span>
      <span aria-hidden="true" className="app-meter mt-1">
        <span style={{ inlineSize: `${spent}%` }} />
        <span style={{ inlineSize: `${held}%` }} />
      </span>
      <span className="type-small text-muted">{lines.left}</span>
    </div>
  );
}
