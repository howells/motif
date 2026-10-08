import { monogram } from "@/lib/site/monogram";

export const contentType = "image/png";
export const size = { height: 64, width: 64 };

async function Icon() {
  return await monogram(size.width, 0.82);
}

export default Icon;
