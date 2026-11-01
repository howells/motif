import type { SpendData } from "@/lib/app/client/schemas";
import { formatDollars } from "@/lib/app/money";

/** What the rail says about this month's spending. Each person sees only
 * their own spend; the pot shows only as what is left in it. */
export const spendLines = (spend: SpendData) => {
  const { estimated, heldMicros, spentMicros } = spend.mine;
  const spent = `${estimated > 0 ? "About " : ""}${formatDollars(spentMicros)} spent`;
  return {
    left: `Up to ${formatDollars(spend.leftMicros)} left this month`,
    spent:
      heldMicros > 0 ? `${spent}, ${formatDollars(heldMicros)} held` : spent,
  };
};
