/**
 * Spending behaviour the App ships with. Source, not environment: these are
 * product decisions, and the environment carries only credentials.
 */

/** One monthly cap across every member: US$50, decided by Daniel on
 * 31 October 2026 (MOT-74, Q2b). One pot, shown privately: each person sees
 * their own spend and what is left; only the owner sees the pot's total.
 * The owner can change it in Settings; that value lives in `app_settings`,
 * and this is the figure until they do. */
export const MONTHLY_CAP_MICROS = 50_000_000;

/** The hold for each image from a Model fal bills by usage (tokens, or a
 * rate with no published maximum): US$0.50, decided by Daniel on 1 November
 * 2026 (MOT-74). Such Models run; the run settles at the cost the SDK
 * reports, or at this hold marked as an estimate when none is reported. */
export const USAGE_HOLD_MICROS_PER_IMAGE = 500_000;

/** Most images one generate or vary run may ask for. */
export const MAX_IMAGES_PER_RUN = 4;

/** Most Models one Comparison may run at once. */
export const MAX_COMPARISON_MODELS = 6;

/** Most References one run may send. */
export const MAX_REFERENCES = 4;
