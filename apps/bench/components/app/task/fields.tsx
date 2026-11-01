"use client";

import { Field, Segmented } from "@/components/app/controls";
import { ReferencesField, SourceField } from "@/components/app/task/pickers";
import type { Draft } from "@/lib/app/client/task-draft";
import type { AppTaskId } from "@/lib/site/commands";

export interface LookChoice {
  readonly acceptsMood: boolean;
  readonly aspect: string;
  readonly id: string;
  readonly label: string;
}

export interface TaskOptions {
  readonly aspects: readonly string[];
  readonly looks: readonly LookChoice[];
  readonly maxImages: number;
  readonly maxReferences: number;
  readonly moods: readonly { readonly id: string; readonly label: string }[];
}

interface FieldsProps {
  readonly draft: Draft;
  readonly options: TaskOptions;
  readonly set: (patch: Partial<Draft>) => void;
}

const TIER_OPTIONS = [
  { label: "Motif decides", value: "" },
  { label: "Fast", value: "fast" },
  { label: "Balanced", value: "balanced" },
  { label: "Quality", value: "quality" },
] as const;

function CountField({ draft, options, set }: FieldsProps) {
  return (
    <Field label="Images">
      <Segmented
        label="Images"
        onChange={(count) => {
          set({ count });
        }}
        options={Array.from({ length: options.maxImages }, (_, index) => ({
          label: String(index + 1),
          value: index + 1,
        }))}
        value={draft.count}
      />
    </Field>
  );
}

function PromptField({
  aside,
  id,
  label,
  placeholder,
  set,
  value,
}: {
  readonly aside?: string;
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly set: (patch: Partial<Draft>) => void;
  readonly value: string;
}) {
  return (
    <Field aside={aside} htmlFor={id} label={label}>
      <textarea
        className="app-textarea"
        id={id}
        maxLength={4000}
        onChange={(event) => {
          set({ prompt: event.target.value });
        }}
        placeholder={placeholder}
        value={value}
      />
    </Field>
  );
}

function LookAndMood({ draft, options, set }: FieldsProps) {
  const look = options.looks.find((item) => item.id === draft.look);
  const moodless = look?.acceptsMood === false;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field htmlFor="look" label="Look">
        <select
          className="app-select"
          id="look"
          onChange={(event) => {
            const next = options.looks.find(
              (item) => item.id === event.target.value
            );
            set({
              look: event.target.value,
              ...(next?.acceptsMood === false ? { mood: "" } : {}),
            });
          }}
          value={draft.look}
        >
          <option value="">None</option>
          {options.looks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="mood" label="Mood">
        <select
          className="app-select"
          disabled={moodless}
          id="mood"
          onChange={(event) => {
            set({ mood: event.target.value });
          }}
          value={draft.mood}
        >
          <option value="">{moodless ? "Set by the Look" : "None"}</option>
          {options.moods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function AspectField({ draft, options, set }: FieldsProps) {
  const look = options.looks.find((item) => item.id === draft.look);
  return (
    <Field
      aside={look === undefined ? undefined : `${look.aspect} from the Look`}
      htmlFor="aspect"
      label="Aspect"
    >
      <select
        className="app-select"
        id="aspect"
        onChange={(event) => {
          set({ aspect: event.target.value });
        }}
        value={draft.aspect}
      >
        <option value="">
          {look === undefined
            ? "Model default"
            : `From the Look, ${look.aspect}`}
        </option>
        {options.aspects.map((aspect) => (
          <option key={aspect} value={aspect}>
            {aspect}
          </option>
        ))}
      </select>
    </Field>
  );
}

function GenerateFields(props: FieldsProps) {
  const { draft, options, set } = props;
  return (
    <>
      <PromptField
        id="prompt"
        label="Prompt"
        placeholder="a celadon jug and a linen cloth on a plaster shelf"
        set={set}
        value={draft.prompt}
      />
      <ReferencesField
        max={options.maxReferences}
        onChange={(references) => {
          set({ references });
        }}
        references={draft.references}
      />
      <LookAndMood {...props} />
      <AspectField {...props} />
      <CountField {...props} />
    </>
  );
}

function VaryFields(props: FieldsProps) {
  return (
    <>
      <PromptField
        aside="Optional"
        id="prompt"
        label="Steer it"
        placeholder="the same jug, in morning light"
        set={props.set}
        value={props.draft.prompt}
      />
      <CountField {...props} />
    </>
  );
}

function EraseFields({ draft, set }: FieldsProps) {
  return (
    <>
      <Field label="Choose what to remove">
        <Segmented
          label="Choose what to remove"
          onChange={(eraseMode) => {
            set({ eraseMode });
          }}
          options={[
            { label: "Describe", value: "describe" },
            { label: "Paint", value: "paint" },
            { label: "Boxes", value: "boxes" },
            { label: "All text", value: "text" },
          ]}
          value={draft.eraseMode}
        />
      </Field>
      {draft.eraseMode === "describe" ? (
        <Field htmlFor="what" label="What to remove">
          <input
            className="app-input"
            id="what"
            maxLength={500}
            onChange={(event) => {
              set({ prompt: event.target.value });
            }}
            placeholder="the small amber bottle"
            value={draft.prompt}
          />
        </Field>
      ) : null}
      {draft.eraseMode === "paint" ? (
        <Field aside="Optional" htmlFor="fill" label="Fill the gap with">
          <input
            className="app-input"
            id="fill"
            maxLength={500}
            onChange={(event) => {
              set({ fill: event.target.value });
            }}
            placeholder="Nothing, just remove it"
            value={draft.fill}
          />
        </Field>
      ) : null}
      {draft.eraseMode === "text" ? (
        <p className="type-small text-muted">
          Every piece of text in the image goes.
        </p>
      ) : null}
    </>
  );
}

const SIDES = ["top", "right", "bottom", "left"] as const;

function ReframeFields({ draft, options, set }: FieldsProps) {
  return (
    <>
      <Field label="New canvas">
        <Segmented
          label="New canvas"
          onChange={(reframeMode) => {
            set({ reframeMode });
          }}
          options={[
            { label: "A ratio", value: "ratio" },
            { label: "Add space", value: "margin" },
          ]}
          value={draft.reframeMode}
        />
      </Field>
      {draft.reframeMode === "ratio" ? (
        <Field htmlFor="ratio" label="Ratio">
          <select
            className="app-select"
            id="ratio"
            onChange={(event) => {
              set({ ratio: event.target.value });
            }}
            value={draft.ratio}
          >
            {options.aspects.map((aspect) => (
              <option key={aspect} value={aspect}>
                {aspect}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="app-label">Space to add, in pixels</legend>
          {SIDES.map((side) => (
            <label
              className="type-small text-muted flex flex-col gap-1 capitalize"
              key={side}
            >
              {side}
              <input
                className="app-input"
                inputMode="numeric"
                max={2048}
                min={0}
                onChange={(event) => {
                  const value = Math.min(
                    2048,
                    Math.max(0, Math.round(Number(event.target.value) || 0))
                  );
                  set({ margin: { ...draft.margin, [side]: value } });
                }}
                type="number"
                value={draft.margin[side]}
              />
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function UpscaleFields({ draft, set }: FieldsProps) {
  return (
    <>
      <Field label="Scale">
        <Segmented
          label="Scale"
          onChange={(scale) => {
            set({ scale });
          }}
          options={[
            { label: "2×", value: 2 },
            { label: "4×", value: 4 },
          ]}
          value={draft.scale}
        />
      </Field>
      <Field label="Detail">
        <Segmented
          label="Detail"
          onChange={(detail) => {
            set({ detail });
          }}
          options={[
            { label: "Faithful", value: "faithful" },
            { label: "Generative", value: "generative" },
            { label: "Creative", value: "creative" },
          ]}
          value={draft.detail}
        />
      </Field>
      <label className="min-h-control flex items-center gap-3">
        <input
          checked={draft.transparent}
          className="size-5 accent-current"
          onChange={(event) => {
            set({ transparent: event.target.checked });
          }}
          type="checkbox"
        />
        <span className="type-body">Keep transparency</span>
      </label>
    </>
  );
}

/** The form for one Task. Every Task but generate starts from a Source. */
export function TaskFields(props: FieldsProps & { readonly task: AppTaskId }) {
  const { draft, set, task } = props;
  return (
    <div className="flex flex-col gap-6">
      {task === "generate" ? (
        <GenerateFields {...props} />
      ) : (
        <SourceField
          label="Source"
          onPick={(source) => {
            set({ boxes: [], maskAssetId: null, source });
          }}
          source={draft.source}
        />
      )}
      {task === "vary" ? <VaryFields {...props} /> : null}
      {task === "erase" ? <EraseFields {...props} /> : null}
      {task === "reframe" ? <ReframeFields {...props} /> : null}
      {task === "upscale" ? <UpscaleFields {...props} /> : null}
      <Field label="Tier">
        <Segmented
          label="Tier"
          onChange={(tier) => {
            set({ model: null, tier });
          }}
          options={TIER_OPTIONS}
          value={draft.tier}
        />
      </Field>
    </div>
  );
}
