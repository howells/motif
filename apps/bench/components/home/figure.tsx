import type { Crop } from "@/components/home/plate";
import { Plate } from "@/components/home/plate";
import type { Span } from "@/components/home/span";
import { spanStyle } from "@/components/home/span";
import type { Figure as FigureContent } from "@/lib/site/home/types";

/** Words that differ between the desktop and phone boards: one is shown at a
 * time, and the hidden one is hidden from screen readers too. */
export function Responsive({
  desk,
  phone,
}: {
  readonly desk: string;
  readonly phone: string | undefined;
}) {
  if (phone === undefined) {
    return desk;
  }
  return (
    <>
      <span className="hidden lg:inline">{desk}</span>
      <span className="lg:hidden">{phone}</span>
    </>
  );
}

/** A picture on the grid with its caption hanging below it. Inside a
 * `<Grid row>` the picture sits on the row's image line and the caption on
 * the line beneath, so captions never move where the pictures end. */
export function Figure({
  className,
  crop,
  desk,
  eager,
  figure,
  phone,
  sizes,
}: {
  /** Added to the `<figure>`, for a deliberate stagger or a mat. */
  readonly className?: string;
  readonly crop: Crop;
  readonly desk?: Span;
  readonly eager?: boolean;
  readonly figure: FigureContent;
  readonly phone?: Span;
  readonly sizes: string;
}) {
  return (
    <figure
      className={`home-figure ${className ?? ""}`}
      style={spanStyle(desk, phone)}
    >
      <Plate
        crop={crop}
        eager={eager}
        image={figure.image}
        phone={figure.phone?.image}
        sizes={sizes}
      />
      {figure.caption === undefined ? null : (
        <figcaption className="home-text text-muted">
          <Responsive desk={figure.caption} phone={figure.phone?.caption} />
        </figcaption>
      )}
    </figure>
  );
}
