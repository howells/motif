import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";
import sharp from "sharp";

import { SITE } from "@/lib/site/content";

export const alt =
  "Motif: amber bottles and a brass dish on a walnut shelf in raking light";
export const contentType = "image/png";
export const size = { height: 630, width: 1200 };

/** The share card is the homepage's opening picture, full bleed, with the
 * wordmark set on the empty wall to the right of the shelf. Next prerenders
 * it at build, so the files are read from disk rather than fetched. Satori
 * reads TTF but not woff2, which is why the face is vendored in
 * `assets/fonts`. Each path is a literal so the build traces exactly these
 * files.
 *
 * The photograph is cut to the card here: Satori tiles a `cover` background
 * rather than scaling it. */
async function OpenGraphImage() {
  const [faculty, still] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/FacultyGlyphic-Regular.ttf")),
    readFile(join(process.cwd(), "public/demo/showcase/hero.jpg")),
  ]);
  const photo = await sharp(still)
    .resize({ fit: "cover", height: size.height, width: size.width })
    .jpeg({ quality: 90 })
    .toBuffer();

  return new ImageResponse(
    <div
      style={{
        backgroundImage: `url(data:image/jpeg;base64,${photo.toString("base64")})`,
        color: "#f4efe6",
        display: "flex",
        fontFamily: "Faculty Glyphic",
        fontSize: 120,
        height: "100%",
        justifyContent: "flex-end",
        letterSpacing: "-0.01em",
        lineHeight: 1,
        padding: "72px 88px",
        width: "100%",
      }}
    >
      {SITE.name}
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
      ],
    }
  );
}

export default OpenGraphImage;
