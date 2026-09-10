import { AGENT_SURFACE } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

function CodeBlock({
  children,
  label,
}: {
  readonly children: string;
  readonly label?: string;
}) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      {label === undefined ? null : (
        <figcaption className="text-[14px] text-(--site-muted)">
          {label}
        </figcaption>
      )}
      <pre className="m-0 overflow-x-auto bg-(--site-plate) px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-(--site-ink)">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Subhead({ children }: { readonly children: string }) {
  return (
    <h3
      className={`${styles.display} text-[1.5rem] leading-tight sm:text-[1.625rem]`}
    >
      {children}
    </h3>
  );
}

/** The agent surface as the closing chapter, set in two columns. */
export function Appendix({ number }: { readonly number: string }) {
  return (
    <section
      aria-labelledby="agents-heading"
      className="scroll-mt-8 border-t border-(--site-ink) pt-6 pb-14 sm:pt-8 sm:pb-20 lg:pb-28"
      id="agents"
    >
      <header className="flex items-baseline gap-4 pb-8 sm:pb-12 lg:flex-col lg:items-start lg:gap-3 lg:pb-16">
        <p
          className={`${styles.display} shrink-0 text-[2rem] leading-none text-(--site-accent) sm:text-[2.5rem] lg:text-[3.5rem]`}
        >
          {number}
        </p>
        <h2
          className={`${styles.display} text-[2.5rem] leading-none tracking-[-0.02em] sm:text-[3rem] lg:text-[4.5rem]`}
          id="agents-heading"
        >
          For agents
        </h2>
      </header>

      <div className="grid grid-cols-1 gap-10 sm:gap-14 lg:grid-cols-2 lg:gap-12">
        <div className="flex min-w-0 flex-col gap-4">
          <Subhead>Commands, by task</Subhead>
          <CodeBlock label="From motif --help">{AGENT_SURFACE.help}</CodeBlock>
        </div>

        <div className="flex min-w-0 flex-col gap-10 sm:gap-14">
          <div className="flex flex-col gap-4">
            <Subhead>Mistyped commands</Subhead>
            <CodeBlock>{AGENT_SURFACE.didYouMean.command}</CodeBlock>
            <CodeBlock
              label={`stderr, exit code ${AGENT_SURFACE.didYouMean.exitCode}`}
            >
              {AGENT_SURFACE.didYouMean.output}
            </CodeBlock>
          </div>
          <div className="flex flex-col gap-4">
            <Subhead>When to use each command</Subhead>
            <CodeBlock>{AGENT_SURFACE.describeTasksCommand}</CodeBlock>
            <CodeBlock label="Output, shortened">
              {AGENT_SURFACE.describeTasksExcerpt}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
