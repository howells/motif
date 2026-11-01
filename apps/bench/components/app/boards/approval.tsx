"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { PlayIcon } from "@/components/app/boards/icons";
import { NODE_LABELS, isRunnable } from "@/lib/app/boards/model";
import type { NodeKind, RunScope } from "@/lib/app/boards/model";
import { USAGE_HOLD_MICROS_PER_IMAGE } from "@/lib/app/budget/policy";
import { api, messageOf, newKey } from "@/lib/app/client/api";
import { QuoteViewSchema, RunReply } from "@/lib/app/client/board-schemas";
import type {
  QuoteViewData,
  RunViewData,
  StepQuoteData,
} from "@/lib/app/client/board-schemas";
import { formatCap, formatUsd } from "@/lib/app/money";

const quoteOf = async (
  boardId: string,
  fromNodeId: string,
  scope: RunScope
): Promise<QuoteViewData> =>
  await api(`/api/app/boards/${boardId}/quote`, QuoteViewSchema, {
    body: { fromNodeId, scope },
  });

function Step({
  index,
  onUseModel,
  step,
}: {
  readonly index: number;
  readonly onUseModel: (nodeId: string, model: string) => void;
  readonly step: StepQuoteData;
}) {
  return (
    <li className="board-rule-bottom flex min-h-13 items-center gap-3 px-4 py-2">
      <span className="type-small text-muted w-5 shrink-0 tabular-nums">
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body font-medium">{step.label}</span>
        {step.ok ? (
          <>
            <span className="type-small text-muted">{step.detail}</span>
            {step.usage ? (
              <span className="type-small text-muted">
                Billed by usage, up to {formatCap(USAGE_HOLD_MICROS_PER_IMAGE)}{" "}
                an image
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="type-small text-bad">{step.reason}</span>
            {step.alternatives.length === 0 ? null : (
              <span className="flex flex-wrap gap-x-3 pt-1">
                {step.alternatives.slice(0, 3).map((alternative) => (
                  <button
                    className="type-small text-ink board-link min-h-8"
                    key={alternative.model}
                    onClick={() => {
                      onUseModel(step.nodeId, alternative.model);
                    }}
                    type="button"
                  >
                    Use {alternative.name}, {formatUsd(alternative.listMicros)}
                  </button>
                ))}
              </span>
            )}
          </>
        )}
      </span>
      <span className="board-figure w-16 shrink-0 text-right">
        {step.ok ? formatUsd(step.listMicros) : ""}
      </span>
    </li>
  );
}

function ScopeChoice({
  below,
  onChange,
  scope,
  single,
}: {
  readonly below: QuoteViewData | undefined;
  readonly onChange: (scope: RunScope) => void;
  readonly scope: RunScope;
  readonly single: QuoteViewData | undefined;
}) {
  const choices = [
    { label: "This node", quote: single, value: "node" },
    { label: "From here", quote: below, value: "downstream" },
  ] as const;
  return (
    <fieldset className="board-segmented">
      <legend className="sr-only">What to run</legend>
      {choices.map((choice) => (
        <button
          aria-pressed={scope === choice.value}
          key={choice.value}
          onClick={() => {
            onChange(choice.value);
          }}
          type="button"
        >
          {choice.label}
          <span className="board-figure">
            {choice.quote === undefined
              ? ""
              : formatUsd(choice.quote.listMicros)}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

const isOverCap = (quote: QuoteViewData): boolean =>
  quote.micros > quote.availableMicros;

const totalLine = (quote: QuoteViewData): string =>
  isOverCap(quote)
    ? `More than the ${formatUsd(quote.availableMicros)} left this month`
    : `Up to ${formatUsd(Math.max(0, quote.availableMicros - quote.micros))} left this month after this run`;

function QuoteSteps({
  label,
  onUseModel,
  quote,
}: {
  readonly label: string;
  readonly onUseModel: (nodeId: string, model: string) => void;
  readonly quote: QuoteViewData | undefined;
}) {
  if (quote === undefined) {
    return (
      <p className="type-small text-muted board-rule-top px-4 py-4">Pricing…</p>
    );
  }
  if (quote.steps.length === 0) {
    return (
      <p className="type-small text-muted board-rule-top px-4 py-4">
        Nothing below this {label} runs yet. Wire a Task into it first.
      </p>
    );
  }
  return (
    <>
      <ol className="board-rule-top">
        {quote.steps.map((step, index) => (
          <Step
            index={index + 1}
            key={step.nodeId}
            onUseModel={onUseModel}
            step={step}
          />
        ))}
        <li className="flex min-h-13 items-center gap-3 px-4 py-2">
          <span className="w-5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-body font-medium">Total</span>
            <span
              className={`type-small ${isOverCap(quote) ? "text-bad" : "text-muted"}`}
            >
              {totalLine(quote)}
            </span>
          </span>
          <span className="board-figure w-16 shrink-0 text-right font-medium">
            {formatUsd(quote.listMicros)}
          </span>
        </li>
      </ol>
      {quote.ready && quote.steps.some((step) => step.ok && step.usage) ? (
        <p className="type-small text-muted px-4">
          Holds {formatUsd(quote.micros)} while it runs. You pay what fal
          charges; if fal doesn’t say, the hold counts as an estimate.
        </p>
      ) : quote.ready && quote.micros > quote.listMicros ? (
        <p className="type-small text-muted px-4">
          Holds up to {formatUsd(quote.micros)} while it runs. You pay what fal
          charges.
        </p>
      ) : null}
    </>
  );
}

const titleOf = (label: string, runnable: boolean, downstream: boolean) => {
  if (!runnable) {
    return `Run what this ${label} feeds?`;
  }
  return downstream ? `Run from ${label}?` : `Run ${label}?`;
};

/** Both prices: this node alone, and this node with everything below it. */
const useQuotes = (
  boardId: string,
  nodeId: string,
  runnable: boolean,
  version: string
) => {
  const single = useQuery({
    enabled: runnable,
    queryFn: async () => await quoteOf(boardId, nodeId, "node"),
    queryKey: ["quote", boardId, nodeId, "node", version],
  });
  const below = useQuery({
    queryFn: async () => await quoteOf(boardId, nodeId, "downstream"),
    queryKey: ["quote", boardId, nodeId, "downstream", version],
  });
  const hasBelow =
    below.data !== undefined &&
    below.data.steps.length > (single.data?.steps.length ?? 0);
  return { below, hasBelow, single };
};

function Actions({
  approvable,
  onApprove,
  onCancel,
  pending,
  quote,
}: {
  readonly approvable: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
  readonly pending: boolean;
  readonly quote: QuoteViewData | undefined;
}) {
  return (
    <div className="flex gap-2 px-4 pt-4 pb-4">
      <button className="board-button flex-1" onClick={onCancel} type="button">
        Cancel
      </button>
      <button
        className="board-button is-ink flex-[1.4]"
        disabled={!approvable}
        onClick={onApprove}
        type="button"
      >
        <PlayIcon />
        {pending
          ? "Starting…"
          : `Approve ${quote === undefined ? "" : formatUsd(quote.listMicros)}`}
      </button>
    </div>
  );
}

/**
 * The price, before anything is spent. Run asks for this node alone; Run
 * from here adds everything below it. Approve reserves the hold and starts
 * the run; Cancel spends nothing.
 */
export function ApprovalDialog({
  boardId,
  kind,
  nodeId,
  onClose,
  onStarted,
  onUseModel,
  scope: initialScope,
  version,
}: {
  readonly boardId: string;
  readonly kind: NodeKind;
  readonly nodeId: string;
  readonly onClose: () => void;
  readonly onStarted: (run: RunViewData) => void;
  readonly onUseModel: (nodeId: string, model: string) => void;
  readonly scope: RunScope;
  /** Changes whenever the Board does, so the price is asked again. */
  readonly version: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const runnable = isRunnable(kind);
  const [scope, setScope] = useState<RunScope>(
    runnable ? initialScope : "downstream"
  );
  // One key per choice of what to run: approving twice never runs twice.
  const [key, setKey] = useState(newKey);
  const queryClient = useQueryClient();

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);

  const { below, hasBelow, single } = useQuotes(
    boardId,
    nodeId,
    runnable,
    version
  );
  const downstream = !runnable || (scope === "downstream" && hasBelow);
  const shown = downstream ? below : single;
  const quote = shown.data;
  const label = NODE_LABELS[kind];

  const start = useMutation({
    mutationFn: async (approved: QuoteViewData) =>
      await api(`/api/app/boards/${boardId}/runs`, RunReply, {
        body: {
          approvedMicros: approved.micros,
          fromNodeId: nodeId,
          idempotencyKey: key,
          scope: downstream ? "downstream" : "node",
        },
      }),
    onSuccess: async (reply) => {
      onStarted(reply.run);
      await queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    },
  });

  const approvable =
    quote !== undefined &&
    quote.steps.length > 0 &&
    quote.ready &&
    !isOverCap(quote) &&
    !start.isPending;

  return (
    <dialog
      aria-labelledby="approval-title"
      className="board-dialog m-auto w-[388px] max-w-[calc(100vw-2rem)]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialog}
    >
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <h2 className="type-title" id="approval-title">
          {titleOf(label, runnable, downstream)}
        </h2>
        {hasBelow && runnable ? (
          <ScopeChoice
            below={below.data}
            onChange={(next) => {
              setScope(next);
              setKey(newKey());
            }}
            scope={scope}
            single={single.data}
          />
        ) : null}
      </div>
      {shown.isError ? (
        <p className="type-small text-bad px-4 pb-3" role="alert">
          {messageOf(shown.error)}
        </p>
      ) : null}
      <QuoteSteps label={label} onUseModel={onUseModel} quote={quote} />
      {start.isError ? (
        <p className="type-small text-bad px-4 pt-3" role="alert">
          {messageOf(start.error)}
        </p>
      ) : null}
      <Actions
        approvable={approvable}
        onApprove={() => {
          if (quote !== undefined) {
            start.mutate(quote);
          }
        }}
        onCancel={onClose}
        pending={start.isPending}
        quote={quote}
      />
    </dialog>
  );
}
