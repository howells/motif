"use client";

import { useState } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { CheckIcon, ChevronDownIcon } from "@/components/app/boards/icons";
import { Section } from "@/components/app/boards/inspector-controls";
import { MediaImage } from "@/components/app/media-image";
import type {
  NodeViewData,
  ResultViewData,
} from "@/lib/app/client/board-schemas";

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  const today = new Date();
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${time}`;
  }
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
};

/** Results grouped by the run that made them, newest first. */
const runsOf = (
  results: readonly ResultViewData[]
): readonly (readonly ResultViewData[])[] => {
  const groups: ResultViewData[][] = [];
  const index = new Map<string, number>();
  for (const result of results) {
    const key = result.runId ?? result.generationId;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push([result]);
    } else {
      groups[at]?.push(result);
    }
  }
  return groups;
};

function ResultGrid({
  node,
  results,
}: {
  readonly node: NodeViewData;
  readonly results: readonly ResultViewData[];
}) {
  const { makePick } = useBoard();
  const outputs = results.flatMap((result) =>
    result.outputs.map((output) => ({ ...output, result }))
  );
  const failed = results.filter((result) => result.status === "failed");
  return (
    <>
      {outputs.length === 0 ? null : (
        <ul className="grid grid-cols-2 gap-2">
          {outputs.map((output) => {
            const picked = output.assetId === node.pick?.assetId;
            return (
              <li key={output.assetId}>
                <button
                  aria-label={picked ? "The Pick" : "Make this the Pick"}
                  aria-pressed={picked}
                  className="board-thumb group bg-surface block h-21.5 w-full"
                  onClick={() => {
                    makePick(node, output.assetId);
                  }}
                  type="button"
                >
                  <MediaImage alt="" sizes="152px" src={output.url} />
                  <span
                    className={`board-chip absolute bottom-1.5 left-1.5 ${picked ? "" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}
                  >
                    {picked ? <CheckIcon size={14} /> : null}
                    {picked ? "Pick" : "Make Pick"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {failed.map((result) => (
        <p className="type-small text-bad" key={result.generationId}>
          {result.modelName}: {result.error ?? "The run failed."}
        </p>
      ))}
    </>
  );
}

export function Results({ node }: { readonly node: NodeViewData }) {
  const [earlier, setEarlier] = useState(false);
  const groups = runsOf(node.results);
  const [latest, ...rest] = groups;
  // Nothing to show until an image exists: no empty block while it is made.
  if (
    latest === undefined ||
    !node.results.some((result) => result.outputs.length > 0)
  ) {
    return null;
  }
  const earlierImages = rest.reduce(
    (sum, group) =>
      sum + group.reduce((n, result) => n + result.outputs.length, 0),
    0
  );
  return (
    <Section
      label="Results"
      trailing={<span>{timeOf(latest[0]?.createdAt ?? "")}</span>}
    >
      <div className="flex flex-col gap-2 pt-1">
        <ResultGrid node={node} results={latest} />
        {rest.length === 0 ? null : (
          <>
            <button
              aria-expanded={earlier}
              className="board-rule-top type-body flex h-11 w-full items-center justify-between"
              onClick={() => {
                setEarlier(!earlier);
              }}
              type="button"
            >
              Earlier runs
              <span className="flex items-center gap-1">
                <span className="type-small text-muted">
                  {earlierImages} {earlierImages === 1 ? "image" : "images"}
                </span>
                <ChevronDownIcon
                  className={earlier ? "rotate-180" : "-rotate-90"}
                />
              </span>
            </button>
            {earlier
              ? rest.map((group) => (
                  <div
                    className="flex flex-col gap-2"
                    key={group[0]?.generationId}
                  >
                    <span className="type-small text-muted">
                      {timeOf(group[0]?.createdAt ?? "")}
                    </span>
                    <ResultGrid node={node} results={group} />
                  </div>
                ))
              : null}
          </>
        )}
      </div>
    </Section>
  );
}
