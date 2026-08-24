import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Nearly every test here spawns the real CLI as a subprocess, so the work
    // is process startup rather than computation and the cost tracks how busy
    // the machine is. Vitest's 5s default is a developer-laptop budget: it held
    // locally and expired on a CI runner, failing a correct test. A generous
    // ceiling still catches a genuine hang, which is all a timeout is for.
    testTimeout: 30_000,
  },
});
