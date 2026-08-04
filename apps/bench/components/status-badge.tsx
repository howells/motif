import { Badge } from "@/components/ui/badge";

type BadgeVariant = "bad" | "default" | "ok" | "warn";

/** Raw state enums are translated on the way out, never rendered as stored
 * (`docs/design/specs/design-bench.md`, Abstraction rules: "raw state enums
 * (`partial` → 'partial — some models failed')"). Colour reinforces the
 * label here; it never replaces it. */
const RUN_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  completed: { label: "completed", variant: "ok" },
  failed: { label: "failed — every model errored", variant: "bad" },
  partial: { label: "partial — some models failed", variant: "warn" },
  running: { label: "running", variant: "warn" },
};

/** The compact form for the history column, where the row is 236px wide and
 * the long-form sentence would wrap to three lines. */
const RUN_STATUS_SHORT: Record<string, BadgeVariant> = {
  completed: "ok",
  failed: "bad",
  partial: "warn",
  running: "warn",
};

export const RunStatusBadge = ({
  short = false,
  status,
}: {
  readonly short?: boolean;
  readonly status: string;
}) => {
  if (short) {
    return (
      <Badge variant={RUN_STATUS_SHORT[status] ?? "default"}>{status}</Badge>
    );
  }
  const entry = RUN_STATUS[status];
  return (
    <Badge variant={entry?.variant ?? "default"}>
      {entry?.label ?? status}
    </Badge>
  );
};
