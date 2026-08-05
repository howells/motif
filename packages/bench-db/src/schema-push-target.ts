const DEVELOPMENT_TARGET = "motif-bench-dev";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const TARGET_OVERRIDE_QUERY_KEYS = new Set([
  "database",
  "dbname",
  "host",
  "hostaddr",
  "password",
  "port",
  "service",
  "servicefile",
  "user",
]);

export interface SchemaPushTarget {
  acknowledgedTarget?: string;
  ci?: boolean;
  databaseUrl: string;
  directDatabaseUrl: string;
  nodeEnv?: string;
  vercel?: string;
  vercelEnv?: string;
}

const rejectTarget = (reason: string): never => {
  throw new Error(`Refusing schema push: ${reason}.`);
};

const parsePostgresqlUrl = (value: string): URL => {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return rejectTarget("the target is not PostgreSQL");
    }
    return url;
  } catch {
    return rejectTarget("the target URL is invalid");
  }
};

const isLoopback = (url: URL): boolean => LOOPBACK_HOSTS.has(url.hostname);

const hasTargetOverride = (url: URL): boolean =>
  [...url.searchParams.keys()].some((key) =>
    TARGET_OVERRIDE_QUERY_KEYS.has(key.toLowerCase())
  );

const canonicalNeonHost = (hostname: string): string =>
  hostname.replace(/-pooler(?=\.)/u, "");

const isNeonPoolerHost = (hostname: string): boolean =>
  hostname.endsWith(".neon.tech") &&
  (hostname.split(".")[0]?.endsWith("-pooler") ?? false);

const isMatchingNeonPair = (pooled: URL, direct: URL): boolean => {
  if (!direct.hostname.endsWith(".neon.tech")) {
    return false;
  }
  if (!isNeonPoolerHost(pooled.hostname)) {
    return false;
  }
  if (isNeonPoolerHost(direct.hostname)) {
    return false;
  }
  if (canonicalNeonHost(pooled.hostname) !== direct.hostname) {
    return false;
  }
  if (pooled.protocol !== direct.protocol) {
    return false;
  }
  if (pooled.username !== direct.username) {
    return false;
  }
  if (pooled.password !== direct.password) {
    return false;
  }
  if (pooled.port !== direct.port) {
    return false;
  }
  if (pooled.pathname !== direct.pathname) {
    return false;
  }
  return pooled.search === direct.search;
};

export const assertSchemaPushTarget = (target: SchemaPushTarget): void => {
  const pooled = parsePostgresqlUrl(target.databaseUrl);
  const direct = parsePostgresqlUrl(target.directDatabaseUrl);
  const isVercel =
    target.vercel !== undefined || target.vercelEnv !== undefined;

  if (hasTargetOverride(pooled) || hasTargetOverride(direct)) {
    rejectTarget("connection target overrides are forbidden");
  }

  if (target.nodeEnv === "production" || isVercel) {
    rejectTarget("production and Vercel targets are forbidden");
  }

  if (isLoopback(pooled) && isLoopback(direct)) {
    return;
  }

  if (target.ci === true) {
    rejectTarget("remote targets are forbidden in CI");
  }

  if (target.acknowledgedTarget !== DEVELOPMENT_TARGET) {
    rejectTarget("remote targets require the development acknowledgement");
  }

  if (!isMatchingNeonPair(pooled, direct)) {
    rejectTarget("the pooled and direct development endpoints do not match");
  }
};
