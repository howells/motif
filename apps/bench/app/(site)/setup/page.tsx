import type { Metadata } from "next";

import { PageHead } from "@/components/app/page-head";
import { Agents } from "@/components/site/agents";
import { Command } from "@/components/site/chapter";
import { Matrix } from "@/components/site/matrix";
import { SITE } from "@/lib/site/content";

export const metadata: Metadata = { title: "Setup" };

const STEPS = [
  { command: SITE.install, label: "Install the CLI" },
  { command: "export FAL_KEY=<your fal key>", label: "Add your fal key" },
  {
    command: 'motif "a celadon jug on a plaster shelf" --dry-run',
    label: "See the Model and price before you spend",
  },
] as const;

/** Getting the CLI running, which provider runs which command, and what a
 * script sees. */
function SetupPage() {
  return (
    <main>
      <PageHead
        standfirst="Install the CLI, add a fal key, and run."
        title="Setup"
      />
      <ol className="flex max-w-[44rem] flex-col gap-6 px-4 py-8 md:px-10">
        {STEPS.map((step, index) => (
          <li className="flex flex-col gap-2" key={step.label}>
            <span className="type-body">
              <span className="text-faint tabular-nums">{index + 1}</span>{" "}
              {step.label}
            </span>
            <Command>{step.command}</Command>
          </li>
        ))}
        <li className="type-small text-muted">
          Get a key at{" "}
          <a
            className="underline underline-offset-3"
            href="https://fal.ai/dashboard/keys"
            rel="noopener noreferrer"
            target="_blank"
          >
            fal.ai
          </a>
          . Motif reads it from your environment and never sends it anywhere but
          fal.
        </li>
      </ol>
      <Matrix />
      <Agents />
      <div className="h-16" />
    </main>
  );
}

export default SetupPage;
