/**
 * Per-call environment accessors — the "importing parses nothing" shape
 * (materialdesk `packages/env/src/runtime.ts`). Each function parses at call
 * time and never at module evaluation, so this entrypoint is safe to import
 * from anywhere, including modules reachable from a zero-env `next build`.
 *
 * The environment carries ONLY credentials (user decision, 2026-08-05).
 * There is no mode flag: mock vs live is *derived* from which credentials
 * are present. No keys → mock (free, offline, what tests and a fresh clone
 * get). All keys → live. That keeps `.env` down to secrets and makes the
 * mode impossible to misconfigure independently of the credentials it needs.
 */
import { loadWorkspaceDotenv } from "./dotenv";
import { parseServerEnv } from "./schema";

export interface LiveCredentials {
  readonly databaseUrl: string;
  readonly falKey: string;
}

/**
 * The Vercel Blob read-write token, or `null` when there isn't one.
 *
 * Separate from `getLiveCredentials` on purpose: that function is
 * all-or-nothing because a missing `DATABASE_URL` or `FAL_KEY` means "run
 * mock", a different product. A missing Blob token means something much
 * smaller — images stay on local disk — so folding it into the same gate
 * would silently turn a live run into a mock one over a storage credential.
 */
export const getBlobToken = (input?: NodeJS.ProcessEnv): string | null => {
  let source = input;
  if (source === undefined) {
    loadWorkspaceDotenv();
    // oxlint-disable-next-line no-restricted-properties -- this module IS an env-boundary entrypoint of the env package itself (same standing as ./server.ts); everything it returns has passed the schema
    source = process.env;
  }
  try {
    return parseServerEnv(source).BLOB_READ_WRITE_TOKEN ?? null;
  } catch {
    return null;
  }
};

/**
 * The live credentials, or `null` when any are missing — never throws.
 * `null` means "run mock": the caller (the app's composition root) treats
 * absence of credentials as absence of live capability, not as an error.
 */
export const getLiveCredentials = (
  input?: NodeJS.ProcessEnv
): LiveCredentials | null => {
  // An explicit input is taken verbatim (tests hand in a constructed env);
  // only the real-process path loads the workspace .env first.
  let source = input;
  if (source === undefined) {
    loadWorkspaceDotenv();
    // oxlint-disable-next-line no-restricted-properties -- this module IS an env-boundary entrypoint of the env package itself (same standing as ./server.ts); everything it returns has passed the schema
    source = process.env;
  }
  try {
    const env = parseServerEnv(source);
    return { databaseUrl: env.DATABASE_URL, falKey: env.FAL_KEY };
  } catch {
    return null;
  }
};
