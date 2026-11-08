import type { Entry, Figure } from "@/lib/site/home/types";

/** How a chapter's layout reaches its content: an entry by its id, a figure
 * by its place. Both throw when the content has no such thing, so a renamed
 * id or a dropped picture breaks the page loudly instead of rendering the
 * wrong one. */

/** The entry a lookup returns: the one with that id from a chapter written
 * `as const`, extra fields included, or any `Entry` from a chapter typed
 * `Chapter`, whose ids are plain strings. */
type EntryWithId<E extends Entry, Id extends string> = string extends E["id"]
  ? E
  : Extract<E, { readonly id: Id }>;

/** The chapter's entry with this id. In a chapter written `as const` a
 * mistyped id fails to compile. */
export function entryWithId<E extends Entry, Id extends E["id"]>(
  chapter: { readonly entries: readonly E[]; readonly id: string },
  id: Id
): EntryWithId<E, Id> {
  const found = chapter.entries.find(
    (item): item is EntryWithId<E, Id> => item.id === id
  );
  if (found === undefined) {
    throw new Error(`The ${chapter.id} chapter has no entry "${id}"`);
  }
  return found;
}

/** The entry's figure at `index`, counting from 0. */
export function figureAt<F extends Figure>(
  item: { readonly figures: readonly F[]; readonly id: string },
  index: number
): F {
  const found = item.figures[index];
  if (found === undefined) {
    throw new Error(`Entry "${item.id}" has no figure ${String(index)}`);
  }
  return found;
}
