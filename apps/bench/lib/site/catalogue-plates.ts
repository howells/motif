import type { Plate } from "@/lib/site/catalogue";

export function plate(
  src: string,
  alt: string,
  width: number,
  height: number,
  caption?: string
): Plate {
  return caption === undefined
    ? { alt, height, src, width }
    : { alt, caption, height, src, width };
}

export const STILL_LIFE = plate(
  "/demo/looks/still-life.jpg",
  "Three ceramic vessels, one dark and two cream, on a plaster ledge in raking light",
  1024,
  1024
);

export const LOOKS: readonly Plate[] = [
  plate(
    "/demo/looks/editorial.jpg",
    "Pigment jars and folded cloth on a scrubbed wooden table in daylight",
    1800,
    1800
  ),
  STILL_LIFE,
  plate(
    "/demo/looks/interior.jpg",
    "A bright collected room that feels lived in",
    1024,
    768
  ),
  plate(
    "/demo/looks/architectural.jpg",
    "A restored country house in pale lime render with sash windows, seen across a clipped lawn between pleached limes and yew",
    1650,
    2048
  ),
  plate(
    "/demo/looks/portrait.jpg",
    "A woman in a plain linen shirt, hair tied back, against a plaster wall in soft evening light",
    2048,
    2048
  ),
  plate(
    "/demo/looks/object.jpg",
    "One object in one colour on a clean ground",
    1024,
    1024
  ),
  plate(
    "/demo/looks/surface.jpg",
    "A flat, edge-to-edge surface photograph",
    1024,
    1024
  ),
  plate(
    "/demo/looks/abstract.jpg",
    "Two long gestures in oatmeal and putty over a pale vertical band on coarse linen, one charcoal mark low right",
    2048,
    1374
  ),
  plate(
    "/demo/looks/illustration.jpg",
    "A stoneware jug with an olive branch and two shallow bowls on a table by a tall window, drawn in line and gouache",
    1024,
    1024
  ),
];

export const SERIES: readonly Plate[] = [
  plate(
    "/demo/series/01.jpg",
    "A rustic pottery workshop, one of six in the same register",
    1000,
    1000
  ),
  plate(
    "/demo/series/02.jpg",
    "A pottery workshop interior, one of six in the same register",
    1000,
    1000
  ),
  plate(
    "/demo/series/03.jpg",
    "A pottery workbench, one of six in the same register",
    1000,
    1000
  ),
  plate(
    "/demo/series/04.jpg",
    "A pottery workshop in raking light, one of six in the same register",
    1000,
    1000
  ),
  plate(
    "/demo/series/05.jpg",
    "A rustic pottery workshop from another angle, one of six in the same register",
    1000,
    1000
  ),
  plate(
    "/demo/series/06.jpg",
    "A ceramic bowl on a wooden table, one of six in the same register",
    1000,
    1000
  ),
];

export const VASE = plate(
  "/demo/vase/vase.jpg",
  "A cream ceramic vase on a linen cloth by a window",
  1000,
  1000,
  "the source"
);

export const INTERIOR = plate(
  "/demo/sources/interior.jpg",
  "A wooden bench with a folded throw and two vases against a sunlit wall",
  1400,
  781
);

export const APOTHECARY = plate(
  "/demo/sources/apothecary.jpg",
  "Three amber glass bottles and a white bowl on a stone shelf in raking daylight",
  1400,
  781,
  "the photograph"
);
