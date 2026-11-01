"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { MediaImage } from "@/components/app/media-image";
import { Estimate } from "@/components/app/task/estimate";
import type { Quote } from "@/components/app/task/estimate";
import { TaskFields } from "@/components/app/task/fields";
import type { TaskOptions } from "@/components/app/task/fields";
import { MaskEditor } from "@/components/app/task/mask-editor";
import { ResultPane } from "@/components/app/task/result-pane";
import {
  ApiError,
  api,
  isRecord,
  messageOf,
  newKey,
} from "@/lib/app/client/api";
import { QuoteSchema, StartedReply } from "@/lib/app/client/schemas";
import { buildRequest, emptyDraft } from "@/lib/app/client/task-draft";
import type { Draft, PickedImage } from "@/lib/app/client/task-draft";
import { uploadImage } from "@/lib/app/client/upload-image";
import type { GenerationView } from "@/lib/app/views";
import { taskTitle } from "@/lib/site/commands";
import type { AppTaskId } from "@/lib/site/commands";

/** The same value, but only once it has stopped changing for `ms`. */
const useSettled = <T,>(value: T, ms: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [ms, value]);
  return settled;
};

const quoteFor = async (requestKey: string | null): Promise<Quote> => {
  const request: unknown = JSON.parse(requestKey ?? "{}");
  return await api("/api/app/tasks/quote", QuoteSchema, {
    body: { ...(isRecord(request) ? request : {}), idempotencyKey: newKey() },
  });
};

const startProblem = (error: unknown): string =>
  error instanceof ApiError && error.code === "CAP_REACHED"
    ? `${messageOf(error)} Daniel can raise the cap in Settings.`
    : messageOf(error);

function Head({
  prompt,
  summary,
  task,
  usage,
}: {
  readonly prompt: string;
  readonly summary: string;
  readonly task: AppTaskId;
  readonly usage: string;
}) {
  const [cli, setCli] = useState(false);
  const compare =
    prompt.trim() === ""
      ? "/compare"
      : `/compare?prompt=${encodeURIComponent(prompt.trim())}`;
  return (
    <header className="app-head">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          className="type-small text-muted min-h-control flex items-center gap-1 md:hidden"
          href="/make"
        >
          <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.5} />
          Make
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1>{taskTitle(task)}</h1>
          <p className="type-body text-muted">{summary}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {task === "generate" ? (
          <Link className="app-button" href={compare}>
            Compare Models
          </Link>
        ) : null}
        <button
          aria-expanded={cli}
          className="app-button"
          onClick={() => {
            setCli(!cli);
          }}
          type="button"
        >
          CLI
        </button>
      </div>
      {cli ? (
        <code className="site-command type-small w-full font-mono whitespace-pre-wrap">
          {usage}
        </code>
      ) : null}
    </header>
  );
}

function Placeholder({
  draft,
  task,
}: {
  readonly draft: Draft;
  readonly task: AppTaskId;
}) {
  if (draft.source !== null && task !== "generate") {
    return (
      <div className="app-plate flex min-h-[18rem] flex-1 p-4 md:p-8">
        <div className="relative size-full">
          <MediaImage
            alt="The Source"
            fit="contain"
            sizes="(max-width: 767px) 100vw, 60vw"
            src={draft.source.url}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="app-empty flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
      <span className="type-body text-ink">No Generation yet</span>
      <span className="type-small">It lands here and in your Library.</span>
    </div>
  );
}

function SessionRuns({
  editing,
  runs,
  setShown,
  shown,
}: {
  readonly editing: boolean;
  readonly runs: readonly string[];
  readonly setShown: (id: string | null) => void;
  readonly shown: string | null;
}) {
  if (runs.length < 2 && !(shown !== null && editing)) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 md:px-0">
      <span className="type-small text-muted">This session</span>
      {editing ? (
        <button
          className="app-button is-quiet"
          onClick={() => {
            setShown(null);
          }}
          type="button"
        >
          Back to the Source
        </button>
      ) : null}
      {runs.map((id, position) => (
        <button
          aria-current={id === shown}
          aria-label={`Run ${runs.length - position}`}
          className="app-button is-quiet min-w-control px-3"
          key={id}
          onClick={() => {
            setShown(id);
          }}
          type="button"
        >
          {runs.length - position}
        </button>
      ))}
    </div>
  );
}

/**
 * A Task, working: the form on the left, the result on the right (above, on
 * a phone), and the Run bar with the price at the foot of the form.
 */
export function TaskWorkspace({
  initialSource,
  options,
  summary,
  task,
  usage,
}: {
  readonly initialSource: PickedImage | null;
  readonly options: TaskOptions;
  readonly summary: string;
  readonly task: AppTaskId;
  readonly usage: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialSource));
  const [runs, setRuns] = useState<readonly string[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [maskProblem, setMaskProblem] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const built = buildRequest(task, draft);
  const currentKey = built.ok ? JSON.stringify(built.request) : null;
  const requestKey = useSettled(currentKey, 350);
  const quote = useQuery({
    enabled: requestKey !== null,
    queryFn: async () => await quoteFor(requestKey),
    queryKey: ["quote", requestKey],
    retry: false,
    staleTime: 30_000,
  });

  const afterStart = async (generationId: string) => {
    setRuns((current) => [
      generationId,
      ...current.filter((item) => item !== generationId),
    ]);
    setShown(generationId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["quote"] }),
    ]);
  };

  const start = useMutation({
    mutationFn: async () => {
      if (!built.ok) {
        throw new Error(built.reason);
      }
      return await api("/api/app/tasks", StartedReply, {
        body: { ...built.request, idempotencyKey: newKey() },
      });
    },
    onSuccess: async ({ generationId }) => {
      await afterStart(generationId);
    },
  });
  const retry = useMutation({
    mutationFn: async (failed: GenerationView) =>
      await api(`/api/app/generations/${failed.id}/retry`, StartedReply, {
        body: { idempotencyKey: newKey() },
      }),
    onSuccess: async ({ generationId }) => {
      await afterStart(generationId);
    },
  });

  const onMask = async (mask: Blob | null) => {
    setMaskProblem(null);
    if (mask === null) {
      set({ maskAssetId: null });
      return;
    }
    try {
      const asset = await uploadImage(mask, "mask");
      set({ maskAssetId: asset.id });
    } catch (error) {
      setMaskProblem(messageOf(error));
      set({ maskAssetId: null });
    }
  };

  const ready =
    built.ok &&
    quote.data?.kind === "ready" &&
    !quote.isFetching &&
    requestKey === currentKey;
  const startError = start.error ?? retry.error;
  const editing =
    task === "erase" &&
    draft.source !== null &&
    (draft.eraseMode === "paint" || draft.eraseMode === "boxes");

  let pane: ReactNode = <Placeholder draft={draft} task={task} />;
  if (shown !== null) {
    pane = (
      <ResultPane
        id={shown}
        onRetry={(failed) => {
          retry.mutate(failed);
        }}
        retrying={retry.isPending}
      />
    );
  } else if (editing && draft.source !== null) {
    pane = (
      <MaskEditor
        boxes={draft.boxes}
        mode={draft.eraseMode === "paint" ? "paint" : "boxes"}
        onBoxes={(boxes) => {
          set({ boxes });
        }}
        onMask={(mask) => {
          void onMask(mask);
        }}
        source={draft.source}
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <Head prompt={draft.prompt} summary={summary} task={task} usage={usage} />
      <div className="flex flex-1 flex-col md:grid md:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)]">
        <section
          aria-label="Result"
          className="flex min-h-[22rem] flex-col gap-3 md:order-2 md:h-[calc(100dvh-5.5rem)] md:py-6 md:pr-8 md:pl-8"
        >
          {pane}
          <SessionRuns
            editing={editing}
            runs={runs}
            setShown={setShown}
            shown={shown}
          />
        </section>
        <section
          aria-label="Settings for this run"
          className="border-border flex flex-col md:order-1 md:h-[calc(100dvh-5.5rem)] md:border-r"
        >
          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <TaskFields draft={draft} options={options} set={set} task={task} />
            {maskProblem === null ? null : (
              <p className="type-small text-bad pt-3" role="alert">
                {maskProblem}
              </p>
            )}
          </div>
          <div className="bg-background border-border sticky bottom-[var(--bar)] flex flex-col gap-3 border-t px-4 py-4 md:bottom-0 md:px-6">
            <Estimate
              built={built}
              error={quote.error}
              quote={quote.data}
              set={set}
            />
            {startError === null ? null : (
              <p className="type-small text-bad" role="alert">
                {startProblem(startError)}
              </p>
            )}
            <button
              className="app-button is-primary w-full"
              disabled={!ready || start.isPending}
              onClick={() => {
                start.mutate();
              }}
              type="button"
            >
              {start.isPending
                ? "Starting…"
                : runs.length > 0
                  ? "Run again"
                  : "Run"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
