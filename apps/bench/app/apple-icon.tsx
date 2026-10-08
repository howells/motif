import { monogram } from "@/lib/site/monogram";

export const contentType = "image/png";
export const size = { height: 180, width: 180 };

async function AppleIcon() {
  return await monogram(size.width, 0.62);
}

export default AppleIcon;
