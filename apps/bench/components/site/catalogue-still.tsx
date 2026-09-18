import Image from "next/image";

import type { Plate } from "@/lib/site/catalogue";

export function Still({
  picture,
  plain,
  sizes,
}: {
  readonly picture: Plate;
  readonly plain?: boolean;
  readonly sizes: string;
}) {
  return (
    <Image
      alt={picture.alt}
      className={plain === true ? "site-still-plain" : undefined}
      height={picture.height}
      sizes={sizes}
      src={picture.src}
      width={picture.width}
    />
  );
}

export function Cover({
  picture,
  size,
  sizes,
}: {
  readonly picture: Plate;
  readonly size: number;
  readonly sizes: string;
}) {
  return (
    <div className="site-cover" style={{ height: size, width: size }}>
      <Image alt={picture.alt} fill sizes={sizes} src={picture.src} />
    </div>
  );
}

export function Note({
  children,
  ink,
  mono,
}: {
  readonly children: string;
  readonly ink?: boolean;
  readonly mono?: boolean;
}) {
  const color = ink === true ? "var(--ink)" : "var(--faint)";
  if (mono === true) {
    return (
      <code className="type-small block pt-3 font-mono" style={{ color }}>
        {children}
      </code>
    );
  }
  return (
    <p className="type-small pt-3" style={{ color }}>
      {children}
    </p>
  );
}
