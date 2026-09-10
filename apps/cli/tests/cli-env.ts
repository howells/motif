/**
 * Environment for a spawned CLI run.
 *
 * Tests that parse the CLI's output need a clean stderr, and they ask for that
 * with NO_COLOR. Node prints "The 'NO_COLOR' env is ignored due to the
 * 'FORCE_COLOR' env being set" when both are present, which is enough to break
 * a JSON.parse of stderr. Interactive terminals and CI runners both export
 * FORCE_COLOR, so drop it here rather than let the suite depend on the shell it
 * was started from.
 */
export const spawnEnv = (
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv => ({
  ...process.env,
  FORCE_COLOR: undefined,
  NO_COLOR: "1",
  ...overrides,
});
