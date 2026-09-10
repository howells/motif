import { defineEnv } from "@howells/envy";
import { z } from "zod";

export const motifEnvSchema = defineEnv({
  optional: {
    FAL_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
  },
});

export type MotifEnv = ReturnType<typeof motifEnvSchema.parse>;

export function parseMotifEnv(
  input: Record<string, unknown> = process.env
): MotifEnv {
  return motifEnvSchema.parse(input);
}

export function getFalKeyFromEnv(
  input: Record<string, unknown> = process.env
): string | undefined {
  return parseMotifEnv(input).FAL_KEY;
}

/** The OpenAI key, used by direct OpenAI routes such as gpt2 transparency. */
export function getOpenAiKeyFromEnv(
  input: Record<string, unknown> = process.env
): string | undefined {
  return parseMotifEnv(input).OPENAI_API_KEY;
}
