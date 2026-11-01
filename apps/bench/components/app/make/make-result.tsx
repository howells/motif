"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ChevronLeftIcon } from "@/components/app/boards/icons";
import { LiveBeats, LiveGlow } from "@/components/app/boards/process";
import { useNow } from "@/components/app/boards/use-now";
import { useRunBeats } from "@/components/app/boards/use-run-beats";
import { MediaImage } from "@/components/app/media-image";
import { originOf } from "@/lib/app/boards/process";
import type { Beat } from "@/lib/app/boards/run-events";
import { api, messageOf } from "@/lib/app/client/api";
import { RunResultsReply } from "@/lib/app/client/board-schemas";
import type {
  ResultViewData,
  RunResultsData,
} from "@/lib/app/client/board-schemas";
import { useAfterSettle } from "@/lib/app/client/settled";
import { formatSeconds, formatUsd } from "@/lib/app/money";

type ResultOutput = ResultViewData["outputs"][number];

interface Again {
  readonly aspect: string;
  readonly look: string;
  readonly mood: string;
  readonly prompt: string;
}

const againHref = (again: Again): string => {
  const params = new URLSearchParams();
  const fields: readonly (readonly [string, string])[] = [
    ["prompt", again.prompt],
    ["look", again.look],
    ["mood", again.mood],
    ["aspect", again.aspect],
  ];
  for (const [name, value] of fields) {
    if (value !== "") {
      params.set(name, value);
    }
  }
  return `/make?${params.toString()}`;
};

const typicalOf = (result: ResultViewData | undefined): string =>
  result === undefined || result.typicalMs === null
    ? ""
    : ` of about ${formatSeconds(result.typicalMs)}`;

/** What the plate says while there's no image yet. */
function PlateNote({
  error,
  now,
  reply,
}: {
  readonly error: string | null;
  readonly now: number;
  readonly reply: RunResultsData | undefined;
}) {
  const run = reply?.run;
  const result = reply?.results[0];
  if (error !== null) {
    return <span className="type-small">{error}</span>;
  }
  if (run?.status === "failed" || result?.status === "failed") {
    return (
      <span className="type-small">
        {result?.error ??
          run?.error ??
          "The run failed. Nothing more was spent."}
      </span>
    );
  }
  if (run?.status === "stopped") {
    return <span className="type-small">Stopped before it finished.</span>;
  }
  return (
    <>
      <span className="text-plate-ink type-body font-medium">Making</span>
      {run === undefined ? null : (
        <span className="board-figure">
          {formatSeconds(Math.max(0, now - Date.parse(run.createdAt)))}
          {typicalOf(result)}
        </span>
      )}
    </>
  );
}

/** The plate while the run is working: what it says it is doing, on the
 * same glow and rail the canvas uses. */
function LivePlate({
  beats,
  now,
}: {
  readonly beats: readonly Beat[];
  readonly now: number;
}) {
  return (
    <div className="board-live absolute inset-0">
      <LiveGlow tone="plate" />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
        <LiveBeats
          beats={beats}
          now={now}
          origin={originOf(beats) ?? now}
          tone="plate"
        />
      </div>
    </div>
  );
}

const inboxLine = (reply: RunResultsData | undefined): string => {
  const run = reply?.run;
  const result = reply?.results[0];
  if (result?.outputs[0] !== undefined) {
    return "Added to Inbox";
  }
  return run?.status === "failed" ||
    run?.status === "stopped" ||
    result?.status === "failed"
    ? "Not added"
    : "Adding to Inbox";
};

function Facts({
  prompt,
  result,
  words,
}: {
  readonly prompt: string;
  readonly result: ResultViewData | undefined;
  readonly words: readonly string[];
}) {
  return (
    <>
      {result === undefined ? null : (
        <p className="type-small text-muted">
          {result.modelName}
          {result.elapsedMs === null
            ? ""
            : `, ${formatSeconds(result.elapsedMs)}`}
          .{words.length === 0 ? "" : ` ${words.join(", ")}.`}
        </p>
      )}
      <p className="type-body pt-2">{prompt}</p>
    </>
  );
}

function NextSteps({ output }: { readonly output: ResultOutput }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Link
        className="bg-surface type-body flex h-11 items-center justify-center rounded"
        href={`/commands/erase?source=${output.assetId}`}
      >
        Erase
      </Link>
      <Link
        className="bg-surface type-body flex h-11 items-center justify-center rounded"
        href={`/commands/upscale?source=${output.assetId}`}
      >
        Upscale
      </Link>
      <a
        className="bg-surface type-body flex h-11 items-center justify-center rounded"
        download
        href={output.url}
      >
        Save
      </a>
    </div>
  );
}

/** What a Make made: the image on the plate, what it cost, and what to do
 * with it next. Polls until the run ends. */
export function MakeResult({
  again,
  boardId,
  lookLabel,
  moodLabel,
  runId,
}: {
  readonly again: Again;
  readonly boardId: string;
  readonly lookLabel: string | null;
  readonly moodLabel: string | null;
  readonly runId: string;
}) {
  const reply = useQuery({
    queryFn: async () =>
      await api(`/api/app/board-runs/${runId}`, RunResultsReply),
    queryKey: ["board-run-results", runId],
    refetchInterval: (query) =>
      query.state.data?.run.status === "running" ? 2000 : false,
  });
  const running = reply.data?.run.status === "running";
  const now = useNow(running);
  const feed = useRunBeats(running ? runId : null, () => {
    void reply.refetch();
  });
  const beats = feed.beats.filter((beat) => beat.nodeId !== null);
  useAfterSettle(reply.data?.run.status === "running");
  const result = reply.data?.results[0];
  const output = result?.outputs[0];
  const words = [lookLabel, moodLabel].filter(
    (word): word is string => word !== null
  );

  return (
    <div className="app-screen flex flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 pr-2 pl-1">
        <Link
          aria-label="Back to Make"
          className="flex size-11 items-center justify-center"
          href="/make"
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="app-screen-title">Inbox</h1>
      </header>
      <div className="bg-plate relative aspect-square w-full">
        {output === undefined && running && beats.length > 0 ? (
          <LivePlate beats={beats} now={now} />
        ) : output === undefined ? (
          <div className="text-plate-muted absolute inset-0 flex flex-col items-center justify-center gap-1 px-8 text-center">
            <PlateNote
              error={reply.isError ? messageOf(reply.error) : null}
              now={now}
              reply={reply.data}
            />
          </div>
        ) : (
          <MediaImage
            alt={again.prompt}
            fit="contain"
            sizes="(max-width: 480px) 100vw, 480px"
            src={output.url}
          />
        )}
      </div>
      <div className="flex flex-col px-5 pt-4">
        <p className="flex items-baseline justify-between gap-3">
          <span className="type-body font-medium">{inboxLine(reply.data)}</span>
          <span className="board-figure">
            {result === undefined || result.costMicros === null
              ? ""
              : result.costEstimated
                ? `About ${formatUsd(result.costMicros)}`
                : formatUsd(result.costMicros)}
          </span>
        </p>
        <Facts prompt={again.prompt} result={result} words={words} />
      </div>
      <div className="mt-auto flex flex-col gap-2 px-5 pt-6 pb-4">
        {output === undefined ? null : <NextSteps output={output} />}
        <Link
          className="bg-ink text-background type-body flex h-13 items-center justify-center rounded font-medium"
          href={againHref(again)}
        >
          Make again
        </Link>
        <Link
          className="type-small text-muted hidden min-h-11 items-center justify-center md:flex"
          href={`/boards/${boardId}`}
        >
          Open the Inbox Board
        </Link>
      </div>
    </div>
  );
}
