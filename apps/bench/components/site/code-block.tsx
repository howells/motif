/** Captured CLI text on a plate. It scrolls sideways rather than wrapping, so
 * JSON and aligned columns keep their shape, unless `wrap` is set for long
 * single lines such as NDJSON. */
export function CodeBlock({
  children,
  label,
  wrap = false,
}: {
  readonly children: string;
  readonly label?: string;
  readonly wrap?: boolean;
}) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      {label === undefined ? null : (
        <figcaption className="text-[14px] text-(--site-muted)">
          {label}
        </figcaption>
      )}
      <pre
        className={`m-0 bg-(--site-plate) px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-(--site-ink) ${
          wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto"
        }`}
      >
        <code>{children}</code>
      </pre>
    </figure>
  );
}
