import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/** The wordmark's first letter on the page's paper, for the favicon and the
 * home-screen icon. The bird in `logo.png` is a hairline that disappears at
 * 32px; the glyphic M holds at any size. `fill` is the letter's share of
 * the square: a tab icon wants all of it, a home-screen icon wants air. */
export async function monogram(side: number, fill: number) {
  const faculty = await readFile(
    join(process.cwd(), "assets/fonts/FacultyGlyphic-Regular.ttf")
  );

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#faf9f7",
        color: "#1c1b1a",
        display: "flex",
        fontFamily: "Faculty Glyphic",
        fontSize: side * fill,
        height: "100%",
        justifyContent: "center",
        lineHeight: 1,
        paddingBottom: side * 0.04,
        width: "100%",
      }}
    >
      M
    </div>,
    {
      fonts: [
        {
          data: faculty,
          name: "Faculty Glyphic",
          style: "normal",
          weight: 400,
        },
      ],
      height: side,
      width: side,
    }
  );
}
