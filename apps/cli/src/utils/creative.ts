import { CREATIVE_FIELDS } from "@howells/motif-sdk";
import type { CreativeDirection, CreativeField } from "@howells/motif-sdk";

/**
 * Creative direction as a caller supplies it. `false` (from `--no-mood`) and
 * `null` (from stdin JSON) drop a field, including one coming from a lower
 * layer such as a Series' pinned mood.
 */
export type CreativeInput = Partial<
  Record<CreativeField, string | false | null>
>;

/**
 * Merge per-field CLI flags over a base creative direction.
 *
 * A flag wins whenever it is set, and a `false` or `null` flag drops the field.
 * Otherwise the base value is used, where `null` also drops it. Empty strings
 * count as unset.
 */
export function resolveCreativeDirection(
  flags: CreativeInput,
  base?: CreativeInput
): CreativeDirection | undefined {
  const creative: CreativeDirection = {};
  for (const field of CREATIVE_FIELDS) {
    const flag = flags[field];
    const value = flag === undefined ? base?.[field] : flag;
    if (typeof value === "string" && value !== "") {
      creative[field] = value;
    }
  }
  return Object.keys(creative).length > 0 ? creative : undefined;
}
