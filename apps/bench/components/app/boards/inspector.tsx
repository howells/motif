"use client";

import { useBoard } from "@/components/app/boards/board-context";
import { CloseIcon, PlayIcon, PlusIcon } from "@/components/app/boards/icons";
import {
  AspectField,
  DraftText,
  Samples,
  Section,
  Segments,
} from "@/components/app/boards/inspector-controls";
import {
  CompareModels,
  ModelChoice,
} from "@/components/app/boards/inspector-models";
import { Results } from "@/components/app/boards/inspector-results";
import { ProcessLog } from "@/components/app/boards/process";
import { MediaImage } from "@/components/app/media-image";
import type { TaskOptions } from "@/components/app/task/fields";
import { modelsOf } from "@/lib/app/boards/canvas";
import type { NodeViewOf } from "@/lib/app/boards/canvas";
import { NODE_LABELS, isRunnable } from "@/lib/app/boards/model";
import { USAGE_HOLD_MICROS_PER_IMAGE } from "@/lib/app/budget/policy";
import type { NodeViewData } from "@/lib/app/client/board-schemas";
import { formatCap, formatUsd } from "@/lib/app/money";

function SourceFields({ node }: { readonly node: NodeViewData }) {
  const { chooseSource } = useBoard();
  return (
    <Section label="Image">
      {node.pick === null ? (
        <button
          className="board-button w-full"
          onClick={() => {
            chooseSource(node.id);
          }}
          type="button"
        >
          <PlusIcon />
          Choose an image
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="bg-surface relative overflow-hidden rounded"
            style={{
              aspectRatio:
                node.pick.width !== null && node.pick.height !== null
                  ? `${node.pick.width} / ${node.pick.height}`
                  : "1",
            }}
          >
            <MediaImage
              alt="The Source image"
              fit="contain"
              sizes="312px"
              src={node.pick.url}
            />
          </div>
          <button
            className="board-button"
            onClick={() => {
              chooseSource(node.id);
            }}
            type="button"
          >
            Choose another image
          </button>
        </div>
      )}
    </Section>
  );
}

function PromptFields({
  node,
  options,
}: {
  readonly node: NodeViewOf<"prompt">;
  readonly options: TaskOptions;
}) {
  const { editSettings } = useBoard();
  const { text } = node.settings;
  const look = node.settings.look ?? "";
  const mood = node.settings.mood ?? "";
  const lookEntry = options.looks.find((entry) => entry.id === look);
  const moodAllowed = lookEntry === undefined || lookEntry.acceptsMood;
  return (
    <>
      <Section label="Prompt">
        <DraftText
          label="Prompt"
          multiline
          onCommit={(value) => {
            editSettings(node, { text: value });
          }}
          placeholder="Write what you want to see"
          value={text}
        />
      </Section>
      <Section label="Look">
        <select
          aria-label="Look"
          className="board-field"
          onChange={(event) => {
            const next = options.looks.find(
              (entry) => entry.id === event.target.value
            );
            editSettings(node, {
              look: event.target.value === "" ? undefined : event.target.value,
              ...(next !== undefined &&
                !next.acceptsMood && { mood: undefined }),
            });
          }}
          value={look}
        >
          <option value="">None</option>
          {options.looks.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </Section>
      <Section label="Mood">
        <select
          aria-label="Mood"
          className="board-field disabled:opacity-50"
          disabled={!moodAllowed}
          onChange={(event) => {
            editSettings(node, {
              mood: event.target.value === "" ? undefined : event.target.value,
            });
          }}
          value={moodAllowed ? mood : ""}
        >
          <option value="">
            {moodAllowed ? "None" : "This Look sets its own"}
          </option>
          {options.moods.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </Section>
    </>
  );
}

function VaryFields({ node }: { readonly node: NodeViewOf<"vary"> }) {
  const { editSettings } = useBoard();
  return (
    <>
      <Section label="Change">
        <DraftText
          label="What to change"
          onCommit={(value) => {
            editSettings(node, { prompt: value });
          }}
          placeholder="Stay close to the original"
          value={node.settings.prompt}
        />
      </Section>
      <ModelChoice node={node} />
      <Samples node={node} />
    </>
  );
}

function EraseFields({ node }: { readonly node: NodeViewOf<"erase"> }) {
  const { editSettings } = useBoard();
  const { mode } = node.settings;
  return (
    <>
      <Section label="Remove">
        <div className="flex flex-col gap-2">
          <Segments
            label="What to remove"
            onChange={(value) => {
              editSettings(node, { mode: value, model: undefined });
            }}
            options={[
              { label: "Something I name", value: "describe" },
              { label: "All text", value: "text" },
            ]}
            value={mode}
          />
          {mode === "describe" ? (
            <DraftText
              label="What to remove"
              onCommit={(value) => {
                editSettings(node, { prompt: value });
              }}
              placeholder="The smallest bottle"
              value={node.settings.prompt}
            />
          ) : null}
        </div>
      </Section>
      <ModelChoice node={node} />
    </>
  );
}

function UpscaleFields({ node }: { readonly node: NodeViewOf<"upscale"> }) {
  const { editSettings } = useBoard();
  return (
    <>
      <Section label="Scale">
        <Segments
          label="Scale"
          onChange={(value) => {
            editSettings(node, { scale: value });
          }}
          options={[
            { label: "2×", value: 2 },
            { label: "4×", value: 4 },
          ]}
          value={node.settings.scale}
        />
      </Section>
      <Section label="Detail">
        <Segments
          label="Detail"
          onChange={(value) => {
            editSettings(node, { detail: value, model: undefined });
          }}
          options={[
            { label: "Faithful", value: "faithful" },
            { label: "Generative", value: "generative" },
            { label: "Creative", value: "creative" },
          ]}
          value={node.settings.detail}
        />
      </Section>
      <ModelChoice node={node} />
    </>
  );
}

function TaskFields({ node }: { readonly node: NodeViewData }) {
  switch (node.kind) {
    case "generate": {
      return (
        <>
          <ModelChoice node={node} />
          <AspectField allowLook node={node} />
          <Samples node={node} />
        </>
      );
    }
    case "vary": {
      return <VaryFields node={node} />;
    }
    case "erase": {
      return <EraseFields node={node} />;
    }
    case "reframe": {
      return (
        <>
          <AspectField allowLook={false} node={node} />
          <ModelChoice node={node} />
        </>
      );
    }
    case "cutout": {
      return <ModelChoice node={node} />;
    }
    case "upscale": {
      return <UpscaleFields node={node} />;
    }
    case "compare": {
      return (
        <>
          <CompareModels node={node} />
          <AspectField allowLook node={node} />
        </>
      );
    }
    case "prompt":
    case "source": {
      return null;
    }
    default: {
      throw new TypeError("Unknown node kind.");
    }
  }
}

const priceLine = (node: NodeViewData): string => {
  if (node.price === null || !node.price.ok) {
    return "";
  }
  const count =
    node.kind === "compare"
      ? modelsOf(node).length
      : node.kind === "generate" || node.kind === "vary"
        ? node.settings.count
        : 1;
  if (node.price.usage) {
    return `Billed by usage, up to ${formatCap(USAGE_HOLD_MICROS_PER_IMAGE)} an image`;
  }
  return count > 1
    ? `${count} × ${formatUsd(Math.round(node.price.listMicros / count))}`
    : "";
};

/** The selected node's settings, its results and its Run buttons. */
export function Inspector({
  node,
  options,
}: {
  readonly node: NodeViewData;
  readonly options: TaskOptions;
}) {
  const { now, openRun, process, select } = useBoard();
  const runnable = isRunnable(node.kind);
  return (
    <aside
      aria-label={`${NODE_LABELS[node.kind]} settings`}
      className="board-rule-left flex h-full w-90 shrink-0 flex-col bg-white"
    >
      <header className="board-rule-bottom flex h-15 shrink-0 items-center justify-between pr-2 pl-6">
        <h2 className="type-title">{NODE_LABELS[node.kind]}</h2>
        <button
          aria-label="Close the panel"
          className="board-quiet hover:bg-surface"
          onClick={() => {
            select(null);
          }}
          type="button"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
        {node.kind === "prompt" ? (
          <PromptFields node={node} options={options} />
        ) : null}
        {node.kind === "source" ? <SourceFields node={node} /> : null}
        <TaskFields node={node} />
        {runnable && node.kind !== "compare" ? <Results node={node} /> : null}
        {runnable ? (
          <ProcessLog key={node.id} now={now} process={process(node.id)} />
        ) : null}
      </div>
      {runnable ? (
        <footer className="board-rule-top flex shrink-0 flex-col gap-3 px-6 pt-4 pb-5">
          <div className="flex items-baseline justify-between gap-3">
            {node.price?.ok === false ? (
              <span className="type-small text-bad">{node.price.reason}</span>
            ) : (
              <>
                <span className="type-small text-muted">{priceLine(node)}</span>
                <span className="board-figure">
                  {node.price?.ok === true
                    ? node.price.usage
                      ? `Up to ${formatCap(node.price.listMicros)}`
                      : formatUsd(node.price.listMicros)
                    : ""}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="board-button flex-1"
              onClick={() => {
                openRun(node.id, "downstream");
              }}
              type="button"
            >
              Run from here
            </button>
            <button
              className="board-button is-ink pr-4 pl-3"
              onClick={() => {
                openRun(node.id, "node");
              }}
              type="button"
            >
              <PlayIcon />
              Run
            </button>
          </div>
        </footer>
      ) : (
        <footer className="board-rule-top flex shrink-0 gap-2 px-6 pt-4 pb-5">
          <button
            className="board-button flex-1"
            onClick={() => {
              openRun(node.id, "downstream");
            }}
            type="button"
          >
            Run what it feeds
          </button>
        </footer>
      )}
    </aside>
  );
}
