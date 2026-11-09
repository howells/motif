import { getImageProps } from "next/image";

import { FadeImage } from "@/components/home/fade-image";
import type { CustomProperties } from "@/components/home/span";
import { placeholderOf } from "@/lib/site/home/placeholders";
import type { ImageRef } from "@/lib/site/home/types";

/** The box a picture is cropped into: the design's ratio on desktop and,
 * where the phone board crops it differently, on the phone. Desktop crops
 * are centred; the phone board moves a few off centre. */
export interface Crop {
  /** `object-position` on the phone, e.g. `"62% 50%"`. Centred when
   * omitted. */
  readonly phonePosition?: string;
  /** Width / height on the phone, when it differs. */
  readonly phoneRatio?: string;
  /** Width / height on desktop, e.g. `"1320 / 744"`. */
  readonly ratio: string;
}

/** The crop, and the placeholder the box shows until the picture arrives:
 * the picture itself, blurred, or the phone's own picture on a phone. */
function plateStyle(
  crop: Crop,
  image: ImageRef,
  phone: ImageRef | undefined
): CustomProperties {
  const style: Record<`--${string}`, string> = { "--ratio": crop.ratio };
  if (crop.phoneRatio !== undefined) {
    style["--ratio-phone"] = crop.phoneRatio;
  }
  if (crop.phonePosition !== undefined) {
    style["--position-phone"] = crop.phonePosition;
  }
  const placeholder = placeholderOf(image.src);
  if (placeholder !== undefined) {
    style["--placeholder"] = placeholder;
  }
  const phonePlaceholder =
    phone === undefined ? undefined : placeholderOf(phone.src);
  if (phonePlaceholder !== undefined) {
    style["--placeholder-phone"] = phonePlaceholder;
  }
  return style;
}

/** A picture in a box of a fixed ratio, served through Next's image
 * pipeline. The box shows the picture blurred until it loads, then the
 * picture fades in over the blur and settles. Lazy unless `eager`, which is
 * for the first screen only and never waits to fade. With a `phone` image
 * the phone gets that file instead (art direction): the browser fetches one
 * of the two, never both. */
export function Plate({
  crop,
  eager,
  image,
  phone,
  sizes,
}: {
  readonly crop: Crop;
  readonly eager?: boolean;
  readonly image: ImageRef;
  readonly phone?: ImageRef;
  /** The `sizes` attribute for both files; build it with `imageSizes`. */
  readonly sizes: string;
}) {
  const { props } = getImageProps({
    ...(phone ?? image),
    fetchPriority: eager === true ? "high" : undefined,
    loading: eager === true ? "eager" : "lazy",
    sizes,
  });
  const img =
    eager === true ? (
      // oxlint-disable-next-line next/no-img-element, react-doctor/nextjs-no-img-element -- the props come from getImageProps, so the file is optimised; a <picture> needs a bare <img>
      <img {...props} alt={props.alt} />
    ) : (
      <FadeImage {...props} alt={props.alt} />
    );
  return (
    <div className="home-plate" style={plateStyle(crop, image, phone)}>
      <div aria-hidden="true" className="home-placeholder" />
      {phone === undefined ? (
        img
      ) : (
        <picture>
          <source
            media="(width >= 64rem)"
            sizes={sizes}
            srcSet={getImageProps({ ...image, sizes }).props.srcSet}
          />
          {img}
        </picture>
      )}
    </div>
  );
}
