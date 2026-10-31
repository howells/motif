/**
 * The old Bench API's boundary. Its spending endpoints are closed, so the
 * App's shared monthly cap has no way round it; what remains (reading past
 * runs, rating samples, previewing a sweep for free) is the owner's alone.
 */
import { appError, authorise } from "./guard";

export const benchRetired = (): Response =>
  appError(
    410,
    "BENCH_RETIRED",
    "Bench runs have moved to Compare in the App, where every run is held against the shared monthly cap."
  );

/** `null` when the owner is asking; otherwise the refusal to return. */
export const ownerOnly = async (
  request: Request,
  options: { readonly write?: boolean } = {}
): Promise<Response | null> => {
  const access = await authorise(request, {
    owner: true,
    write: options.write === true,
  });
  return access.ok ? null : access.response;
};
