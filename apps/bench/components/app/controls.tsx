"use client";

import { useId } from "react";
import type { ReactNode } from "react";

/** A labelled field: the label on the left, an aside such as "Optional" on
 * the right, the control under both. */
export function Field({
  aside,
  children,
  htmlFor,
  label,
}: {
  readonly aside?: string;
  readonly children: ReactNode;
  readonly htmlFor?: string;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="app-label">
        {htmlFor === undefined ? (
          <span>{label}</span>
        ) : (
          <label htmlFor={htmlFor}>{label}</label>
        )}
        {aside === undefined ? null : <span>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** Mutually exclusive choices as a radio group drawn as a segmented row. */
export function Segmented<T extends string | number>({
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}) {
  const name = useId();
  return (
    <div aria-label={label} className="app-segmented" role="radiogroup">
      {options.map((option) => (
        <label key={String(option.value)}>
          <input
            checked={option.value === value}
            disabled={disabled}
            name={name}
            onChange={() => {
              onChange(option.value);
            }}
            type="radio"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
