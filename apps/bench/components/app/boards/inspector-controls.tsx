"use client";

import { useRef } from "react";

import { useBoard } from "@/components/app/boards/board-context";
import { MinusIcon, PlusIcon } from "@/components/app/boards/icons";
import type { NodeViewOf } from "@/lib/app/boards/canvas";
import { BOARD_ASPECTS } from "@/lib/app/boards/model";

export function Section({
  children,
  label,
  trailing,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
  readonly trailing?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="type-small text-muted flex items-baseline justify-between">
        <span>{label}</span>
        {trailing}
      </h3>
      {children}
    </section>
  );
}

/** Text that saves itself a moment after typing stops, and on leaving the
 * field. Nothing is spent; what it feeds goes Stale. The field keeps what is
 * typed; the saved value only seeds it. */
export function DraftText({
  label,
  multiline = false,
  onCommit,
  placeholder,
  value,
}: {
  readonly label: string;
  readonly multiline?: boolean;
  readonly onCommit: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(value);
  const commit = (next: string) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (next !== saved.current) {
      saved.current = next;
      onCommit(next);
    }
  };
  const change = (next: string) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      commit(next);
    }, 800);
  };
  const shared = {
    "aria-label": label,
    className: multiline ? "board-field min-h-31" : "board-field",
    defaultValue: value,
    placeholder,
  };
  return multiline ? (
    <textarea
      {...shared}
      onBlur={(event) => {
        commit(event.target.value);
      }}
      onChange={(event) => {
        change(event.target.value);
      }}
      rows={5}
    />
  ) : (
    <input
      {...shared}
      onBlur={(event) => {
        commit(event.target.value);
      }}
      onChange={(event) => {
        change(event.target.value);
      }}
    />
  );
}

export function Segments<T extends string | number>({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}) {
  return (
    <fieldset className="board-segmented">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          key={String(option.value)}
          onClick={() => {
            onChange(option.value);
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

export function AspectField({
  allowLook,
  node,
}: {
  readonly allowLook: boolean;
  readonly node: NodeViewOf<"compare" | "generate" | "reframe">;
}) {
  const { editSettings } = useBoard();
  const value = node.settings.aspect ?? "";
  return (
    <Section label="Aspect">
      <select
        aria-label="Aspect"
        className="board-field"
        onChange={(event) => {
          editSettings(node, {
            aspect: event.target.value === "" ? undefined : event.target.value,
          });
        }}
        value={value}
      >
        {allowLook ? <option value="">From the Look</option> : null}
        {BOARD_ASPECTS.map((aspect) => (
          <option key={aspect} value={aspect}>
            {aspect.replace(":", " : ")}
          </option>
        ))}
      </select>
    </Section>
  );
}

export function Samples({
  node,
}: {
  readonly node: NodeViewOf<"generate" | "vary">;
}) {
  const { editSettings } = useBoard();
  const { count } = node.settings;
  return (
    <Section label="Samples">
      <div className="board-outline flex h-11 w-33 items-center rounded">
        <button
          aria-label="One fewer"
          className="board-quiet"
          disabled={count <= 1}
          onClick={() => {
            editSettings(node, { count: count - 1 });
          }}
          type="button"
        >
          <MinusIcon />
        </button>
        <output className="flex-1 text-center text-sm leading-5 tabular-nums">
          {count}
        </output>
        <button
          aria-label="One more"
          className="board-quiet"
          disabled={count >= 4}
          onClick={() => {
            editSettings(node, { count: count + 1 });
          }}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>
    </Section>
  );
}
