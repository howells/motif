import { ChapterHead, Label } from "@/components/site/chapter";
import { AGENT_EXAMPLES } from "@/lib/site/content";

/** What the CLI looks like from a script: a price before the spend, a refusal
 * that names the right verb, and the whole surface as JSON. Real output,
 * copied from the terminal rather than written for the page. */
export function Agents() {
  return (
    <section className="site-chapter site-gutter">
      <ChapterHead
        body="Every command answers --format json, prices a run with --dry-run and fails with a coded error."
        id="agents"
        title="For agents"
      />

      <div className="grid gap-6 pt-16 md:grid-cols-3">
        {AGENT_EXAMPLES.map((example) => (
          <div className="flex min-w-0 flex-col gap-3" key={example.label}>
            <Label>{example.label}</Label>
            <code
              className="type-small font-mono break-words"
              style={{ color: "var(--ink)" }}
            >
              {example.command}
            </code>
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
