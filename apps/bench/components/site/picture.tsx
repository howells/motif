import Image from "next/image";

import type { Asset } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

/** PNG and SVG outputs may carry transparency, so they get the checkerboard.
 * An opaque one covers it completely and looks no different. */
export const mayBeTransparent = (asset: Asset) =>
  /\.(?:png|svg)$/u.test(asset.src);

export function Picture({ asset }: { readonly asset: Asset }) {
  return (
    <div className={mayBeTransparent(asset) ? styles.checker : undefined}>
      <Image
        alt={asset.alt}
        className="block h-auto w-full"
        height={asset.height}
        src={asset.src}
        unoptimized
        width={asset.width}
      />
    </div>
  );
}
