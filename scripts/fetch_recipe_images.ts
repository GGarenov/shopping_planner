// Recipe photos from 1001recepti.com (closed test, non-commercial — see things_to_improve/todo.md, Фаза D).
// gotvach.bg is NOT used: its robots.txt disallows Anthropic's crawlers.
//
// For every recipe in data/recipes.json: search 1001recepti by name (then shorter variants), pick the result whose
// title shares the most words with ours, take that page's main photo (og:image), crop it square and save
//   public/recipes/<id>-800.webp and -400.webp
// and record the source in data/recipe_images.json (shown as "Снимка: 1001recepti.com" with a link).
//
//   npm run images:fetch                 recipes without a photo yet
//   npm run images:fetch -- --only <id>  one recipe (re-fetch)
//   npm run images:fetch -- --force      all recipes again
//   npm run images:fetch -- --dry-run    pick and print, download nothing
// Hand fixes: data/recipe_images_overrides.json  { "<recipe_id>": "<1001recepti recipe URL>" | "<other search words>" | null (= no photo) }
// Polite: one request at a time, ~1.5 s apart.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "recipes");
const DB = path.join(ROOT, "data", "recipe_images.json");
const OVERRIDES = path.join(ROOT, "data", "recipe_images_overrides.json");
const SITE = "https://www.1001recepti.com";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; pazaren-plan-test/1.0; recipe photos for a private test)" };
const DELAY_MS = 1500;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

export interface RecipeImage {
  file: string; // "/recipes/<id>-400.webp" (800 also exists)
  source_url: string;
  source_title: string;
  site: "1001recepti.com";
  score: number;
  fetched: string;
}

const readJson = <T>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url: string): Promise<Response> {
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}
const abs = (u: string) => (u.startsWith("//") ? `https:${u}` : u.startsWith("/") ? SITE + u : u);
const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// ---------- matching ----------
const STOP = new Set(["с", "със", "и", "от", "на", "за", "в", "във", "по", "без", "или", "лека", "версия", "чаша", "чаши"]);
/** Word stems: lowercase Cyrillic words of 3+ letters minus stop words, cut to 5 letters ("пилешко" ≈ "пилешки"). */
export function stems(s: string): string[] {
  return [...new Set((s.toLowerCase().match(/[а-яa-z]+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.slice(0, 5)))];
}
/** Share of our words found in their title, minus a little for long titles with many other ingredients. */
export function matchScore(ours: string, theirs: string): number {
  const a = stems(ours);
  const b = new Set(stems(theirs));
  if (!a.length) return 0;
  const hit = a.filter((w) => b.has(w)).length;
  const first = b.has(a[0]!) ? 0.15 : 0; // the dish word ("Мусака", "Палачинки") matters most
  return Math.round((hit / a.length + first - Math.max(0, b.size - a.length) * 0.02) * 100) / 100;
}
/** Search queries: full name, the part before " с/със ", the first two words. */
export function queries(name: string): string[] {
  const clean = name.replace(/[„“"()]/g, " ").replace(/\s+/g, " ").trim();
  const head = clean.split(/\s(?:с|със|от)\s/)[0]!;
  return [...new Set([clean, head, clean.split(" ").slice(0, 2).join(" ")])].filter((q) => q.length >= 3);
}

async function search(q: string): Promise<{ url: string; title: string }[]> {
  const first = await (await get(`${SITE}/control/search/?search=${encodeURIComponent(q)}`)).text();
  const loc = first.match(/window\.location = '([^']+)'/)?.[1];
  if (!loc) return [];
  const html = await (await get(abs(loc))).text();
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a[^>]+href="(\/\/www\.1001recepti\.com\/recipe\/\?recipe_id=[^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/g)) {
    const title = decode(m[2]!.replace(/<[^>]+>/g, ""));
    if (title && !/Натиснете/.test(title) && !out.has(m[1]!)) out.set(m[1]!, title);
  }
  return [...out].map(([url, title]) => ({ url: abs(url), title }));
}

async function pagePhoto(url: string): Promise<{ image: string; title: string } | null> {
  const html = await (await get(url)).text();
  const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const title = decode(html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "");
  if (!image || /logo|nophoto/i.test(image)) return null; // the site's placeholder for recipes without a photo
  return { image: abs(image), title };
}

async function saveImage(imageUrl: string, id: string) {
  const buf = Buffer.from(await (await get(imageUrl)).arrayBuffer());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of [800, 400])
    await sharp(buf).resize(size, size, { fit: "cover", position: "attention" }).webp({ quality: size === 800 ? 74 : 70 }).toFile(path.join(OUT_DIR, `${id}-${size}.webp`));
}

// ---------- main ----------
async function main() {
  const recipes = (readJson<{ recipes: { id: string; name: string }[] }>(path.join(ROOT, "data", "recipes.json"), { recipes: [] })).recipes;
  const db = readJson<Record<string, RecipeImage>>(DB, {});
  const overrides = readJson<Record<string, string | null>>(OVERRIDES, {});
  const todo = recipes.filter((r) => (ONLY ? r.id === ONLY : FORCE || !db[r.id]));
  console.log(`${todo.length} recipes to do${DRY ? " (dry run)" : ""}`);
  const today = new Date().toISOString().slice(0, 10);

  for (const r of todo) {
    try {
      if (r.id in overrides && overrides[r.id] === null) {
        delete db[r.id];
        console.log(`– ${r.id}: no photo (override)`);
        continue;
      }
      let chosen: { url: string; title: string; score: number } | null = null;
      let photo: { image: string; title: string } | null = null;
      const override = overrides[r.id];
      if (override && /^https?:/.test(override)) {
        photo = await pagePhoto(override);
        chosen = { url: override, title: photo?.title ?? "", score: 1 };
      } else {
        const seen = new Map<string, { url: string; title: string; score: number }>();
        // an override with words (not a URL) replaces the search queries and the words to match
        const wanted = override ?? r.name;
        for (const q of override ? [override] : queries(r.name)) {
          for (const c of await search(q)) if (!seen.has(c.url)) seen.set(c.url, { ...c, score: matchScore(wanted, c.title) });
          if ([...seen.values()].some((c) => c.score >= 0.8)) break; // good enough, don't search more
        }
        // best candidates first; the first one with a real photo wins
        for (const c of [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 8)) {
          photo = await pagePhoto(c.url);
          if (photo) {
            chosen = c;
            break;
          }
        }
      }
      if (!chosen || !photo) {
        console.log(`✗ ${r.id}: nothing found`);
        continue;
      }
      const flag = chosen.score < 0.5 ? "?" : "✓";
      console.log(`${flag} ${r.id} (${chosen.score}): ${r.name}  →  ${chosen.title}`);
      if (DRY) continue;
      await saveImage(photo.image, r.id);
      db[r.id] = { file: `/recipes/${r.id}-400.webp`, source_url: chosen.url, source_title: chosen.title, site: "1001recepti.com", score: chosen.score, fetched: today };
      fs.writeFileSync(DB, JSON.stringify(db, null, 2) + "\n");
    } catch (e) {
      console.log(`! ${r.id}: ${(e as Error).message}`);
    }
  }
  console.log(`done: ${Object.keys(db).length}/${recipes.length} recipes have a photo`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
