"use client";

import Image from "next/image";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useId, useState } from "react";

import type { Plate } from "@/lib/site/catalogue";

/** One frame, source and result either side of a divider.
 *
 * Starts a little left of centre so both states are visible before anyone
 * touches it. Pointer and keyboard both move the split. `cap` holds the frame
 * near an asset's native size where blowing it up would only blur it. */
export function HeldCompare({
  cap,
  result,
  source,
}: {
  readonly cap?: number;
  readonly result: Plate;
  readonly source: Plate;
}) {
  const labelId = useId();
  const [split, setSplit] = useState(43);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setSplit(Number(event.target.value));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      setSplit(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setSplit(100);
    }
  }

  return (
    <div className="site-held">
      <div
        className="site-held-frame"
        style={{
          aspectRatio: `${String(source.width)} / ${String(source.height)}`,
          maxWidth: cap === undefined ? undefined : `${String(cap)}px`,
        }}
      >
        <div
          className="site-held-layer"
          style={{ clipPath: `inset(0 ${String(100 - split)}% 0 0)` }}
        >
          <Image
            alt={source.alt}
            fill
            sizes="(max-width: 61.999rem) 92vw, 1048px"
            src={source.src}
          />
        </div>
        <div
          className="site-held-layer"
          style={{ clipPath: `inset(0 0 0 ${String(split)}%)` }}
        >
          <Image
            alt={result.alt}
            fill
            sizes="(max-width: 61.999rem) 92vw, 1048px"
            src={result.src}
          />
        </div>
        <div className="site-held-rule" style={{ left: `${String(split)}%` }}>
          <span className="site-held-knob" />
        </div>
        <input
          aria-labelledby={labelId}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={split}
          className="site-held-input"
          max={100}
          min={0}
          onChange={onChange}
          onKeyDown={onKeyDown}
          type="range"
          value={split}
        />
      </div>
      <div className="site-held-captions" id={labelId}>
        <p
          className="type-small"
          style={{ color: "var(--faint)", width: `${String(split)}%` }}
        >
          {source.caption ?? "the source"}
        </p>
        <p className="type-small" style={{ color: "var(--ink)" }}>
          {result.caption ?? "the result"}
        </p>
      </div>
    </div>
  );
}
