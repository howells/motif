import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { SITE } from "@/lib/site/content";

export const alt =
  "Motif: three amber glass bottles and a white bowl on a stone shelf in raking daylight";
export const contentType = "image/png";
export const size = { height: 630, width: 1200 };

/** The photograph's share of the card, bleeding off the top, right and
 * bottom edges. */
const PHOTO_WIDTH = 740;
/** Where the crop sits across the spare width: a little left of centre keeps
 * the bottles and the bowl in frame with wall to the right of them. */
const PHOTO_LEFT = 0.38;

/** The share card is the hero, cut down: the wordmark, one line and the
 * shelf the hero opens on, on the same paper. Next prerenders it at build, so
 * the files are read from disk rather than fetched. Satori reads TTF but not
 * woff2, which is why the two faces are vendored in `assets/fonts`. Each
 * path is a literal so the build traces exactly these three files.
 *
 * The photograph is cut to its panel here: Satori tiles a `cover` background
 * rather than scaling it. */
async function OpenGraphImage() {
  const [faculty, inter, shelf] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/FacultyGlyphic-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
    readFile(join(process.cwd(), "public/demo/sources/apothecary.jpg")),
  ]);
  const scaled = await sharp(shelf)
    .resize({ height: size.height })
    .toBuffer({ resolveWithObject: true });
  const photo = await sharp(scaled.data)
    .extract({
      height: size.height,
      left: Math.round((scaled.info.width - PHOTO_WIDTH) * PHOTO_LEFT),
      top: 0,
      width: PHOTO_WIDTH,
    })
    .jpeg({ quality: 88 })
    .toBuffer();

  return new ImageResponse(
    <div
      style={{
        background: "#faf9f7",
        color: "#1c1b1a",
        display: "flex",
        height: "100%",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 0 68px 72px",
          width: 460,
        }}
      >
        <div
          style={{
            fontFamily: "Faculty Glyphic",
            fontSize: 132,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {SITE.name}
        </div>
        <div
          style={{
            color: "#5f5c5a",
            fontFamily: "Inter",
            fontSize: 28,
            lineHeight: 1.35,
            width: 320,
          }}
        >
          {SITE.tagline}
        </div>
      </div>
      <div
        style={{
          backgroundImage: `url(data:image/jpeg;base64,${photo.toString("base64")})`,
          display: "flex",
          height: "100%",
          width: PHOTO_WIDTH,
        }}
      />
    </div>,
    {
      ...size,
      fonts: [
        {
          data: faculty,
          name: "Faculty Glyphic",
          style: "normal",
          weight: 400,
        },
        { data: inter, name: "Inter", style: "normal", weight: 400 },
      ],
    }
  );
}

export default OpenGraphImage;
