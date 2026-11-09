import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

// Each homepage photograph, twelve pixels wide, for its frame to show blurred
// while the photograph loads. Cut-outs on a transparent ground get none: a
// blur of one would smudge the paper around it. Run after adding or changing
// a picture under public/demo:
//   pnpm --filter @motif/bench-web placeholders

const ROOT = path.join(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(ROOT, "lib/site/home/placeholders.json");

const files = execFileSync("git", ["ls-files", "-z", "public/demo"], {
  cwd: ROOT,
  encoding: "utf-8",
})
  .split("\0")
  .filter((file) => /\.(?:jpe?g|png|webp)$/iu.test(file));

const entries = await Promise.all(
  files.map(async (file) => {
    const image = sharp(path.join(ROOT, file));
    const { isOpaque } = await image.stats();
    if (!isOpaque) {
      return [];
    }
    const bytes = await image
      .resize(12, 12, { fit: "inside" })
      .webp({ quality: 50 })
      .toBuffer();
    const src = `/${path.relative(PUBLIC, path.join(ROOT, file))}`;
    return [[src, `data:image/webp;base64,${bytes.toString("base64")}`]];
  })
);

const placeholders = Object.fromEntries(
  entries.flat().toSorted(([a], [b]) => a.localeCompare(b))
);
writeFileSync(OUT, `${JSON.stringify(placeholders, null, 2)}\n`);
console.log(
  `${String(Object.keys(placeholders).length)} placeholders from ${String(files.length)} pictures`
);
