// Renders the PWA icons into public/icons/ from an inline SVG.
//   node scripts/make_icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Basket with a leaf, white on green. `pad` shrinks the glyph for maskable icons (safe zone = 80 %).
const svg = (pad = 0, rounded = true) => {
  const s = 1 - pad;
  const t = (512 * pad) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#15803d"/>
  <g transform="translate(${t} ${t}) scale(${s})" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M176 214 L226 128 M336 214 L286 128"/>
    <path d="M96 214 H416 L384 392 Q379 416 354 416 H158 Q133 416 128 392 Z" fill="#fff" fill-opacity="0.12"/>
    <path d="M204 274 V356 M256 274 V356 M308 274 V356"/>
    <path d="M300 112 Q352 72 404 96 Q384 148 324 152 Q300 140 300 112 Z" fill="#bbf7d0" stroke="none"/>
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
