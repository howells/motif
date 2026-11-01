"use client";

import { createContext, use } from "react";

/** Where a popover, sheet or tooltip is drawn. The paper palette is scoped to
 * the shell (`.app`), and a Radix portal defaults to `document.body`, outside
 * it, where the tokens fall back to the dark theme. The Bench shell hands its
 * own element down so every overlay is drawn inside the palette it belongs to.
 * `null` before the element mounts, which Radix reads as the body. */
export const PortalContext = createContext<HTMLElement | null>(null);

export const usePortalContainer = (): HTMLElement | null => use(PortalContext);
