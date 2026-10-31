"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/app/controls";
import { MediaImage } from "@/components/app/media-image";
import { SourcePicker } from "@/components/app/task/source-picker";
import type { PickedImage } from "@/lib/app/client/task-draft";

/** The image a Task works on: chosen, shown small, and changeable. */
export function SourceField({
  label,
  onPick,
  source,
}: {
  readonly label: string;
  readonly onPick: (image: PickedImage) => void;
  readonly source: PickedImage | null;
}) {
  const [open, setOpen] = useState(false);
  const choose = () => {
    setOpen(true);
  };
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        {source === null ? (
          <button className="app-button flex-1" onClick={choose} type="button">
            <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
            Choose an image
          </button>
        ) : (
          <>
            <span className="relative size-14 shrink-0 overflow-hidden">
              <MediaImage alt="" sizes="56px" src={source.url} />
            </span>
            <span className="app-value text-muted flex-1">
              {source.width} × {source.height}
            </span>
            <button className="app-button" onClick={choose} type="button">
              Change
            </button>
          </>
        )}
      </div>
      <SourcePicker
        label={`Choose the ${label.toLowerCase()}`}
        onPick={onPick}
        open={open}
        setOpen={setOpen}
      />
    </Field>
  );
}

/** Up to `max` References from the Library or the device. */
export function ReferencesField({
  max,
  onChange,
  references,
}: {
  readonly max: number;
  readonly onChange: (references: readonly PickedImage[]) => void;
  readonly references: readonly PickedImage[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field aside={`Optional, up to ${max}`} label="References">
      <ul className="flex flex-wrap gap-2">
        {references.map((reference) => (
          <li className="relative" key={reference.assetId}>
            <span className="relative block size-14 overflow-hidden">
              <MediaImage alt="" sizes="56px" src={reference.url} />
            </span>
            <button
              aria-label="Remove this Reference"
              className="bg-background absolute -top-3 -right-3 flex size-11 items-center justify-center rounded-full"
              onClick={() => {
                onChange(
                  references.filter(
                    (item) => item.assetId !== reference.assetId
                  )
                );
              }}
              type="button"
            >
              <X aria-hidden="true" size={14} strokeWidth={1.5} />
            </button>
          </li>
        ))}
        {references.length < max ? (
          <li>
            <button
              aria-label="Add a Reference"
              className="app-button size-14 px-0"
              onClick={() => {
                setOpen(true);
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          </li>
        ) : null}
      </ul>
      <SourcePicker
        label="Add a Reference"
        onPick={(image) => {
          if (!references.some((item) => item.assetId === image.assetId)) {
            onChange([...references, image]);
          }
        }}
        open={open}
        setOpen={setOpen}
      />
    </Field>
  );
}
