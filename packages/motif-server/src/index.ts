/**
 * @deprecated Use `@howells/motif-sdk` instead.
 */

/* oxlint-disable oxc/no-barrel-file, sonarjs/no-wildcard-import --
 * This package's entire purpose is a wildcard re-export: it is a deprecated
 * compatibility shim that forwards the whole `@howells/motif-sdk` surface
 * unchanged. Enumerating each export defeats the shim (it would need to stay
 * hand-synced with every future SDK export) and the package is superseded
 * (see the file-level `@deprecated` tag) rather than actively grown.
 */
export type * from "@howells/motif-sdk";
export * from "@howells/motif-sdk";
