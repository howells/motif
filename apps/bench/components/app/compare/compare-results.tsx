"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import type { CompareModel } from "@/components/app/compare/compare-setup";
import { MediaImage } from "@/components/app/media-image";
import { PageHead } from "@/components/app/page-head";
import { api, messageOf, newKey } from "@/lib/app/client/api";
import { chargeLine } from "@/lib/app/client/charge";
import { ComparisonReply, Ignored } from "@/lib/app/client/schemas";
import { useAfterSettle } from "@/lib/app/client/settled";
import { isInFlight } from "@/lib/app/client/use-generation";
import { formatSeconds, formatUsd } from "@/lib/app/money";
import type { GenerationView } from "@/lib/app/views";

type Tab = "images" | "quality" | "table";

const STAGE: Readonly<Record<string, string>> = {
  reserved: "Waiting to start",
  submitted: "Running on fal",
  submitting: "Sending to fal",
};

/** The latest run per Model: a retry replaces the run it retried. */
const latestPerModel = (
  generations: readonly GenerationView[]
): GenerationView[] => {
  const latest = new Map<string, GenerationView>();
  for (const generation of generations) {
    const seen = latest.get(generation.model);
    if (
      seen === undefined ||
      Date.parse(generation.createdAt) >= Date.parse(seen.createdAt)
    ) {
      latest.set(generation.model, generation);
    }
  }
  return [...latest.values()];
};

/** What a run counts against the cap: its cost, nothing once released, or
 * its hold while that stands in as an estimate. */
const costOf = (generation: GenerationView): number | null =>
  generation.costStatus === "retained"
    ? generation.boundMicros
    : (generation.costMicros ??
      (generation.costStatus === "released" ? 0 : null));

function Tile({
  generation,
  name,
  onRetry,
  retrying,
}: {
  readonly generation: GenerationView;
  readonly name: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}) {
  const [output] = generation.outputs;
  const failed =
    generation.status === "failed" || generation.status === "unknown";
  return (
    <li className="flex flex-col gap-2">
      <div className="app-plate relative flex aspect-[4/3] items-center justify-center overflow-hidden">
        {output === undefined ? null : (
          <a
            className="absolute inset-0"
            href={output.url}
            rel="noopener"
            target="_blank"
          >
            <MediaImage
              alt={`${name}’s result`}
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
              src={output.url}
            />
          </a>
        )}
        {isInFlight(generation) ? (
          <span aria-live="polite" className="type-small text-plate-muted">
            {STAGE[generation.status] ?? "Running"}
          </span>
        ) : null}
        {failed ? (
          <div
            className="flex flex-col items-center gap-2 p-4 text-center"
            role="alert"
          >
            <span className="type-body">No image</span>
            <span className="type-small text-plate-muted line-clamp-2">
              {generation.error?.message ?? "fal didn’t say why."}
            </span>
            <button
              className="app-button is-plate"
              disabled={retrying}
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
      <p className="flex items-baseline justify-between gap-3">
        <span className="type-body truncate">{name}</span>
        <span className="app-value text-muted">
          {failed
            ? generation.costStatus === "released"
              ? "Not charged"
              : "Charge unknown"
            : [
                costOf(generation) === null
                  ? null
                  : formatUsd(costOf(generation) ?? 0),
                generation.elapsedMs === null
                  ? null
                  : formatSeconds(generation.elapsedMs),
              ]
                .filter((part) => part !== null)
                .join(" · ")}
        </span>
      </p>
    </li>
  );
}

/** Cost against Motif's ranking, best-ranked first. */
function Ranking({
  failed,
  nameOf,
  rankOf,
  runs,
}: {
  readonly failed: readonly GenerationView[];
  readonly nameOf: (model: string) => string;
  readonly rankOf: (model: string) => number | null;
  readonly runs: readonly GenerationView[];
}) {
  return (
    <div className="px-4 py-6 md:px-6">
      <ul className="flex max-w-[44rem] flex-col">
        {runs
          .toSorted((a, b) => (rankOf(a.model) ?? 99) - (rankOf(b.model) ?? 99))
          .map((generation) => {
            const cost = costOf(generation);
            const widest = Math.max(
              1,
              ...runs.map((run) => costOf(run) ?? run.boundMicros)
            );
            return (
              <li
                className="border-border grid grid-cols-[minmax(7rem,12rem)_minmax(3rem,1fr)_auto] items-center gap-3 border-b py-3"
                key={generation.id}
              >
                <span className="type-body truncate">
                  {nameOf(generation.model)}
                </span>
                <span className="bg-surface block h-2">
                  <span
                    className="bg-ink block h-full"
                    style={{
                      inlineSize: `${((cost ?? generation.boundMicros) / widest) * 100}%`,
                      opacity: cost === null ? 0.35 : 1,
                    }}
                  />
                </span>
                <span className="type-small text-muted text-right">
                  {rankOf(generation.model) === null
                    ? "not ranked"
                    : `ranked ${rankOf(generation.model)}`}
                  {" · "}
                  {cost === null ? "cost unknown" : formatUsd(cost)}
                </span>
              </li>
            );
          })}
      </ul>
      <p className="type-small text-muted max-w-[44rem] pt-3">
        Ranking is Motif’s generation order, taken from the Arena text-to-image
        board. A pale bar is a hold, not a cost.
      </p>
      {failed.map((generation) => (
        <p className="type-small text-muted pt-1" key={generation.id}>
          {nameOf(generation.model)}: {chargeLine(generation)}
        </p>
      ))}
    </div>
  );
}

/** Each Model's image, timing and cost, as they arrive; a table; and cost
 * against Motif's ranking. A failed Model can be retried on its own. */
export function CompareResults({
  id,
  ranks,
}: {
  readonly id: string;
  readonly ranks: readonly CompareModel[];
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("images");
  const comparison = useQuery({
    queryFn: async () => {
      const body = await api(`/api/app/comparisons/${id}`, ComparisonReply);
      return body.comparison;
    },
    queryKey: ["comparison", id],
    refetchInterval: (query) =>
      query.state.data?.generations.some((generation) =>
        isInFlight(generation)
      ) === true
        ? 2000
        : false,
  });
  useAfterSettle(
    comparison.data?.generations.some((generation) =>
      isInFlight(generation)
    ) === true
  );
  const retry = useMutation({
    mutationFn: async (failed: readonly GenerationView[]) => {
      await Promise.all(
        failed.map(
          async (generation) =>
            await api(`/api/app/generations/${generation.id}/retry`, Ignored, {
              body: { idempotencyKey: newKey() },
            })
        )
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["comparison", id] });
    },
  });

  if (comparison.isPending) {
    return <PageHead title="Compare Models" />;
  }
  if (comparison.isError) {
    return (
      <>
        <PageHead title="Compare Models" />
        <p className="type-body text-bad px-4 py-8 md:px-6" role="alert">
          {messageOf(comparison.error)}
        </p>
      </>
    );
  }

  const data = comparison.data;
  const runs = latestPerModel(data.generations);
  const done = runs.filter((generation) => generation.status === "completed");
  const failed = runs.filter(
    (generation) =>
      generation.status === "failed" || generation.status === "unknown"
  );
  const spent = data.generations.reduce(
    (sum, generation) => sum + (costOf(generation) ?? 0),
    0
  );
  const fastest = done
    .filter((generation) => generation.elapsedMs !== null)
    .toSorted((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))[0];
  const cheapest = done
    .filter((generation) => generation.costMicros !== null)
    .toSorted((a, b) => (a.costMicros ?? 0) - (b.costMicros ?? 0))[0];
  const rankOf = (model: string) =>
    ranks.find((entry) => entry.model === model)?.rank ?? null;
  // A Model since dropped from the bounded list keeps its id as its name.
  const nameOf = (model: string) =>
    ranks.find((entry) => entry.model === model)?.name ?? model;

  return (
    <main>
      <PageHead
        actions={
          <Link
            className="app-button"
            href={`/compare?prompt=${encodeURIComponent(data.prompt)}`}
          >
            Change setup
          </Link>
        }
        standfirst={data.prompt}
        title="Compare Models"
      />
      <dl className="border-border grid grid-cols-2 gap-4 border-b px-4 py-4 md:grid-cols-4 md:px-6">
        <div>
          <dt className="type-small text-muted">Quickest this time</dt>
          <dd className="type-body">
            {fastest === undefined
              ? "—"
              : `${nameOf(fastest.model)}, ${formatSeconds(fastest.elapsedMs ?? 0)}`}
          </dd>
        </div>
        <div>
          <dt className="type-small text-muted">Lowest cost</dt>
          <dd className="type-body">
            {cheapest === undefined
              ? "—"
              : `${nameOf(cheapest.model)}, ${formatUsd(cheapest.costMicros ?? 0)}`}
          </dd>
        </div>
        <div>
          <dt className="type-small text-muted">Finished</dt>
          <dd className={`type-body ${failed.length > 0 ? "text-bad" : ""}`}>
            {done.length} of {runs.length}
          </dd>
        </div>
        <div>
          <dt className="type-small text-muted">Spent</dt>
          <dd className="app-value">{formatUsd(spent)}</dd>
        </div>
      </dl>
      <div
        className="border-border flex gap-4 border-b px-4 md:px-6"
        role="tablist"
      >
        {(
          [
            ["images", "Images"],
            ["table", "Table"],
            ["quality", "Cost and ranking"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-selected={tab === value}
            className="app-tab type-body"
            key={value}
            onClick={() => {
              setTab(value);
            }}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {failed.length > 0 ? (
        <output className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
          <div className="flex flex-col">
            <span className="type-body">
              {failed.length} of {runs.length}{" "}
              {runs.length === 1 ? "Model" : "Models"} failed
            </span>
            <span className="type-small text-muted">
              Retry runs only those. The others are saved to your Library.
            </span>
          </div>
          <button
            className="app-button"
            disabled={retry.isPending}
            onClick={() => {
              retry.mutate(failed);
            }}
            type="button"
          >
            Retry {failed.length} failed
          </button>
        </output>
      ) : null}
      {retry.error === null ? null : (
        <p className="type-small text-bad px-4 pt-2 md:px-6">
          {messageOf(retry.error)}
        </p>
      )}

      {tab === "images" ? (
        <ul className="grid gap-6 px-4 py-6 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
          {runs.map((generation) => (
            <Tile
              generation={generation}
              key={generation.id}
              name={nameOf(generation.model)}
              onRetry={() => {
                retry.mutate([generation]);
              }}
              retrying={retry.isPending}
            />
          ))}
        </ul>
      ) : null}

      {tab === "table" ? (
        <div className="overflow-x-auto px-4 py-6 md:px-6">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-border type-small text-muted border-b">
                <th className="type-small py-2" scope="col">
                  Model
                </th>
                <th className="type-small py-2" scope="col">
                  State
                </th>
                <th className="type-small py-2 text-right" scope="col">
                  Time this run
                </th>
                <th className="type-small py-2 text-right" scope="col">
                  Cost
                </th>
                <th className="type-small py-2 text-right" scope="col">
                  Held
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((generation) => (
                <tr className="border-border border-b" key={generation.id}>
                  <th className="type-body py-3" scope="row">
                    {nameOf(generation.model)}
                  </th>
                  <td className="type-small py-3">{generation.status}</td>
                  <td className="app-value py-3 text-right">
                    {generation.elapsedMs === null
                      ? "—"
                      : formatSeconds(generation.elapsedMs)}
                  </td>
                  <td className="app-value py-3 text-right">
                    {costOf(generation) === null
                      ? "unknown"
                      : formatUsd(costOf(generation) ?? 0)}
                  </td>
                  <td className="app-value text-muted py-3 text-right">
                    {formatUsd(generation.boundMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="type-small text-muted pt-3">
            Time this run is how long fal took for this one image, not a
            benchmark median. Cost is worked out by the SDK from fal’s listed
            rate.
          </p>
        </div>
      ) : null}

      {tab === "quality" ? (
        <Ranking failed={failed} nameOf={nameOf} rankOf={rankOf} runs={runs} />
      ) : null}
    </main>
  );
}
