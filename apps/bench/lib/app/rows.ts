import type { AppRow } from "@motif/bench-db/app-sql";

/** Checked column readers for untyped driver rows. A column that isn't the
 * expected type is a schema mismatch, so it throws rather than guessing. */

const fail = (column: string, expected: string): never => {
  throw new TypeError(`Column ${column} is not ${expected}.`);
};

export const text = (row: AppRow, column: string): string => {
  const value = row[column];
  return typeof value === "string" ? value : fail(column, "text");
};

export const textOrNull = (row: AppRow, column: string): string | null => {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : fail(column, "text or null");
};

/** Integer columns, including bigint micros, which the driver returns as
 * strings. Anything beyond 2^53 is refused rather than rounded. */
export const integer = (row: AppRow, column: string): number => {
  const value = row[column];
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed)
    ? parsed
    : fail(column, "a safe integer");
};

export const integerOrNull = (row: AppRow, column: string): number | null => {
  const value = row[column];
  return value === null || value === undefined ? null : integer(row, column);
};

export const date = (row: AppRow, column: string): Date => {
  const value = row[column];
  if (value instanceof Date) {
    return value;
  }
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed !== null && !Number.isNaN(parsed.getTime())
    ? parsed
    : fail(column, "a timestamp");
};

export const dateOrNull = (row: AppRow, column: string): Date | null => {
  const value = row[column];
  return value === null || value === undefined ? null : date(row, column);
};

export const stringArray = (row: AppRow, column: string): string[] => {
  const value = row[column];
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fail(column, "a list of text");
};

export const record = (
  row: AppRow,
  column: string
): Record<string, unknown> => {
  const value = row[column];
  if (value === null || value === undefined) {
    return {};
  }
  return typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : fail(column, "an object");
};
