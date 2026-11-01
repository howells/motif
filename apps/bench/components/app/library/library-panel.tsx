"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState } from "react";

import {
  ArrowRightIcon,
  CloseIcon,
  DownloadIcon,
} from "@/components/app/boards/icons";
import { useAsSource } from "@/components/app/library/use-as-source";
import { MediaImage } from "@/components/app/media-image";
import { api, messageOf } from "@/lib/app/client/api";
import { madeAt } from "@/lib/app/client/dates";
import { GenerationsReply, LibraryItemReply } from "@/lib/app/client/schemas";
import type { LibraryItemData } from "@/lib/app/client/schemas";
import { formatUsd } from "@/lib/app/money";
import { taskTitle } from "@/lib/site/commands";

/** What the prompt was for: what was removed, changed, or asked for. */
const promptLabel = (task: string): string => {
  if (task === "erase") {
    return "Remove";
  }
  return task === "vary" ? "Change" : "Prompt";
};

interface Fact {
  readonly label: string;
  readonly mono?: boolean;
  readonly value: string;
}

const factsOf = (item: LibraryItemData): readonly Fact[] => [
  ...(item.board === null ? [] : [{ label: "Board", value: item.board.name }]),
  ...(item.prompt === null
    ? []
    : [{ label: promptLabel(item.task), value: item.prompt }]),
  { label: "Model", value: item.modelName },
  ...(item.width === null || item.height === null
    ? []
    : [{ label: "Size", mono: true, value: `${item.width} × ${item.height}` }]),
  ...(item.costMicros === null
    ? []
    : [{ label: "Cost", mono: true, value: formatUsd(item.costMicros) }]),
  ...(item.completedAt === null
    ? []
    : [{ label: "Made", value: madeAt(item.completedAt) }]),
];

function MadeFrom({ item }: { readonly item: LibraryItemData }) {
  if (item.madeFrom.length < 2) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-6 pt-6">
      <span className="text-plate-muted library-label">Made from</span>
      <ol className="flex flex-wrap items-center gap-2">
        {item.madeFrom.map((step, index) => {
          const here = step.generationId === item.generationId;
          return (
            <Fragment key={step.generationId}>
              {index === 0 ? null : (
                <ArrowRightIcon className="text-plate-muted shrink-0" />
              )}
              <li className="flex items-center gap-2">
                <span className={`library-step ${here ? "is-here" : ""}`}>
                  <MediaImage alt="" sizes="64px" src={step.url} />
                </span>
                <span
                  className={`text-plate-ink text-sm leading-5 ${here ? "font-medium" : ""}`}
                >
                  {taskTitle(step.task)}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function Facts({ item }: { readonly item: LibraryItemData }) {
  return (
    <dl className="flex flex-col px-6 pt-5">
      {factsOf(item).map((fact) => (
        <div className="flex min-h-8 items-baseline py-1.5" key={fact.label}>
          <dt className="text-plate-muted library-label w-22 shrink-0">
            {fact.label}
          </dt>
          <dd
            className={`text-plate-ink min-w-0 ${fact.mono === true ? "board-figure" : "text-sm leading-5"}`}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What to do with it: carry on with it on a Board, or keep it. On a phone,
 * where Boards aren't edited, the next Task opens instead. */
function Actions({
  inboxId,
  item,
}: {
  readonly inboxId: string | null;
  readonly item: LibraryItemData;
}) {
  const asSource = useAsSource();
  const target = item.board?.id ?? inboxId;
  return (
    <div className="flex flex-col gap-2 px-6 pt-4 pb-6">
      {asSource.isError ? (
        <p className="type-small text-plate-ink" role="alert">
          {messageOf(asSource.error)}
        </p>
      ) : null}
      <div className="hidden gap-2 md:flex">
        {item.board === null ? null : (
          <Link
            className="library-plate-button is-solid flex-[1.3]"
            href={`/boards/${item.board.id}`}
          >
            Open on Board
          </Link>
        )}
        <button
          className="library-plate-button flex-1"
          disabled={target === null || asSource.isPending}
          onClick={() => {
            if (target !== null) {
              asSource.mutate({ assetId: item.assetId, boardId: target });
            }
          }}
          type="button"
        >
          {asSource.isPending ? "Adding…" : "Use as Source"}
        </button>
        <a
          aria-label="Download"
          className="library-plate-button shrink-0"
          download
          href={`${item.url}?download=1`}
        >
          <DownloadIcon />
        </a>
      </div>
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <Link
          className="library-plate-button"
          href={`/commands/erase?source=${item.assetId}`}
        >
          Erase
        </Link>
        <Link
          className="library-plate-button"
          href={`/commands/upscale?source=${item.assetId}`}
        >
          Upscale
        </Link>
        <a
          className="library-plate-button"
          download
          href={`${item.url}?download=1`}
        >
          Save
        </a>
      </div>
    </div>
  );
}

/** Every version in the image's stack, latest first; choosing one shows it. */
function Versions({
  onShow,
  shownId,
  stackId,
}: {
  readonly onShow: (generationId: string) => void;
  readonly shownId: string;
  readonly stackId: string;
}) {
  const versions = useQuery({
    queryFn: async () =>
      await api(`/api/app/stacks/${stackId}`, GenerationsReply),
    queryKey: ["stack", stackId],
  });
  const done = (versions.data?.generations ?? []).filter(
    (generation) => generation.outputs.length > 0
  );
  if (done.length < 2) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 px-6 pt-6">
      <span className="text-plate-muted library-label">
        {done.length} versions
      </span>
      <ul className="flex flex-wrap gap-2">
        {done.map((generation) => (
          <li key={generation.id}>
            <button
              aria-label={`${taskTitle(generation.task)}, ${generation.model}`}
              aria-pressed={generation.id === shownId}
              className={`library-step ${generation.id === shownId ? "is-here" : ""}`}
              onClick={() => {
                onShow(generation.id);
              }}
              type="button"
            >
              <MediaImage
                alt=""
                sizes="64px"
                src={generation.outputs[0]?.url ?? ""}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One image, opened on the plate: what made it, from what, and where. */
export function LibraryPanel({
  inboxId,
  onClose,
  stack,
}: {
  readonly inboxId: string | null;
  readonly onClose: () => void;
  readonly stack: {
    readonly latestId: string;
    readonly stackId: string;
    readonly versions: number;
  };
}) {
  const [shownId, setShownId] = useState(stack.latestId);
  const reply = useQuery({
    queryFn: async () =>
      await api(`/api/app/library/${shownId}`, LibraryItemReply),
    queryKey: ["library-item", shownId],
  });
  const item = reply.data?.item;
  return (
    <aside
      aria-label={item === undefined ? "Image" : taskTitle(item.task)}
      className="bg-plate library-panel fixed inset-0 z-40 flex max-w-full flex-col overflow-y-auto md:sticky md:top-0 md:z-auto md:h-dvh md:shrink-0"
    >
      <header className="flex h-15 shrink-0 items-center justify-between pr-2 pl-6">
        <h2 className="board-title text-plate-ink">
          {item === undefined ? "" : taskTitle(item.task)}
        </h2>
        <button
          aria-label="Close"
          className="library-plate-button is-bare"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </header>
      {reply.isError ? (
        <p className="type-small text-plate-ink px-6" role="alert">
          {messageOf(reply.error)}
        </p>
      ) : null}
      {item === undefined ? null : (
        <>
          <div className="relative mx-6 mt-2 aspect-video shrink-0">
            <MediaImage
              alt={item.prompt ?? taskTitle(item.task)}
              fit="contain"
              sizes="(max-width: 767px) 100vw, 472px"
              src={item.url}
            />
          </div>
          <MadeFrom item={item} />
          {stack.versions > 1 ? (
            <Versions
              onShow={setShownId}
              shownId={shownId}
              stackId={stack.stackId}
            />
          ) : null}
          <Facts item={item} />
          <div className="flex-1" />
          <Actions inboxId={inboxId} item={item} />
        </>
      )}
    </aside>
  );
}
