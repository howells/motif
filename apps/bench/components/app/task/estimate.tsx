"use client";

import { messageOf } from "@/lib/app/client/api";
import type { Built, Draft } from "@/lib/app/client/task-draft";
import { formatUsd } from "@/lib/app/money";

interface Alternative {
  readonly micros: number;
  readonly model: string;
  readonly tier: string;
}

export type Quote =
  | {
      readonly availableMicros: number;
      readonly boundMicros: number;
      readonly chosenBy: string;
      readonly estimate: {
        readonly basis: string;
        readonly usd: number | null;
      };
      readonly kind: "ready";
      readonly model: string;
      readonly tier: string;
    }
  | {
      readonly alternatives: readonly Alternative[];
      readonly availableMicros: number;
      readonly chosenBy: string;
      readonly kind: "blocked";
      readonly model: string;
      readonly reason: string;
      readonly tier: string;
    };

const CHOSEN_BY: Readonly<Record<string, string>> = {
  look: "from the Look",
  model: "your choice",
  pin: "your choice",
  ranking: "Motif’s pick",
};

function Blocked({
  quote,
  set,
}: {
  readonly quote: Extract<Quote, { kind: "blocked" }>;
  readonly set: (patch: Partial<Draft>) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="alert">
      <p className="type-small">
        <span className="app-value">{quote.model}</span> can’t run here.{" "}
        {quote.reason}
      </p>
      {quote.alternatives.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quote.alternatives.map((alternative) => (
            <button
              className="app-button is-quiet"
              key={alternative.model}
              onClick={() => {
                set({ model: alternative.model });
              }}
              type="button"
            >
              Use {alternative.model}, up to {formatUsd(alternative.micros)}
            </button>
          ))}
        </div>
      ) : (
        <p className="type-small text-muted">
          No Model with a price limit can do this yet.
        </p>
      )}
    </div>
  );
}

/** The price line above Run: which Model, the projected cost, what is left
 * under the shared cap, and how much the run will hold while it runs. */
export function Estimate({
  built,
  error,
  quote,
  set,
}: {
  readonly built: Built;
  readonly error: unknown;
  readonly quote: Quote | undefined;
  readonly set: (patch: Partial<Draft>) => void;
}) {
  if (!built.ok) {
    return <p className="type-small text-muted">{built.reason}</p>;
  }
  if (error !== null && error !== undefined) {
    return (
      <p className="type-small text-bad" role="alert">
        {messageOf(error)}
      </p>
    );
  }
  if (quote === undefined) {
    return <p className="type-small text-muted">Working out the price…</p>;
  }
  if (quote.kind === "blocked") {
    return <Blocked quote={quote} set={set} />;
  }
  const over = quote.boundMicros > quote.availableMicros;
  const projected =
    quote.estimate.usd === null
      ? null
      : formatUsd(Math.round(quote.estimate.usd * 1_000_000));
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between gap-3">
        <span className="type-small text-muted">
          <span className="app-value text-ink">{quote.model}</span>{" "}
          {CHOSEN_BY[quote.chosenBy] ?? ""}
        </span>
        <span className="type-small text-muted">
          {projected === null ? null : (
            <span className="app-value text-ink">{projected} </span>
          )}
          of {formatUsd(quote.availableMicros)} left
        </span>
      </p>
      <p className={`type-small ${over ? "text-bad" : "text-faint"}`}>
        {over
          ? `This could cost up to ${formatUsd(quote.boundMicros)}, more than is left under the shared cap.`
          : `Holds up to ${formatUsd(quote.boundMicros)} while it runs.`}
      </p>
    </div>
  );
}
