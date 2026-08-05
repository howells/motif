"use client";

import { createContext, use, useEffect } from "react";

/** Which run the main pane is showing, and how to change it.
 *
 * The shell lives in the root layout, not in a page, so that moving between
 * `/` and `/runs/[id]` never remounts it — the rail keeps its scroll
 * position, the prompt keeps its text, and the contact sheet keeps its
 * frames. The pages are reduced to reporting which run their URL names
 * (`RouteRun` below); the shell holds the selection itself. */
export interface RunSelection {
  /** Called by the route's page component with the id in the URL. */
  readonly reportRouteRun: (runId: string | null) => void;
  /** Called by the rail, and after a run is created. Updates the URL too. */
  readonly selectRun: (runId: string | null) => void;
  readonly selectedRunId: string | null;
}

const RunSelectionContext = createContext<RunSelection | null>(null);

export const RunSelectionProvider = RunSelectionContext.Provider;

export const useRunSelection = (): RunSelection => {
  const value = use(RunSelectionContext);
  if (value === null) {
    throw new Error("useRunSelection must be called inside the bench shell.");
  }
  return value;
};

/** A page's entire body. `/runs/[id]` is still a real, deep-linkable route —
 * it is just no longer a second *layout*: it selects a run inside the one
 * shell rather than replacing it. */
// oxlint-disable-next-line sonarjs/function-name -- a React component, so PascalCase is required; the rule only sees a function returning `null` because this component deliberately renders nothing
export const RouteRun = ({
  runId,
}: {
  readonly runId: string | null;
}): null => {
  const { reportRouteRun } = useRunSelection();
  useEffect(() => {
    reportRouteRun(runId);
  }, [reportRouteRun, runId]);
  return null;
};
