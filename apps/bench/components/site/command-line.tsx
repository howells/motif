import { Fragment } from "react";

/** A literal command, wrapping only at spaces. A browser would also break at
 * hyphens, which splits `--no-open` into a dangling `--`. The copied text is
 * unchanged, and a click selects the whole command. */
export function CommandLine({
  children,
  quiet = false,
}: {
  readonly children: string;
  readonly quiet?: boolean;
}) {
  return (
    <pre
      className={`m-0 overflow-x-auto font-mono leading-[1.7] whitespace-pre-wrap select-all ${
        quiet
          ? "text-[12.5px] text-(--site-muted)"
          : "text-[13px] text-(--site-ink)"
      }`}
    >
      <code>
        {[...children.matchAll(/\S+/gu)].map((token) => (
          <Fragment key={token.index}>
            {token.index === 0 ? null : " "}
            <span className="whitespace-nowrap">{token[0]}</span>
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
