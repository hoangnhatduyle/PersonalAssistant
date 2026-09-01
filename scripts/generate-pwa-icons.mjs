// One-off generator: derives all PWA/app icons from public/Caricature.jpg.
// Re-run with `node scripts/generate-pwa-icons.mjs` if the source image changes.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(rootDir, "public", "Caricature.jpg");
const THEME_BG = "#05070d";

async function centerCroppedSquareBuffer() {
  const { width, height } = await sharp(source).metadata();
  const size = Math.min(width, height);
  const left = Math.floor((width - size) / 2);
  const top = Math.floor((height - size) / 2);
  return sharp(source).extract({ left, top, width: size, height: size }).toBuffer();
}

async function main() {
  const squareBuffer = await centerCroppedSquareBuffer();

  await mkdir(path.join(rootDir, "public", "icons"), { recursive: true });

  await sharp(squareBuffer).resize(512, 512).png().toFile(path.join(rootDir, "src", "app", "icon.png"));

  await sharp(squareBuffer).resize(180, 180).png().toFile(path.join(rootDir, "src", "app", "apple-icon.png"));

  await sharp(squareBuffer).resize(192, 192).png().toFile(path.join(rootDir, "public", "icons", "icon-192.png"));

  await sharp(squareBuffer).resize(512, 512).png().toFile(path.join(rootDir, "public", "icons", "icon-512.png"));

  // Maskable icon: shrink the subject into a safe zone on a solid background
  // so OS icon masks (circle/squircle/etc.) don't clip it.
  const maskableSubject = await sharp(squareBuffer).resize(358, 358).png().toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: THEME_BG,
    },
  })
    .composite([{ input: maskableSubject, gravity: "center" }])
    .png()
    .toFile(path.join(rootDir, "public", "icons", "icon-maskable-512.png"));

  console.log("Generated PWA icons from public/Caricature.jpg");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
