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
import { envSchema, parseServerEnv } from "./schema";

const environmentSource = (input?: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  if (input !== undefined) {
    return input;
  }
  loadWorkspaceDotenv();
  // oxlint-disable-next-line no-restricted-properties -- raw source stays inside this env boundary; exported accessors validate the fields they consume
  return process.env;
};

/** Platform metadata is independent of whether live credentials are present. */
export const isVercelRuntime = (input?: NodeJS.ProcessEnv): boolean =>
  envSchema.definition.system.VERCEL.parse(environmentSource(input).VERCEL) ===
  "1";

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
  const source = environmentSource(input);
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
  const source = environmentSource(input);
  try {
    const env = parseServerEnv(source);
    return { databaseUrl: env.DATABASE_URL, falKey: env.FAL_KEY };
  } catch {
    return null;
  }
};

/** One credential field, validated alone, so a missing database URL cannot
 * hide a present fal key or the other way round. */
const field = (
  key: keyof typeof envSchema.definition.server,
  source: NodeJS.ProcessEnv
): string | null => {
  const parsed = envSchema.definition.server[key].safeParse(source[key]);
  return parsed.success && typeof parsed.data === "string" ? parsed.data : null;
};

/** The WorkOS AuthKit credentials, or `null` unless all three are present. */
export interface WorkosCredentials {
  readonly apiKey: string;
  readonly clientId: string;
  readonly cookiePassword: string;
}

/**
 * What the signed-in App can do on this server, credential by credential.
 *
 * Each field is `null` when its credential is absent or invalid. The App reads
 * this to show an explicit "not set up" state for the part that is missing
 * rather than falling back to a mock, a local disk or a fake session. Values
 * never leave the server; callers that render state use only presence.
 */
export interface AppCredentials {
  readonly blobToken: string | null;
  readonly databaseUrl: string | null;
  readonly falKey: string | null;
  readonly workos: WorkosCredentials | null;
}

export const getAppCredentials = (
  input?: NodeJS.ProcessEnv
): AppCredentials => {
  const source = environmentSource(input);
  const apiKey = field("WORKOS_API_KEY", source);
  const clientId = field("WORKOS_CLIENT_ID", source);
  const cookiePassword = field("WORKOS_COOKIE_PASSWORD", source);
  return {
    blobToken: field("BLOB_READ_WRITE_TOKEN", source),
    databaseUrl: field("DATABASE_URL", source),
    falKey: field("FAL_KEY", source),
    workos:
      apiKey !== null && clientId !== null && cookiePassword !== null
        ? { apiKey, clientId, cookiePassword }
        : null,
  };
};
