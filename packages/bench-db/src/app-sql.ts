import { createResilientSql } from "@howells/neon/http";

/** One result row, untyped: each caller reads the columns it selected through
 * checked accessors rather than asserting a shape. */
export type AppRow = Readonly<Record<string, unknown>>;

/**
 * A parameterised SQL call: one statement, its text and its values.
 *
 * The App issues every state change as a single statement, so atomicity comes
 * from Postgres itself: a statement with data-modifying CTEs either applies
 * all of its writes or none. Neon's HTTP driver has no interactive
 * transactions; nothing in the App needs one.
 */
export type AppSql = (
  text: string,
  values: readonly unknown[]
) => Promise<readonly AppRow[]>;

const isRow = (value: unknown): value is AppRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The Neon HTTP client for the App's database, given its URL. The caller
 * reads the URL from `@motif/bench-env/runtime`, so importing this module
 * parses no environment. */
export const createAppSql = (databaseUrl: string): AppSql => {
  const sql = createResilientSql(databaseUrl);
  return async (text, values) => {
    const rows: unknown = await sql.query(text, [...values]);
    if (!Array.isArray(rows)) {
      throw new TypeError("The database returned no row list.");
    }
    return rows.filter((row) => isRow(row));
  };
};
