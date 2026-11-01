"use client";

import { useEffect, useState } from "react";

import { SITE } from "@/lib/site/content";

/** The install command in a block, with Copy at its right. The label says
 * "Copied" for two seconds and then goes back, so the button can be pressed
 * again without leaving the page. */
export function InstallBlock() {
  const [state, setState] = useState<"copied" | "failed" | "idle">("idle");

  useEffect(() => {
    if (state === "idle") {
      return () => {
        /* Nothing was scheduled, so there is nothing to clear. */
      };
    }
    const timer = setTimeout(() => {
      setState("idle");
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SITE.install);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="bg-surface rounded-control min-h-control flex items-center justify-between gap-4 pl-4">
      <code className="type-small text-ink min-w-0 font-mono">
        {SITE.install}
      </code>
      <button
        className="type-body text-ink min-h-control cursor-pointer px-4 font-medium"
        onClick={() => {
          void copy();
        }}
        type="button"
      >
        <span aria-live="polite">
          {state === "copied"
            ? "Copied"
            : state === "failed"
              ? "Copy failed"
              : "Copy"}
        </span>
      </button>
    </div>
  );
}
