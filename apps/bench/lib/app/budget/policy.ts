/**
 * Spending behaviour the App ships with. Source, not environment: these are
 * product decisions, and the environment carries only credentials.
 */

/** The shared monthly cap across every member: US$50, decided by Daniel on
 * 31 October 2026 (MOT-74, Q2b). The owner can change it in Settings; that
 * value lives in `app_settings`, and this is the figure until they do. */
export const MONTHLY_CAP_MICROS = 50_000_000;

/** Most images one generate or vary run may ask for. */
export const MAX_IMAGES_PER_RUN = 4;

/** Most Models one Comparison may run at once. */
export const MAX_COMPARISON_MODELS = 6;

/** Most References one run may send. */
export const MAX_REFERENCES = 4;
