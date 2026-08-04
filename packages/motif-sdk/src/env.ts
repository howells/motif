import { defineEnv } from "@howells/envy";
import { z } from "zod";

export const motifEnvSchema = defineEnv({
  optional: {
    FAL_KEY: z.string().min(1),
  },
});

export type MotifEnv = ReturnType<typeof motifEnvSchema.parse>;

export const parseMotifEnv = (
  input: Record<string, unknown> = process.env
): MotifEnv => motifEnvSchema.parse(input);

export const getFalKeyFromEnv = (
  input: Record<string, unknown> = process.env
): string | undefined => parseMotifEnv(input).FAL_KEY;
