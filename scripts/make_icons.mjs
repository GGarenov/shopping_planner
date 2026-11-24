// Renders the PWA icons into public/icons/ from the «Pazarko» master images.
//   npm run icons
// The masters (scripts/assets/icon-master-full.png and icon-master-pad.png, 1024×1024) are screenshots of
// scripts/assets/icon_master.html in Chrome — rendered in a browser so the "Pazarko" text on the bag uses the real
// Nunito Black (sharp/librsvg can't load that font). Re-shoot them when the logo changes (see that file).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "scripts", "assets");
const OUT = path.join(ROOT, "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

const full = path.join(ASSETS, "icon-master-full.png"); // art edge to edge (square; the OS rounds it)
const pad = path.join(ASSETS, "icon-master-pad.png"); // art inside the 80 % safe zone, for maskable icons

/** Square icon, or with rounded corners (22 %) for places that show it as-is. */
async function make(src, size, name, rounded) {
  let img = sharp(src).resize(size, size, { kernel: "lanczos3" });
  if (rounded) {
    const r = Math.round(size * 0.22);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`,
    );
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  await img.png().toFile(path.join(OUT, name));
  console.log("wrote", path.join("public/icons", name));
}

await make(full, 192, "icon-192.png", true);
await make(full, 512, "icon-512.png", true);
await make(pad, 512, "icon-maskable-512.png", false);
await make(full, 180, "apple-touch-icon.png", false); // iOS rounds the corners itself
await make(full, 32, "favicon-32.png", true);

// SVG favicon: the bag without the tiny text (unreadable at favicon size and no font guarantee in an SVG file).
fs.writeFileSync(
  path.join(OUT, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b8a91"/>
  <path d="M23 20 Q23 10 32 10 Q41 10 41 20" fill="none" stroke="#ffd166" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M12 21 H52 L49.5 55 Q49.2 58 46 58 H18 Q14.8 58 14.5 55 Z" fill="#ffd166"/>
  <path d="M12 21 H52 L51.7 25 H12.3 Z" fill="#f0a800"/>
  <circle cx="23" cy="23" r="1.6" fill="#0c3b40"/><circle cx="41" cy="23" r="1.6" fill="#0c3b40"/>
  <path d="M22 44 Q32 51 42 44" fill="none" stroke="#ff7a6b" stroke-width="3" stroke-linecap="round"/>
</svg>
`,
);
console.log("wrote", path.join("public/icons", "icon.svg"));
