"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { Composer } from "@/components/shell/composer";
import { RunPane } from "@/components/shell/run-pane";
import { RunsRail, RunsSheet } from "@/components/shell/runs-rail";
import { RunSelectionProvider } from "@/components/shell/selection";
import type { RunSelection } from "@/components/shell/selection";
import { PortalContext } from "@/lib/portal";
import { ApiError, useCreateRun, usePreview, useRun } from "@/lib/queries";
import type { RunDraftPatch } from "@/lib/run-spec";
import { initialRunDraft, specFromDraft, toggleModel } from "@/lib/run-spec";

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

  const selectRun = (runId: string | null) => {
    pendingRef.current = { id: runId };
    setSelectedRunId(runId);
    onNavigate();
    router.push(runId === null ? "/bench" : `/bench/runs/${runId}`, {
      scroll: false,
    });
  };

  const reportRouteRun = (runId: string | null) => {
    const pending = pendingRef.current;
    if (pending !== null && pending.id !== runId) {
      return;
    }
    pendingRef.current = null;
    setSelectedRunId(runId);
  };

  return { reportRouteRun, selectRun, selectedRunId };
};

/** Keyboard-first is the difference between a tool and a form: `⌘K` focuses
 * the prompt, `⌘↵` runs from anywhere. `Escape` is left to Radix, which owns
 * it for the models popover and Aperto's expanded image view alike. */
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

/** The Bench, inside the site's shell.
 *
 * It lives in the bench layout rather than in a page so that `/bench` and
 * `/bench/runs/[id]` never remount it: a run URL is still a real deep link,
 * but it is a *selection* inside this shell, not a second layout. Pages are
 * reduced to a `RouteRun` that reports the id in the URL and renders nothing.
 *
 * The page scrolls. Two regions sit in the shared shell's main area: the
 * column of runs, which holds its place beside the pane, and the pane, which
 * is the head naming the view, the composer for the next run, and the run.
 *
 * The composer describes the *next* run, so choosing a past run does not
 * rewrite it. `portal` is where popovers, sheets and tooltips are drawn: inside
 * the shell, where the paper palette applies, not on the document body. */
export const BenchShell = ({ children }: { readonly children: ReactNode }) => {
  const [draft, setDraft] = useState(initialRunDraft);
  const [runsSheetOpen, setRunsSheetOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  const createRun = useCreateRun();
  const { reset: resetCreateRun } = createRun;

  const closeRunsSheet = () => {
    setRunsSheetOpen(false);
  };
  const selection = useShellSelection(closeRunsSheet);
  const { selectRun, selectedRunId } = selection;

  const patch = (next: RunDraftPatch) => {
    setDraft((current) => ({ ...current, ...next }));
    resetCreateRun();
  };

  const onToggleModel = (alias: string) => {
    setDraft((current) => ({
      ...current,
      models: toggleModel(current.models, alias),
    }));
    resetCreateRun();
  };

  const spec = specFromDraft(draft);
  const specIsRunnable = spec.models.length > 0 && spec.prompt.length > 0;
  const preview = usePreview(spec, specIsRunnable);

  const selectedRun = useRun(selectedRunId ?? "");
  const detail = selectedRun.data;
  const isRunning = detail?.run.status === "running" || createRun.isPending;
  const canRun = specIsRunnable && !isRunning;

  const handleRun = () => {
    if (!canRun) {
      return;
    }
    createRun.mutate(spec, {
      onSuccess: ({ runId }) => {
        selectRun(runId);
      },
    });
  };

  useShellShortcuts(promptRef, handleRun);

  const startNewRun = () => {
    selectRun(null);
  };

  return (
    <RunSelectionProvider value={selection}>
      {children}
      <PortalContext.Provider value={portal}>
        <div className="flex min-h-dvh flex-col md:flex-row">
          <RunsRail
            onNewRun={startNewRun}
            onSelect={selectRun}
            selectedRunId={selectedRunId}
          />
          <RunPane
            composer={
              <Composer
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
                    ? messageFor(createRun.error, "Could not start the run")
                    : null
                }
              />
            }
            detail={detail}
            draft={draft}
            errorMessage={
              selectedRunId !== null && selectedRun.isError
                ? messageFor(selectedRun.error, "Could not load this run")
                : null
            }
            isLoading={selectedRunId !== null && selectedRun.isLoading}
            preview={preview.data}
            runId={selectedRunId}
          />
        </div>

        <RunsSheet
          onNewRun={startNewRun}
          onOpenChange={setRunsSheetOpen}
          onSelect={selectRun}
          open={runsSheetOpen}
          selectedRunId={selectedRunId}
        />
      </PortalContext.Provider>
      <div ref={setPortal} />
    </RunSelectionProvider>
  );
};
