"use client";

import { formatCost } from "@howells/motif-sdk";
import { useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { CheckIcon, ChevronDownIcon } from "@/components/app/boards/icons";
import { Section, Segments } from "@/components/app/boards/inspector-controls";
import { useNodeOptions } from "@/components/app/boards/use-node-options";
import { modelsOf } from "@/lib/app/boards/canvas";
import type { NodeViewOf, TaskNodeView } from "@/lib/app/boards/canvas";
import { BOARD_TIERS, MAX_COMPARE_MODELS } from "@/lib/app/boards/model";
import { USAGE_HOLD_MICROS_PER_IMAGE } from "@/lib/app/budget/policy";
import { messageOf } from "@/lib/app/client/api";
import type { NodeOptionsData } from "@/lib/app/client/board-schemas";
import { formatCap, toUsd } from "@/lib/app/money";

const TIER_LABEL = {
  balanced: "Balanced",
  fast: "Fast",
  quality: "Quality",
} as const;

type ModelOption = NodeOptionsData["models"][number];

/** A Model billed by usage is held at a fixed amount per image, not priced. */
const modelNote = (motif: boolean, usage: boolean): string => {
  const billed = `billed by usage, up to ${formatCap(USAGE_HOLD_MICROS_PER_IMAGE)} an image`;
  if (motif) {
    return usage ? `Motif’s choice, ${billed}` : "Motif’s choice";
  }
  return `Billed by usage, up to ${formatCap(USAGE_HOLD_MICROS_PER_IMAGE)} an image`;
};

const priceOf = (model: ModelOption): string =>
  model.listMicros === null || model.usage
    ? ""
    : formatCost(toUsd(model.listMicros));

export function ModelChoice({ node }: { readonly node: TaskNodeView }) {
  const { editSettings } = useBoard();
  const [all, setAll] = useState(false);
  const options = useNodeOptions(node);
  const tier = node.settings.tier ?? "balanced";
  const chosen = node.settings.model ?? options.data?.motifChoice ?? null;
  const models = options.data?.models ?? [];
  // Motif's choice first, then the node's own, so the Model it runs is always
  // in the short list and never hidden under All Models.
  const rankOf = (model: ModelOption) =>
    model.model === options.data?.motifChoice
      ? 0
      : model.model === chosen
        ? 1
        : 2;
  const ordered = models.toSorted((a, b) => rankOf(a) - rankOf(b));
  const shown = all ? ordered : ordered.slice(0, 3);
  return (
    <>
      <Section label="Tier">
        <Segments
          label="Tier"
          onChange={(value) => {
            editSettings(node, { model: undefined, tier: value });
          }}
          options={BOARD_TIERS.map((value) => ({
            label: TIER_LABEL[value],
            value,
          }))}
          value={tier}
        />
      </Section>
      <Section label="Model">
        {options.isPending ? (
          <p className="type-small text-muted py-3">Pricing the Models…</p>
        ) : options.isError ? (
          <p className="type-small text-bad py-3">{messageOf(options.error)}</p>
        ) : (
          <ul>
            {shown.map((model) => {
              const on = model.model === chosen;
              const motif = model.model === options.data.motifChoice;
              return (
                <li className="board-rule-bottom" key={model.model}>
                  <button
                    aria-pressed={on}
                    className="flex min-h-13 w-full items-center gap-3 py-2 text-left disabled:cursor-not-allowed"
                    disabled={model.reason !== null}
                    onClick={() => {
                      const quality =
                        "quality" in node.settings
                          ? node.settings.quality
                          : undefined;
                      editSettings(node, {
                        model: motif ? undefined : model.model,
                        // Leaving the choice to Motif drops what only a named
                        // Model takes; a new Model drops a quality it lacks.
                        ...(motif &&
                          (node.kind === "generate" ||
                            node.kind === "vary") && {
                            frameCount: undefined,
                            frameMs: undefined,
                            quality: undefined,
                          }),
                        ...(!motif &&
                          quality !== undefined &&
                          !model.qualities.includes(quality) && {
                            quality: undefined,
                          }),
                      });
                    }}
                    type="button"
                  >
                    <span className={`board-radio ${on ? "is-on" : ""}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={`type-body truncate ${on ? "font-medium" : ""}`}
                      >
                        {model.name}
                      </span>
                      {model.reason === null ? (
                        motif || model.usage ? (
                          <span className="type-small text-muted">
                            {modelNote(motif, model.usage)}
                          </span>
                        ) : null
                      ) : (
                        <span className="type-small text-muted line-clamp-2">
                          {model.reason}
                        </span>
                      )}
                    </span>
                    <span className="board-figure w-14 shrink-0 text-right">
                      {priceOf(model)}
                    </span>
                  </button>
                </li>
              );
            })}
            {ordered.length > 3 ? (
              <li>
                <button
                  aria-expanded={all}
                  className="type-body h-control flex w-full items-center justify-between"
                  onClick={() => {
                    setAll(!all);
                  }}
                  type="button"
                >
                  {all ? "Fewer Models" : "All Models"}
                  <ChevronDownIcon className={all ? "rotate-180" : ""} />
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </Section>
    </>
  );
}

export function CompareModels({
  node,
}: {
  readonly node: NodeViewOf<"compare">;
}) {
  const { editSettings } = useBoard();
  const options = useNodeOptions(node);
  const chosen = modelsOf(node);
  const on = new Set(chosen);
  return (
    <Section
      label="Models"
      trailing={
        <span>
          {chosen.length} of up to {MAX_COMPARE_MODELS}
        </span>
      }
    >
      {options.isPending ? (
        <p className="type-small text-muted py-3">Pricing the Models…</p>
      ) : options.isError ? (
        <p className="type-small text-bad py-3">{messageOf(options.error)}</p>
      ) : (
        <ul>
          {options.data.models.map((model) => {
            const picked = on.has(model.model);
            const full = !picked && chosen.length >= MAX_COMPARE_MODELS;
            return (
              <li className="board-rule-bottom" key={model.model}>
                <button
                  aria-pressed={picked}
                  className="min-h-control flex w-full items-center gap-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={full || (model.reason !== null && !picked)}
                  onClick={() => {
                    editSettings(node, {
                      models: picked
                        ? chosen.filter((id) => id !== model.model)
                        : [...chosen, model.model],
                    });
                  }}
                  type="button"
                >
                  <span className={`board-box ${picked ? "is-on" : ""}`}>
                    {picked ? <CheckIcon size={12} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="type-body truncate">{model.name}</span>
                    {model.reason === null ? (
                      model.usage ? (
                        <span className="type-small text-muted">
                          {modelNote(false, true)}
                        </span>
                      ) : null
                    ) : (
                      <span className="type-small text-muted line-clamp-2">
                        {model.reason}
                      </span>
                    )}
                  </span>
                  <span className="board-figure w-14 shrink-0 text-right">
                    {priceOf(model)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
