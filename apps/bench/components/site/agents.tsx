import { ChapterHead, Label } from "@/components/site/chapter";
import { AGENT_EXAMPLES } from "@/lib/site/content";

/** What the CLI looks like from a script: a price before the spend, a refusal
 * that names the right verb, and the whole surface as JSON. Real output,
 * copied from the terminal rather than written for the page. */
export function Agents() {
  return (
    <section>
      <ChapterHead
        body="Every command answers --format json, prices a run with --dry-run and fails with a coded error."
        id="agents"
        title="For agents"
      />

      <div className="site-gutter grid gap-10 pt-16 md:grid-cols-3 md:gap-6">
        {AGENT_EXAMPLES.map((example) => (
          <div className="flex min-w-0 flex-col gap-4" key={example.label}>
            <Label>{example.label}</Label>
            <div className="flex min-h-0 items-baseline gap-2 md:min-h-12">
              <span
                aria-hidden="true"
                className="type-small font-mono select-none"
                style={{ color: "var(--faint)" }}
              >
                ›
              </span>
              <code
                className="type-small font-mono break-words"
                style={{ color: "var(--ink)" }}
              >
                {example.command}
              </code>
            </div>
            <pre
              className="type-small m-0 p-4 font-mono break-words whitespace-pre-wrap"
              style={{ background: "var(--surface)", color: "var(--muted)" }}
            >
              {example.output}
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}
