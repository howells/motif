/** Opaque, unguessable record ids: a short prefix naming the kind, then 128
 * random bits. Ids are never sequential, so one can't be guessed from another;
 * access is still checked on every read. */
export const newId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

const ID_PATTERN = /^[a-z]{2,4}_[0-9a-f]{32}$/u;

/** Whether a client-supplied value has the shape of an id this App issues. */
export const isAppId = (value: unknown, prefix?: string): value is string =>
  typeof value === "string" &&
  ID_PATTERN.test(value) &&
  (prefix === undefined || value.startsWith(`${prefix}_`));
