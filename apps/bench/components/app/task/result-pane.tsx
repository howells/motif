"use client";

import { Maximize2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { MediaImage } from "@/components/app/media-image";
import { messageOf } from "@/lib/app/client/api";
import { chargeLine } from "@/lib/app/client/charge";
import { isInFlight, useGeneration } from "@/lib/app/client/use-generation";
import { formatSeconds, formatUsd } from "@/lib/app/money";
import type { GenerationView } from "@/lib/app/views";
import { SOURCE_TASK_IDS, taskTitle } from "@/lib/site/commands";

/** Seconds since a moment, ticking once a second while shown. */
function Elapsed({ since }: { readonly since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return (
    <span className="app-value">
      {formatSeconds(Math.max(0, now - Date.parse(since)))}
    </span>
  );
}

const STAGE: Readonly<Record<string, string>> = {
  reserved: "Held against the cap, starting",
  submitted: "Running on fal",
  submitting: "Sending to fal",
};

function Running({ generation }: { readonly generation: GenerationView }) {
  return (
    <div
      aria-live="polite"
      className="app-plate flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
    >
      <span className="type-body">{STAGE[generation.status] ?? "Running"}</span>
      <span className="type-small text-plate-muted flex gap-2">
        <Elapsed since={generation.submittedAt ?? generation.createdAt} />
        <span aria-hidden="true">·</span>
        <span>{generation.model}</span>
      </span>
      <span className="type-small text-plate-muted pt-2">
        {chargeLine(generation)}
      </span>
    </div>
  );
}

function Failed({
  generation,
  onRetry,
  retrying,
}: {
  readonly generation: GenerationView;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}) {
  const unknown = generation.status === "unknown";
  return (
    <div
      className="app-plate flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
      role="alert"
    >
      <span className="type-body">
        {unknown ? "We can’t tell if fal ran this" : "This run failed"}
      </span>
      <span className="type-small text-plate-muted max-w-[44ch]">
        {generation.error?.message ?? "fal didn’t say why."}
      </span>
      <span className="type-small text-plate-muted max-w-[44ch]">
        {chargeLine(generation)}
      </span>
      <button
        className="app-button is-plate mt-2"
        disabled={retrying}
        onClick={onRetry}
        type="button"
      >
        {retrying ? "Starting again…" : "Try again"}
      </button>
      <span className="type-small text-plate-muted">
        Trying again is a new run with its own hold.
      </span>
    </div>
  );
}

const metaOf = (generation: GenerationView): string => {
  const parts = [
    generation.model,
    generation.costMicros === null
      ? "cost not known yet"
      : formatUsd(generation.costMicros),
  ];
  if (generation.elapsedMs !== null) {
    parts.push(formatSeconds(generation.elapsedMs));
  }
  return parts.join(" · ");
};

function Finished({ generation }: { readonly generation: GenerationView }) {
  const [index, setIndex] = useState(0);
  const shown = generation.outputs[index] ?? generation.outputs[0];
  if (shown === undefined) {
    return null;
  }
  return (
    <>
      <div className="app-plate relative flex min-h-[18rem] flex-1 p-4 md:p-10">
        <div className="relative size-full">
          <MediaImage
            alt={generation.prompt ?? `${generation.task} result`}
            fit="contain"
            sizes="(max-width: 767px) 100vw, 60vw"
            src={shown.url}
          />
        </div>
        <a
          aria-label="Open full size"
          className="absolute top-2 right-2 flex size-11 items-center justify-center"
          href={shown.url}
          rel="noopener"
          target="_blank"
        >
          <Maximize2 aria-hidden="true" size={18} strokeWidth={1.5} />
        </a>
      </div>
      {generation.outputs.length > 1 ? (
        <div className="flex gap-1 px-4 md:px-0">
          {generation.outputs.map((output, position) => (
            <button
              aria-current={position === index}
              aria-label={`Image ${position + 1}`}
              className="app-thumb size-14"
              key={output.assetId}
              onClick={() => {
                setIndex(position);
              }}
              type="button"
            >
              <MediaImage alt="" sizes="56px" src={output.url} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-0">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="type-body">Saved to your Library</span>
          <span className="app-value text-faint">{metaOf(generation)}</span>
        </p>
        <a className="app-button" download href={`${shown.url}?download=1`}>
          Download
        </a>
      </div>
      <nav
        aria-label="Use this image"
        className="flex flex-wrap gap-2 px-4 md:px-0"
      >
        {SOURCE_TASK_IDS.map((task) => (
          <Link
            className="app-button is-quiet"
            href={`/commands/${task}?source=${shown.assetId}`}
            key={task}
          >
            {taskTitle(task)}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** The run being looked at: running, finished, failed or unconfirmed. */
export function ResultPane({
  id,
  onRetry,
  retrying,
}: {
  readonly id: string;
  readonly onRetry: (generation: GenerationView) => void;
  readonly retrying: boolean;
}) {
  const query = useGeneration(id);
  if (query.isPending) {
    return <div className="app-plate flex-1" />;
  }
  if (query.isError) {
    return (
      <div
        className="app-empty flex flex-1 items-center justify-center p-8"
        role="alert"
      >
        <span className="type-body">{messageOf(query.error)}</span>
      </div>
    );
  }
  const generation = query.data;
  if (isInFlight(generation)) {
    return <Running generation={generation} />;
  }
  if (generation.status === "completed") {
    return <Finished generation={generation} />;
  }
  return (
    <Failed
      generation={generation}
      onRetry={() => {
        onRetry(generation);
      }}
      retrying={retrying}
    />
  );
}
