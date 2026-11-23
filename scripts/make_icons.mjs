// Renders the PWA icons into public/icons/ from an inline SVG.
//   node scripts/make_icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Brand mark «Лагуна» (same drawing as components/Logo.tsx): plate + fork/knife + sunny check on turquoise.
// `pad` shrinks the glyph for maskable icons (safe zone = 80 %).
const svg = (pad = 0, rounded = true) => {
  const s = 1 - pad;
  const t = (64 * pad) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="#0b8a91"/>
  <g transform="translate(${t} ${t}) scale(${s})">
    <circle cx="32" cy="34" r="17" fill="#ffffff"/>
    <circle cx="32" cy="34" r="11" fill="none" stroke="#bfeceb" stroke-width="2"/>
    <path d="M25 34 l5 5 l10 -11" stroke="#f0a800" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 16 v12 M9 16 v6 q0 3 3 3 q3 0 3 -3 v-6" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M52 16 v12 M52 16 q-4 2 -4 7 h4" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
};

const jobs = [
  ['icon-192.png', 192, svg()],
  ['icon-512.png', 512, svg()],
  ['icon-maskable-512.png', 512, svg(0.2, false)],
  ['apple-touch-icon.png', 180, svg(0.1, false)],
  ['favicon-32.png', 32, svg()],
];
for (const [name, size, src] of jobs) {
  await sharp(Buffer.from(src)).resize(size, size).png().toFile(path.join(OUT, name));
  console.log('wrote', path.join('public/icons', name));
}
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg());
