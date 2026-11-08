import Image, { getImageProps } from "next/image";

import type { CustomProperties } from "@/components/home/span";
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

function cropStyle(crop: Crop): CustomProperties {
  return {
    "--ratio": crop.ratio,
    ...(crop.phoneRatio === undefined
      ? {}
      : { "--ratio-phone": crop.phoneRatio }),
    ...(crop.phonePosition === undefined
      ? {}
      : { "--position-phone": crop.phonePosition }),
  };
}

/** A picture in a box of a fixed ratio, served through Next's image
 * pipeline. Lazy unless `eager`, which is for the first screen only. With a
 * `phone` image the phone gets that file instead (art direction): the
 * browser fetches one of the two, never both. */
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
  const loading = eager === true ? "eager" : "lazy";
  const fetchPriority = eager === true ? "high" : undefined;
  if (phone === undefined) {
    return (
      <div className="home-plate" style={cropStyle(crop)}>
        <Image
          alt={image.alt}
          fetchPriority={fetchPriority}
          height={image.height}
          loading={loading}
          sizes={sizes}
          src={image.src}
          width={image.width}
        />
      </div>
    );
  }
  const {
    props: { srcSet: desk },
  } = getImageProps({ ...image, sizes });
  const { props } = getImageProps({
    ...phone,
    fetchPriority,
    loading,
    sizes,
  });
  return (
    <div className="home-plate" style={cropStyle(crop)}>
      <picture>
        <source media="(width >= 64rem)" sizes={sizes} srcSet={desk} />
        {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element -- Next's art-direction pattern: the props come from getImageProps, so the files are optimised; next/image cannot render a <picture> */}
        <img {...props} alt={props.alt} />
      </picture>
    </div>
  );
}
