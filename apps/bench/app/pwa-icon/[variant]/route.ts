import { monogram } from "@/lib/site/monogram";

/** Home-screen icons for the manifest. `maskable` keeps the letter inside
 * the safe zone a launcher may crop to a circle. */
const VARIANTS: Readonly<
  Record<string, { readonly fill: number; readonly side: number }>
> = {
  "192": { fill: 0.62, side: 192 },
  "512": { fill: 0.62, side: 512 },
  "512-maskable": { fill: 0.46, side: 512 },
};

export async function GET(
  _request: Request,
  context: RouteContext<"/pwa-icon/[variant]">
) {
  const { variant } = await context.params;
  const chosen = VARIANTS[variant];
  if (chosen === undefined) {
    return new Response(null, { status: 404 });
  }
  const image = await monogram(chosen.side, chosen.fill);
  image.headers.set("cache-control", "public, max-age=86400");
  return image;
}
