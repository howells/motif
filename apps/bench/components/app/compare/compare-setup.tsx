"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field } from "@/components/app/controls";
import { PageHead } from "@/components/app/page-head";
import {
  ApiError,
  api,
  isRecord,
  messageOf,
  newKey,
} from "@/lib/app/client/api";
import { ComparisonStartedReply } from "@/lib/app/client/schemas";

export interface CompareModel {
  readonly model: string;
  /** Position in Motif's generation ranking, 1 first; null when unranked. */
  readonly rank: number | null;
  readonly tier: string | null;
}

/** One prompt, several Models. Each is held against the cap before any
 * starts; the results land in the Library. */
export function CompareSetup({
  aspects,
  initialPrompt,
  max,
  models,
}: {
  readonly aspects: readonly string[];
  readonly initialPrompt: string;
  readonly max: number;
  readonly models: readonly CompareModel[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspect, setAspect] = useState("1:1");
  const [chosen, setChosen] = useState<readonly string[]>(() =>
    models
      .filter((entry) => entry.rank !== null)
      .slice(0, 3)
      .map((entry) => entry.model)
  );
  const chosenSet = new Set(chosen);
  const start = useMutation({
    mutationFn: async () =>
      await api("/api/app/comparisons", ComparisonStartedReply, {
        body: {
          aspect,
          idempotencyKey: newKey(),
          models: chosen,
          prompt: prompt.trim(),
        },
      }),
    onSuccess: async ({ comparisonId }) => {
      await queryClient.invalidateQueries({ queryKey: ["library"] });
      if (comparisonId !== null) {
        router.push(`/compare/${comparisonId}`);
      }
    },
  });

  const toggle = (model: string) => {
    setChosen((current) =>
      current.includes(model)
        ? current.filter((item) => item !== model)
        : current.length >= max
          ? current
          : [...current, model]
    );
  };

  const refusals =
    start.error instanceof ApiError &&
    Array.isArray(start.error.details.refusals)
      ? start.error.details.refusals.flatMap((item: unknown) =>
          isRecord(item) &&
          typeof item.model === "string" &&
          typeof item.message === "string"
            ? [{ message: item.message, model: item.model }]
            : []
        )
      : [];
  const problem = start.error === null ? null : messageOf(start.error);
  const ready = prompt.trim() !== "" && chosen.length >= 2 && !start.isPending;

  return (
    <main>
      <PageHead
        standfirst="One prompt, several Models, side by side"
        title="Compare Models"
      />
      <div className="flex max-w-[44rem] flex-col gap-6 px-4 py-6 md:px-8">
        <Field htmlFor="compare-prompt" label="Prompt">
          <textarea
            className="app-textarea"
            id="compare-prompt"
            maxLength={4000}
            onChange={(event) => {
              setPrompt(event.target.value);
            }}
            placeholder="a stoneware vase on linen in soft window light"
            value={prompt}
          />
        </Field>
        <Field htmlFor="compare-aspect" label="Aspect">
          <select
            className="app-select"
            id="compare-aspect"
            onChange={(event) => {
              setAspect(event.target.value);
            }}
            value={aspect}
          >
            {aspects.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-col">
          <legend className="app-label w-full">
            <span>Models</span>
            <span>
              {chosen.length} of {max} chosen
            </span>
          </legend>
          <ul className="border-border border-t">
            {models.map((entry) => {
              const on = chosenSet.has(entry.model);
              return (
                <li className="border-border border-b" key={entry.model}>
                  <label className="min-h-control flex cursor-pointer items-center gap-3">
                    <input
                      checked={on}
                      className="size-5 accent-[var(--ink)]"
                      disabled={!on && chosen.length >= max}
                      onChange={() => {
                        toggle(entry.model);
                      }}
                      type="checkbox"
                    />
                    <span className="app-value flex-1">{entry.model}</span>
                    <span className="type-small text-muted">
                      {entry.rank === null
                        ? "not ranked"
                        : `ranked ${entry.rank}`}
                      {entry.tier === null ? "" : `, ${entry.tier}`}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {problem === null ? null : (
          <p className="type-small text-bad" role="alert">
            {start.error instanceof ApiError &&
            start.error.code === "CAP_REACHED"
              ? "That’s more than is left this month, so nothing has started."
              : problem}
          </p>
        )}
        {refusals.length === 0 ? null : (
          <ul className="type-small text-muted flex flex-col gap-1">
            {refusals.map((refusal) => (
              <li key={refusal.model}>
                <span className="app-value text-ink">{refusal.model}</span>:{" "}
                {refusal.message}
              </li>
            ))}
          </ul>
        )}
        <button
          className="app-button is-primary"
          disabled={!ready}
          onClick={() => {
            start.mutate();
          }}
          type="button"
        >
          {start.isPending ? "Starting…" : `Run ${chosen.length} Models`}
        </button>
        <p className="type-small text-muted">
          Each Model is held against this month’s cap before any of them starts.
          If the holds don’t fit, nothing runs.
        </p>
      </div>
    </main>
  );
}
