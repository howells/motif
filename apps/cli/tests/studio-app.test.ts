import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { render } from "ink";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the real Studio App through ink with fake terminal streams, against a
 * temp HOME. ink-testing-library is not a dependency, so this is the same
 * harness in a few lines: a TTY-looking stdin the test types into and a stdout
 * that records every frame (ink's `debug` mode writes each one whole).
 */

const DOWN = "\u001B[B";
const ENTER = "\r";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;
let motifDir: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-studio-"));
  motifDir = join(home, ".motif");
  mkdirSync(motifDir, { recursive: true });
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

class FakeStdin extends PassThrough {
  isTTY = true;
  setRawMode(): this {
    return this;
  }
  ref(): this {
    return this;
  }
  unref(): this {
    return this;
  }
}

class FakeStdout extends PassThrough {
  columns = 100;
  frames: string[] = [];
  isTTY = true;
  rows = 40;
  constructor() {
    super();
    this.on("data", (chunk: Buffer) => {
      this.frames.push(chunk.toString());
    });
  }
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 80);
  });
};

async function startStudio(configOverride: Record<string, unknown> = {}) {
  const { loadConfig, loadHistory } = await import("../src/utils/config");
  const { App } = await import("../src/studio/app");
  const config = { ...(await loadConfig()), ...configOverride };
  const history = await loadHistory();

  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const instance = render(createElement(App, { config, history }), {
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double standing in for the terminal's stdin
    stdin: stdin as unknown as NodeJS.ReadStream,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double standing in for the terminal's stdout
    stdout: stdout as unknown as NodeJS.WriteStream,
  });
  await settle();

  return {
    frame: () => stdout.frames.at(-1) ?? "",
    async press(...keys: string[]) {
      for (const key of keys) {
        stdin.write(key);
        await settle();
      }
    },
    stop: () => {
      instance.unmount();
    },
  };
}

/** Home to Settings, then down to the "Open After Generate" toggle. */
const OPEN_SETTINGS_TOGGLE = [DOWN, DOWN, DOWN, ENTER, DOWN, DOWN];

describe("Studio settings", () => {
  it("saves only the edited key, not the project-local values merged into the config", async () => {
    const path = join(motifDir, "config.json");
    writeFileSync(path, '{"apiKey":"global-key-12345678"}');
    const studio = await startStudio({ apiKey: "project-local-key-9999" });

    await studio.press(...OPEN_SETTINGS_TOGGLE, ENTER, "s");
    studio.stop();

    expect(JSON.parse(readFileSync(path, "utf-8"))).toStrictEqual({
      apiKey: "global-key-12345678",
      openAfterGenerate: false,
    });
  });

  it("gives the screens the saved config without a restart", async () => {
    const studio = await startStudio();

    await studio.press(...OPEN_SETTINGS_TOGGLE, ENTER, "s");
    expect(studio.frame()).toContain("Generate");
    await studio.press(DOWN, DOWN, DOWN, ENTER);
    expect(studio.frame()).toMatch(/Open After Generate\s+No/);
    studio.stop();
  });

  it("shows a failed save in the error banner and leaves the file", async () => {
    const path = join(motifDir, "config.json");
    const studio = await startStudio();
    writeFileSync(path, "{broken");

    await studio.press(...OPEN_SETTINGS_TOGGLE, ENTER, "s");
    expect(studio.frame()).toContain("✗");
    expect(studio.frame()).toContain("not valid JSON");
    expect(studio.frame()).toContain("Settings");
    studio.stop();

    expect(readFileSync(path, "utf-8")).toBe("{broken");
  });

  it("starts without an API key", async () => {
    const studio = await startStudio();
    expect(studio.frame()).toContain("Generate");
    studio.stop();
  });
});
