import { formatCap, formatUsd, monthName } from "@/lib/app/money";

export interface Spend {
  readonly capMicros: number;
  readonly heldMicros: number;
  readonly month: string;
  readonly spentMicros: number;
}

/** The shared monthly spend: what's spent, then what's held for runs still
 * going, against the one cap everyone shares. */
export function SpendMeter({ spend }: { readonly spend: Spend }) {
  const cap = Math.max(spend.capMicros, 1);
  const spent = Math.min(100, (spend.spentMicros / cap) * 100);
  const held = Math.min(100 - spent, (spend.heldMicros / cap) * 100);
  return (
    <div className="flex flex-col gap-1">
      <span className="type-small text-muted">
        Shared spend, {monthName(spend.month)}
      </span>
      <span className="app-value">
        {formatUsd(spend.spentMicros + spend.heldMicros)} of{" "}
        {formatCap(spend.capMicros)}
      </span>
      <span className="sr-only">
        {formatUsd(spend.spentMicros)} spent and {formatUsd(spend.heldMicros)}{" "}
        held
      </span>
      <span aria-hidden="true" className="app-meter mt-1">
        <span style={{ inlineSize: `${spent}%` }} />
        <span style={{ inlineSize: `${held}%` }} />
      </span>
    </div>
  );
}
