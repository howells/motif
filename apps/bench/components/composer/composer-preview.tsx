"use client";

import type { UseMutationResult } from "@tanstack/react-query";

import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queries";
import type { PreviewResult, RunSpecInput } from "@/lib/runs/types";

import { PreviewTable } from "./preview-table";

/** A failed mutation, stated plainly on a `bad` left rule — the same shape
 * the aspect warning uses with a `warn` rule, so "something is off" reads
 * consistently across the composer without either becoming a tinted panel. */
const ErrorNote = ({
  error,
  fallback,
}: {
  readonly error: unknown;
  readonly fallback: string;
}) => (
  <p className="rounded-lg border border-border border-l-2 border-l-bad bg-surface-soft px-3.5 py-3 text-[13px] text-ink">
    {error instanceof ApiError ? error.message : fallback}
  </p>
);

interface ComposerPreviewProps {
  readonly canPreview: boolean;
  readonly createRun: UseMutationResult<{ runId: string }, Error, RunSpecInput>;
  readonly isPreviewCurrent: boolean;
  readonly onConfirmRun: () => void;
  readonly onRunPreview: () => void;
  readonly preview: UseMutationResult<PreviewResult, Error, RunSpecInput>;
  readonly runLabel: string;
}

/** The preview → confirm half of the composer. Split from `Composer` so that
 * component stays about state and this one stays about the two buttons and
 * everything that can go wrong between them.
 *
 * The confirm button is the composer's single accent-filled element
 * (`docs/design/specs/design-bench.md` allows at most two per screen):
 * spending money is the one irreversible thing on this page, so it takes the
 * fill and nothing else does. */
export const ComposerPreview = ({
  canPreview,
  createRun,
  isPreviewCurrent,
  onConfirmRun,
  onRunPreview,
  preview,
  runLabel,
}: ComposerPreviewProps) => (
  <Section
    action={
      <span className="text-[13px] text-muted">A dry run costs nothing.</span>
    }
    title="Preview"
  >
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={!canPreview || preview.isPending}
        onClick={onRunPreview}
        type="button"
      >
        {preview.isPending ? "Previewing…" : "Preview"}
      </Button>
      {canPreview ? null : (
        <span className="text-[13px] text-muted">
          Pick at least one model first.
        </span>
      )}
    </div>

    {preview.isError ? (
      <ErrorNote error={preview.error} fallback="Preview failed." />
    ) : null}

    {preview.data ? <PreviewTable preview={preview.data} /> : null}

    {createRun.isError ? (
      <ErrorNote error={createRun.error} fallback="Could not start the run." />
    ) : null}

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        disabled={!isPreviewCurrent || createRun.isPending}
        onClick={onConfirmRun}
        type="button"
        variant="accent"
      >
        {createRun.isPending ? "Starting…" : runLabel}
      </Button>
      {!isPreviewCurrent && preview.data ? (
        <span className="text-[13px] text-muted">
          The form changed since the last preview — preview again to confirm.
        </span>
      ) : null}
    </div>
  </Section>
);
