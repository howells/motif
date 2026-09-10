import { Fragment } from "react";

/** Tokens longer than this, such as piped JSON, may break anywhere, since
 * kept whole they would run out of a narrow column. */
const LONG_TOKEN = 40;

/** A literal command, wrapping only at spaces. A browser would also break at
 * hyphens, which splits `--no-open` into a dangling `--`. Line breaks in the
 * command are kept. The copied text is unchanged, and a click selects the
 * whole command. */
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
        {[...children.matchAll(/[^\n]+/gu)].map((line) => (
          <Fragment key={line.index}>
            {line.index === 0 ? null : "\n"}
            {[...line[0].matchAll(/\S+/gu)].map((token) => (
              <Fragment key={token.index}>
                {token.index === 0 ? null : " "}
                <span
                  className={
                    token[0].length > LONG_TOKEN
                      ? "[overflow-wrap:anywhere]"
                      : "whitespace-nowrap"
                  }
                >
                  {token[0]}
                </span>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}

/** A flag and its value, such as `--look editorial`, set inline in prose. */
export function OptionFlag({
  name,
  value,
}: {
  readonly name: string;
  readonly value: string;
}) {
  return (
    <code className="font-mono text-[13px] whitespace-nowrap text-(--site-muted)">
      --{name} {value}
    </code>
  );
}
