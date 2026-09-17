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
  fadeKey,
  priority,
  ratio,
  sizes,
  source,
}: {
  readonly className?: string;
  /** Changing this re-runs the cross-fade, for plates that swap in place. */
  readonly fadeKey?: string;
  readonly priority?: boolean;
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
        height={source.height}
        key={fadeKey}
        priority={priority}
        sizes={sizes}
        src={source.src}
        width={source.width}
      />
    </div>
  );
}
