"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RunPane } from "@/components/shell/run-pane";
import { RunsRail, RunsSheet } from "@/components/shell/runs-rail";
import type { RailProgress } from "@/components/shell/runs-rail";
import { RunSelectionProvider } from "@/components/shell/selection";
import type { RunSelection } from "@/components/shell/selection";
import { TopBar } from "@/components/shell/top-bar";
import { ApiError, useCreateRun, usePreview, useRun } from "@/lib/queries";
import type { RunDraftPatch } from "@/lib/run-spec";
import { initialRunDraft, specFromDraft, toggleModel } from "@/lib/run-spec";
import type { RunDetail } from "@/lib/runs/types";

const railProgressFor = (
  detail: RunDetail | undefined
): RailProgress | null => {
  if (detail === undefined || detail.run.status !== "running") {
    return null;
  }
  return {
    done: detail.samples.filter(
      (sample) => sample.status === "completed" || sample.status === "failed"
    ).length,
    total: detail.samples.length,
  };
};

const messageFor = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

/** Which run the main pane shows, kept in sync with the URL in both
 * directions.
 *
 * The pending box is why this is a hook rather than two `useState` calls: a
 * rail click updates the selection immediately and asks the router to catch
 * up, so a `reportRouteRun` arriving from the *previous* url must not undo
 * it. `null` means "nothing in flight"; a box means "waiting for this id". */
const useShellSelection = (
  onNavigate: () => void
): RunSelection & { readonly selectedRunId: string | null } => {
  const router = useRouter();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const pendingRef = useRef<{ readonly id: string | null } | null>(null);

  const selectRun = useCallback(
    (runId: string | null) => {
      pendingRef.current = { id: runId };
      setSelectedRunId(runId);
      onNavigate();
      router.push(runId === null ? "/" : `/runs/${runId}`, { scroll: false });
    },
    [onNavigate, router]
  );

  const reportRouteRun = useCallback((runId: string | null) => {
    const pending = pendingRef.current;
    if (pending !== null && pending.id !== runId) {
      return;
    }
    pendingRef.current = null;
    setSelectedRunId(runId);
  }, []);

  return useMemo(
    () => ({ reportRouteRun, selectRun, selectedRunId }),
    [reportRouteRun, selectRun, selectedRunId]
  );
};

/** Keyboard-first is the difference between a tool and a form: `⌘K` focuses
 * the prompt, `⌘↵` runs from anywhere. `Escape` is left to Radix, which owns
 * it for the models popover and the lightbox alike. */
const useShellShortcuts = (
  promptRef: RefObject<HTMLInputElement | null>,
  onRun: () => void
) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        promptRef.current?.focus();
        promptRef.current?.select();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onRun();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onRun, promptRef]);
};

/** The whole app, as one screen.
 *
 * It lives in the root layout rather than in a page so that `/` and
 * `/runs/[id]` never remount it: `/runs/[id]` is still a real deep link, but
 * it is a *selection* inside this shell, not a second layout
 * (`docs/design/specs/design-bench-shell.md`). Pages are reduced to a
 * `RouteRun` that reports the id in the URL and renders nothing.
 *
 * Three regions, and the document never scrolls at `md` and above: a fixed
 * 56px top bar, a fixed 220px rail with its own scroll frame, and a main
 * pane of pinned 64px verdicts, one scroll frame, and a 40px tab bar.
 *
 * The top bar is deliberately forward-looking — it composes the *next* run,
 * which is why its summary line carries an estimate. Selecting a run in the
 * rail therefore does not rewrite it; the selected run's own prompt is shown
 * in full in its rail entry, and its shape in the tab bar's meta line. */
export const BenchShell = ({ children }: { readonly children: ReactNode }) => {
  const [draft, setDraft] = useState(initialRunDraft);
  const [runsSheetOpen, setRunsSheetOpen] = useState(false);
  const promptRef = useRef<HTMLInputElement>(null);

  const createRun = useCreateRun();
  const { reset: resetCreateRun } = createRun;

  const closeRunsSheet = useCallback(() => {
    setRunsSheetOpen(false);
  }, []);
  const selection = useShellSelection(closeRunsSheet);
  const { selectRun, selectedRunId } = selection;

  const patch = useCallback(
    (next: RunDraftPatch) => {
      setDraft((current) => ({ ...current, ...next }));
      resetCreateRun();
    },
    [resetCreateRun]
  );

  const onToggleModel = useCallback(
    (alias: string) => {
      setDraft((current) => ({
        ...current,
        models: toggleModel(current.models, alias),
      }));
      resetCreateRun();
    },
    [resetCreateRun]
  );

  const spec = useMemo(() => specFromDraft(draft), [draft]);
  const specIsRunnable = spec.models.length > 0 && spec.prompt.length > 0;
  const preview = usePreview(spec, specIsRunnable);

  const selectedRun = useRun(selectedRunId ?? "");
  const detail = selectedRun.data;
  const isRunning = detail?.run.status === "running" || createRun.isPending;
  const canRun = specIsRunnable && !isRunning;

  const handleRun = useCallback(() => {
    if (!canRun) {
      return;
    }
    createRun.mutate(spec, {
      onSuccess: ({ runId }) => {
        selectRun(runId);
      },
    });
  }, [canRun, createRun, selectRun, spec]);

  useShellShortcuts(promptRef, handleRun);

  const progress = railProgressFor(detail);

  return (
    <RunSelectionProvider value={selection}>
      {children}
      <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0 md:overflow-hidden">
        <TopBar
          canRun={canRun}
          draft={draft}
          isRunning={isRunning}
          onOpenRuns={() => {
            setRunsSheetOpen(true);
          }}
          onPatch={patch}
          onRun={handleRun}
          onToggleModel={onToggleModel}
          preview={preview.data}
          promptRef={promptRef}
          runError={
            createRun.isError
              ? messageFor(createRun.error, "Could not start the run.")
              : null
          }
        />

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <RunsRail
            onSelect={selectRun}
            progress={progress}
            selectedRunId={selectedRunId}
          />
          <RunPane
            detail={detail}
            draft={draft}
            errorMessage={
              selectedRunId !== null && selectedRun.isError
                ? messageFor(selectedRun.error, "Could not load this run.")
                : null
            }
            isLoading={selectedRunId !== null && selectedRun.isLoading}
            runId={selectedRunId}
          />
        </div>
      </div>

      <RunsSheet
        onOpenChange={setRunsSheetOpen}
        onSelect={selectRun}
        open={runsSheetOpen}
        progress={progress}
        selectedRunId={selectedRunId}
      />
    </RunSelectionProvider>
  );
};
