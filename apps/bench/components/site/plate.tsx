import Image from "next/image";

interface PlateSource {
  readonly alt: string;
  readonly height: number;
  readonly src: string;
  readonly width: number;
}

/** An image in a box of a fixed ratio.
 *
 * Every picture on the page goes through here so that the ratio is reserved
 * before the bytes arrive and nothing below the image moves as it loads. The
 * ratio is the box's, not the file's: the design crops a 1:1 vase into a 3:2
 * row, and `object-fit: cover` does that in one place rather than in each
 * caller. */
export function Plate({
  className,
  eager,
  fadeKey,
  ratio,
  sizes,
  source,
}: {
  readonly className?: string;
  /** Changing this re-runs the cross-fade, for plates that swap in place. */
  readonly fadeKey?: string;
  /** For the hero's first plate: fetched straight away and ahead of the rest.
   * `priority` is deprecated in Next.js 16, and its docs prefer these two
   * attributes to `preload`. */
  readonly eager?: boolean;
  readonly ratio: string;
  readonly sizes: string;
  readonly source: PlateSource;
}) {
  return (
    <div
      className={`site-plate ${className ?? ""}`}
      style={{ aspectRatio: ratio }}
    >
      <Image
        alt={source.alt}
        className={fadeKey === undefined ? undefined : "site-fade"}
        fetchPriority={eager === true ? "high" : undefined}
        height={source.height}
        key={fadeKey}
        loading={eager === true ? "eager" : undefined}
        sizes={sizes}
        src={source.src}
        width={source.width}
      />
    </div>
  );
}
