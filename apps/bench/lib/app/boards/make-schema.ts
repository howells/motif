import { z } from "zod";

import { BOARD_ASPECTS } from "./model";

/** What the phone's Make sends: a prompt, optional Look, Mood and photo,
 * and a ratio. */
export const MakeSchema = z.strictObject({
  aspect: z.enum(BOARD_ASPECTS).optional(),
  look: z.string().max(64).optional(),
  mood: z.string().max(64).optional(),
  prompt: z.string().trim().min(1, "Write a prompt.").max(4000),
  references: z
    .array(z.string().regex(/^ast_[0-9a-f]{32}$/u))
    .max(4)
    .default([]),
});

/** The ratios a phone offers, in the order the board draws them. */
export const MAKE_ASPECTS = ["1:1", "4:5", "3:2", "9:16"] as const;

export type MakeAspect = (typeof MAKE_ASPECTS)[number];

/** What a "Make again" link carries in its query. */
export const MakeQuerySchema = z.object({
  aspect: z.enum(MAKE_ASPECTS).optional(),
  look: z.string().max(64).optional(),
  mood: z.string().max(64).optional(),
  prompt: z.string().optional(),
});

/** Where the Make form starts: empty, or the last Make when making again. */
export interface MakeStart {
  readonly aspect: MakeAspect | null;
  readonly look: string;
  readonly mood: string;
  readonly prompt: string;
}
