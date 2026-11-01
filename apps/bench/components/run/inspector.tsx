"use client";

import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useEffectEvent } from "react";
import type { ReactNode } from "react";

import { formatDimensions, formatSeconds, formatUsd } from "@/lib/format";
import { modelNameOf } from "@/lib/model-names";
import type {
  ManualRatingRecord,
  RunSummary,
  SampleRecord,
} from "@/lib/runs/types";
import { cn } from "@/lib/utils";

import { JudgePanel } from "./judge-panel";

interface InspectorProps {
  readonly manualRatings: readonly ManualRatingRecord[];
  readonly onClose: () => void;
  readonly onIndexChange: (index: number) => void;
  /** The index in `samples` of the image on show. */
  readonly index: number;
  readonly run: RunSummary;
  /** Every image that can be opened, in the order the sheet shows them. */
  readonly samples: readonly SampleRecord[];
}

const Measure = ({
  children,
  hideOnPhone = false,
  label,
}: {
  readonly children: ReactNode;
  readonly hideOnPhone?: boolean;
  readonly label: string;
}) => (
  <div
    className={cn(
      "border-border flex flex-col gap-1 pl-3 first:border-l-0 first:pl-0 max-md:border-l md:flex-row md:items-center md:justify-between md:border-b md:py-3 md:pl-0",
      hideOnPhone ? "max-md:hidden" : ""
    )}
  >
    <dt className="text-muted type-small">{label}</dt>
    <dd className="type-small m-0 tabular-nums">{children}</dd>
  </div>
);

/** One image opened: the whole picture on the plate, and beside it the Model,
 * your rating, the prompt and the numbers behind the image. Arrow keys move
 * between images and Escape closes. It replaces the run's sheet in place, so
 * the rail of runs stays where it was. */
export const Inspector = ({
  index,
  manualRatings,
  onClose,
  onIndexChange,
  run,
  samples,
}: InspectorProps) => {
  const sample = samples[index];
  const count = samples.length;
  const showPrevious = () => {
    onIndexChange((index - 1 + count) % count);
  };
  const showNext = () => {
    onIndexChange((index + 1) % count);
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    switch (event.key) {
      case "Escape": {
        onClose();
        break;
      }
      case "ArrowLeft": {
        showPrevious();
        break;
      }
      case "ArrowRight": {
        showNext();
        break;
      }
      default: {
        break;
      }
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (sample === undefined || sample.imageUrl === null) {
    return null;
  }
  const name = modelNameOf(sample.modelAlias, sample.modelName);
  const rating = manualRatings.find((entry) => entry.sampleId === sample.id);
  const contended = run.concurrency > 1;
  const notes = [
    sample.droppedParams.includes("resolution")
      ? "Resolution ignored"
      : `Resolution ${run.resolution}`,
    contended ? `Timings contended ×${run.concurrency}` : null,
  ].filter((note) => note !== null);

  const arrows = (
    <div className="flex items-center gap-2">
      <button
        aria-label="Previous image"
        className="app-button is-icon"
        onClick={showPrevious}
        type="button"
      >
        <ArrowLeftIcon aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
      <span className="type-small min-w-12 text-center tabular-nums">
        {index + 1} of {count}
      </span>
      <button
        aria-label="Next image"
        className="app-button is-icon"
        onClick={showNext}
        type="button"
      >
        <ArrowRightIcon aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
    </div>
  );

  return (
    <section aria-label="Image" className="flex flex-col">
      <header className="border-border flex h-[3.75rem] items-center justify-between gap-4 border-b px-4 md:px-6">
        <h1 className="type-title truncate md:hidden">
          Image {index + 1} of {count}
        </h1>
        <h1 className="type-title truncate max-md:hidden">{run.prompt}</h1>
        <div className="flex items-center gap-2">
          <div className="md:hidden">{arrows}</div>
          <button
            className="app-button max-md:hidden"
            onClick={onClose}
            type="button"
          >
            Close
            <XIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
          <button
            aria-label="Close"
            className="board-quiet hover:bg-surface md:hidden"
            onClick={onClose}
            type="button"
          >
            <XIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row md:items-start md:gap-6 md:p-6">
        <div className="app-plate flex flex-col gap-6 p-6 md:w-[34.5rem] md:shrink-0">
          <div className="relative aspect-square w-full">
            <Image
              alt={`${name}, sample ${sample.sampleIndex}`}
              className="object-contain"
              fill
              sizes="(width < 48rem) 100vw, 504px"
              src={sample.imageUrl}
              unoptimized
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-plate-muted type-small tabular-nums max-md:hidden">
              {formatDimensions(sample.width, sample.height)}
            </p>
            <div className="max-md:hidden">{arrows}</div>
          </div>
        </div>

        <div className="app-panel flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-col">
            <p className="type-body font-medium">{name}</p>
            <p className="text-muted type-small">Sample {sample.sampleIndex}</p>
          </div>

          <div className="flex items-center justify-between md:flex-col md:items-start">
            <p className="text-muted type-small">Your rating</p>
            <JudgePanel
              manualRating={rating}
              runId={run.id}
              sampleId={sample.id}
            />
          </div>

          <div className="flex flex-col max-md:hidden">
            <p className="text-muted type-small">Prompt</p>
            <p className="type-body">{run.prompt}</p>
          </div>

          <dl className="m-0 grid grid-cols-3 md:grid-cols-1">
            <Measure label="Provider time">
              {formatSeconds(sample.providerMs)}
            </Measure>
            <Measure hideOnPhone label="Total time">
              {formatSeconds(sample.totalMs)}
            </Measure>
            <Measure label="Estimated cost">
              {formatUsd(
                sample.costRefinedMicros ?? sample.costEstimatedMicros
              )}
            </Measure>
            <Measure label="Image size">
              {formatDimensions(sample.width, sample.height)}
            </Measure>
          </dl>

          <div className="text-muted type-small flex flex-col">
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
