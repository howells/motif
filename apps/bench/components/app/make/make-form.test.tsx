import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MakeForm } from "./make-form";

/** The words the form offers, as the App passes them in. */
const OPTIONS = {
  aspects: ["1:1", "4:5", "3:2", "9:16"],
  looks: [
    { acceptsMood: true, aspect: "4:5", id: "editorial", label: "Editorial" },
    { acceptsMood: false, aspect: "1:1", id: "object", label: "Object" },
  ],
  maxImages: 4,
  maxReferences: 4,
  moods: [{ id: "calm", label: "Calm" }],
};

/** A server render has no navigation to do; the form only needs a router
 * to exist. */
const STILL: AppRouterInstance = {
  back: vi.fn<() => void>(),
  bfcacheId: "test",
  forward: vi.fn<() => void>(),
  prefetch: vi.fn<() => void>(),
  push: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<() => void>(),
};

const render = (prompt: string): string =>
  renderToStaticMarkup(
    <AppRouterContext value={STILL}>
      <QueryClientProvider client={new QueryClient()}>
        <MakeForm
          initial={{ aspect: "4:5", look: "", mood: "", prompt }}
          memberName="Daniel"
          options={OPTIONS}
        />
      </QueryClientProvider>
    </AppRouterContext>
  );

describe(MakeForm, () => {
  it("offers the Looks it is given and the phone's four ratios", () => {
    const html = render("");
    expect(html).toContain(">Editorial<");
    expect(html).toContain(">Object<");
    for (const ratio of ["1:1", "4:5", "3:2", "9:16"]) {
      expect(html).toContain(`>${ratio}<`);
    }
  });

  it("asks for a prompt before it prices, and can't Make yet", () => {
    const html = render("");

    expect(html).toContain("Write a prompt to see the price.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/u);
  });

  it("starts from the last Make when making again", () => {
    const html = render("Amber bottles on a stone shelf");

    expect(html).toContain("Amber bottles on a stone shelf");
    expect(html).toContain('aria-pressed="true"');
  });
});
