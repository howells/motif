"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MediaImage } from "@/components/app/media-image";
import { PageHead } from "@/components/app/page-head";
import { api, messageOf } from "@/lib/app/client/api";
import { chargeLine } from "@/lib/app/client/charge";
import { GenerationsReply, StacksReply } from "@/lib/app/client/schemas";
import { formatUsd } from "@/lib/app/money";
import type { GenerationView, StackView } from "@/lib/app/views";
import { SOURCE_TASK_IDS } from "@/lib/site/commands";

const dayOf = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
};

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const titleOf = (stack: StackView): string =>
  stack.prompt ?? `${stack.task}, ${stack.model}`;

interface Day {
  readonly costMicros: number;
  readonly name: string;
  readonly stacks: readonly StackView[];
}

const byDay = (stacks: readonly StackView[]): Day[] => {
  const days: { costMicros: number; name: string; stacks: StackView[] }[] = [];
  for (const stack of stacks) {
    const name = dayOf(stack.completedAt);
    const last = days.at(-1);
    if (last?.name === name) {
      last.stacks.push(stack);
      last.costMicros += stack.costMicros;
    } else {
      days.push({ costMicros: stack.costMicros, name, stacks: [stack] });
    }
  }
  return days;
};

function Version({
  current,
  generation,
  onSelect,
}: {
  readonly current: boolean;
  readonly generation: GenerationView;
  readonly onSelect: () => void;
}) {
  const [cover] = generation.outputs;
  return (
    <li className="border-border border-b">
      <button
        aria-current={current}
        className="flex w-full items-center gap-3 py-2 text-left aria-[current=true]:font-medium"
        onClick={onSelect}
        type="button"
      >
        <span className="app-thumb size-12 shrink-0">
          {cover === undefined ? null : (
            <MediaImage alt="" sizes="48px" src={cover.url} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-body truncate">
            {generation.task}
            {generation.mode === null ? "" : `, ${generation.mode}`}
          </span>
          <span className="type-small text-muted truncate">
            {generation.model} · {timeOf(generation.createdAt)}
            {generation.status === "completed" ? "" : ` · ${generation.status}`}
          </span>
        </span>
        <span className="app-value">
          {generation.costMicros === null
            ? generation.costStatus === "released"
              ? "$0"
              : "unknown"
            : formatUsd(generation.costMicros)}
        </span>
      </button>
    </li>
  );
}

function StackPanel({
  onClose,
  stack,
}: {
  readonly onClose: () => void;
  readonly stack: StackView;
}) {
  const versions = useQuery({
    queryFn: async () => {
      const body = await api(
        `/api/app/stacks/${stack.stackId}`,
        GenerationsReply
      );
      return body.generations;
    },
    queryKey: ["stack", stack.stackId],
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const list = versions.data ?? [];
  const shown =
    list.find((generation) => generation.id === chosen) ??
    list.find((generation) => generation.outputs.length > 0);
  const output = shown?.outputs[0] ?? stack.cover;
  const completed = list.filter(
    (generation) => generation.status === "completed"
  ).length;

  return (
    <aside
      aria-label={titleOf(stack)}
      className="bg-background md:border-border fixed inset-0 z-40 flex flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:z-auto md:h-dvh md:border-l"
    >
      <div className="app-plate relative flex aspect-square shrink-0 items-center justify-center md:aspect-[4/3]">
        {output === null || output === undefined ? null : (
          <MediaImage
            alt={titleOf(stack)}
            fit="contain"
            sizes="(max-width: 767px) 100vw, 28rem"
            src={output.url}
          />
        )}
        <button
          aria-label="Close"
          className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 flex size-11 items-center justify-center"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="type-body line-clamp-2 font-medium">
            {titleOf(stack)}
          </h2>
          <p className="type-small text-muted">
            {completed === 1 ? "1 version" : `${completed} versions`}, latest
            first
          </p>
        </div>
        {output === null || output === undefined ? null : (
          <div className="flex flex-wrap gap-2">
            <a
              className="app-button"
              href={output.url}
              rel="noopener"
              target="_blank"
            >
              Full size
            </a>
            <a
              className="app-button"
              download
              href={`${output.url}?download=1`}
            >
              Download
            </a>
            {stack.prompt === null ? null : (
              <Link
                className="app-button"
                href={`/compare?prompt=${encodeURIComponent(stack.prompt)}`}
              >
                Compare Models
              </Link>
            )}
          </div>
        )}
        {output === null || output === undefined ? null : (
          <div className="flex flex-col gap-2">
            <span className="type-small text-muted">Use as the Source for</span>
            <div className="flex flex-wrap gap-2">
              {SOURCE_TASK_IDS.map((task) => (
                <Link
                  className="app-button is-quiet"
                  href={`/commands/${task}?source=${output.assetId}`}
                  key={task}
                >
                  {task}
                </Link>
              ))}
            </div>
          </div>
        )}
        {versions.isError ? (
          <p className="type-small text-bad">{messageOf(versions.error)}</p>
        ) : null}
        <ul className="border-border border-t">
          {list.map((generation) => (
            <Version
              current={generation.id === shown?.id}
              generation={generation}
              key={generation.id}
              onSelect={() => {
                setChosen(generation.id);
              }}
            />
          ))}
        </ul>
        {shown !== undefined && shown.status !== "completed" ? (
          <p className="type-small text-muted">{chargeLine(shown)}</p>
        ) : null}
      </div>
    </aside>
  );
}

/** One person's Library: stacks of Generations, latest first, grouped by
 * day, each opening to its versions. */
export function LibraryView() {
  const [filter, setFilter] = useState<"all" | "comparisons">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<StackView | null>(null);
  const library = useQuery({
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === "comparisons") {
        params.set("filter", "comparisons");
      }
      if (search.trim() !== "") {
        params.set("q", search.trim());
      }
      const body = await api(
        `/api/app/library?${params.toString()}`,
        StacksReply
      );
      return body.stacks;
    },
    queryKey: ["library", filter, search.trim()],
  });
  const days = byDay(library.data ?? []);

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto]">
      <main className="min-w-0">
        <PageHead standfirst="Your Generations, latest first" title="Library" />
        <div className="flex flex-col gap-3 px-4 pt-5 md:flex-row md:items-center md:justify-between md:px-10">
          <fieldset className="flex gap-2">
            <legend className="sr-only">Show</legend>
            {(["all", "comparisons"] as const).map((value) => (
              <button
                aria-pressed={filter === value}
                className={`app-button ${filter === value ? "is-primary" : ""}`}
                key={value}
                onClick={() => {
                  setFilter(value);
                }}
                type="button"
              >
                {value === "all" ? "All" : "Comparisons"}
              </button>
            ))}
          </fieldset>
          <input
            aria-label="Search prompts"
            className="app-input md:max-w-[18rem]"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Search prompts"
            type="search"
            value={search}
          />
        </div>
        <div className="px-4 pt-2 pb-10 md:px-10">
          {library.isPending ? (
            <p className="type-small text-muted py-6">Loading your Library…</p>
          ) : library.isError ? (
            <p className="type-small text-bad py-6" role="alert">
              {messageOf(library.error)}
            </p>
          ) : days.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-10">
              <p className="type-body">
                {search.trim() === ""
                  ? "Nothing here yet."
                  : `No prompt matches “${search.trim()}”.`}
              </p>
              {search.trim() === "" ? (
                <Link
                  className="app-button is-primary"
                  href="/commands/generate"
                >
                  Make an image
                </Link>
              ) : null}
            </div>
          ) : (
            days.map((day) => (
              <section className="pt-5" key={day.name}>
                <h2 className="flex items-baseline justify-between pb-2">
                  <span className="type-body font-medium">{day.name}</span>
                  <span className="app-value text-muted">
                    {formatUsd(day.costMicros)}
                  </span>
                </h2>
                <ul className="-mx-4 grid grid-cols-3 gap-0.5 md:mx-0 md:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] md:gap-2">
                  {day.stacks.map((stack) => (
                    <li key={stack.stackId}>
                      <button
                        aria-label={titleOf(stack)}
                        aria-pressed={open?.stackId === stack.stackId}
                        className="app-thumb w-full"
                        onClick={() => {
                          setOpen(stack);
                        }}
                        type="button"
                      >
                        {stack.cover === null ? null : (
                          <MediaImage
                            alt=""
                            sizes="(max-width: 767px) 33vw, 10rem"
                            src={stack.cover.url}
                          />
                        )}
                        {stack.versions > 1 ? (
                          <span className="bg-plate/80 text-plate-ink type-small absolute top-1.5 right-1.5 flex items-center gap-1 rounded-sm px-1.5">
                            <Layers
                              aria-hidden="true"
                              size={12}
                              strokeWidth={1.5}
                            />
                            {stack.versions}
                          </span>
                        ) : null}
                        {stack.comparisonId === null ? null : (
                          <span className="bg-plate/80 text-plate-ink type-small absolute bottom-1.5 left-1.5 rounded-sm px-1.5">
                            Compared
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>
      {open === null ? null : (
        <div className="md:w-[22.5rem]">
          <StackPanel
            key={open.stackId}
            onClose={() => {
              setOpen(null);
            }}
            stack={open}
          />
        </div>
      )}
    </div>
  );
}
