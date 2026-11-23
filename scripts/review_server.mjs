// Local review page for eBag product links.
//   npm run review   ->  http://127.0.0.1:5177
// Shows, per ingredient, the cheapest products the planner can buy (the only ones that matter) with
// "OK" / "Wrong" buttons. Decisions are saved to data/ebag_overrides.json (approved / exclude).
// "Apply" re-runs the linking (sync --relink --no-details) so excluded products disappear.
import fs from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { ROOT, PATHS } from './ebag_config.mjs';

const PORT = 5177;
const TOP = 5; // products shown per ingredient (the planner uses the 3 cheapest)
const read = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loadOverrides() {
  const o = read(PATHS.overrides, {});
  return { exclude: [], link: {}, approved: [], notes: {}, ...o };
}

function page() {
  const ings = read(PATHS.ingredients).ingredients;
  const prods = read(PATHS.products).products;
  const o = loadOverrides();
  const approved = new Set(o.approved), excluded = new Set(o.exclude);
  let total = 0, done = 0;
  const sections = ings.map(ing => {
    const list = prods.filter(p => p.ingredient_id === ing.id && p.available && p.pack?.grams > 0)
      .map(p => {
        const ef = p.edible_fraction ?? ing.edible_fraction ?? 1;
        const usable = (p.pack.drained_grams ?? p.pack.grams) * ef;
        return { p, perKg: ((p.price.promo ?? p.price.regular) / usable) * 1000 };
      })
      .sort((a, b) => a.perKg - b.perKg).slice(0, TOP);
    if (!list.length) return `<section><h2>${esc(ing.name_bg)} <small>${esc(ing.id)}</small></h2><p class="none">No eBag product linked.</p></section>`;
    const rows = list.map(({ p, perKg }, i) => {
      total++;
      const st = excluded.has(p.ebag_id) ? 'wrong' : approved.has(p.ebag_id) ? 'ok' : '';
      if (st) done++;
      return `<tr class="${st}" data-id="${p.ebag_id}">
        <td>${i < 3 ? '★' : ''}</td>
        <td><a href="${esc(p.url)}" target="_blank">${esc(p.name)}</a>${p.link === 'manual' ? ' <span class="tag">manual</span>' : ''}</td>
        <td>${esc(p.pack.label)}${p.pack.grams_source ? ` <span class="tag">${esc(p.pack.grams_source)}: ${p.pack.grams} g</span>` : ''}</td>
        <td>${(p.price.promo ?? p.price.regular).toFixed(2)} €${p.price.promo != null ? ' <span class="tag promo">promo</span>' : ''}</td>
        <td>${perKg.toFixed(2)} €/kg</td>
        <td>${p.label?.valid ? `<span class="tag">label ${Math.round(p.label.kcal)} kcal · ${p.label.protein_g} g P</span>` : '<span class="tag dim">USDA</span>'}</td>
        <td class="btns"><button onclick="decide(${p.ebag_id},'ok')">OK</button><button onclick="decide(${p.ebag_id},'wrong')">Wrong</button><button class="ghost" onclick="decide(${p.ebag_id},'reset')">↺</button></td>
      </tr>`;
    }).join('');
    const u = ing.per_100g;
    return `<section><h2>${esc(ing.name_bg)} <small>${esc(ing.id)} · USDA ${u?.kcal} kcal · ${u?.protein_g} g P / 100 g</small></h2><table>${rows}</table></section>`;
  }).join('');
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Product link review</title>
<style>
  :root { --bg:#fafaf8; --fg:#1d1d1b; --mut:#6b6b66; --line:#e4e4df; --ok:#e3f4e6; --bad:#fbe4e2; --acc:#2f6f4f; }
  @media (prefers-color-scheme: dark) { :root { --bg:#171716; --fg:#ececea; --mut:#9a9a94; --line:#2c2c2a; --ok:#1e3a26; --bad:#45211f; --acc:#7fc39b; } }
  body { margin:0; padding:16px; font:14px/1.45 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
  header { position:sticky; top:0; background:var(--bg); padding:8px 0 12px; border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; flex-wrap:wrap; z-index:1; }
  h1 { font-size:18px; margin:0; } h2 { font-size:15px; margin:22px 0 6px; } h2 small { color:var(--mut); font-weight:400; }
  table { width:100%; border-collapse:collapse; } td { padding:6px 8px; border-top:1px solid var(--line); vertical-align:top; }
  tr.ok { background:var(--ok); } tr.wrong { background:var(--bad); text-decoration:line-through; }
  a { color:var(--acc); } .tag { font-size:12px; color:var(--mut); border:1px solid var(--line); border-radius:4px; padding:0 4px; white-space:nowrap; }
  .promo { color:var(--acc); } .dim { opacity:.7; } .none { color:var(--mut); }
  button { font:inherit; padding:3px 9px; margin-right:4px; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--fg); cursor:pointer; }
  button:hover { border-color:var(--acc); } .ghost { color:var(--mut); } .btns { white-space:nowrap; }
  #apply { background:var(--acc); color:var(--bg); border-color:var(--acc); } #msg { color:var(--mut); }
  @media (max-width:700px) { td:nth-child(5), td:nth-child(6) { display:none; } }
</style></head><body>
<header><h1>Product link review</h1><span id="count">${done}/${total} reviewed</span>
<label><input type="checkbox" id="hide" onchange="document.body.classList.toggle('hide',this.checked)"> hide reviewed</label>
<button id="apply" onclick="apply()">Apply (relink)</button><span id="msg">★ = one of the 3 the planner can buy</span></header>
<style>.hide tr.ok, .hide tr.wrong { display:none; }</style>
${sections}
<script>
async function decide(id, d) {
  const r = await fetch('/api/decision', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ebag_id:id, decision:d }) });
  if (!r.ok) { alert('Save failed'); return; }
  for (const tr of document.querySelectorAll('tr[data-id="'+id+'"]')) tr.className = d === 'reset' ? '' : d;
  const all = document.querySelectorAll('tr[data-id]').length, rev = document.querySelectorAll('tr.ok, tr.wrong').length;
  document.getElementById('count').textContent = rev + '/' + all + ' reviewed';
}
async function apply() {
  document.getElementById('msg').textContent = 'Relinking…';
  const r = await fetch('/api/apply', { method:'POST' });
  const t = await r.text();
  document.getElementById('msg').textContent = r.ok ? 'Done — reloading' : 'Failed: ' + t;
  if (r.ok) setTimeout(() => location.reload(), 600);
}
</script></body></html>`;
}

function body(req) {
  return new Promise((res, rej) => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => res(b)); req.on('error', rej); });
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
    } else if (req.method === 'POST' && req.url === '/api/decision') {
      const { ebag_id, decision } = JSON.parse(await body(req));
      const id = Number(ebag_id);
      const o = loadOverrides();
      o.approved = o.approved.filter(x => x !== id);
      o.exclude = o.exclude.filter(x => x !== id);
      if (decision === 'ok') o.approved.push(id);
      if (decision === 'wrong') o.exclude.push(id);
      fs.writeFileSync(PATHS.overrides, JSON.stringify(o, null, 2) + '\n', 'utf8');
      res.writeHead(204).end();
    } else if (req.method === 'POST' && req.url === '/api/apply') {
      execFile(process.execPath, ['--env-file-if-exists=.env.local', path.join(ROOT, 'scripts', 'sync.ts'), '--relink', '--no-details', '--dry-run', '--export'], { cwd: ROOT }, (err, out, errOut) => {
        if (err) res.writeHead(500).end(String(errOut || err.message));
        else res.writeHead(200).end(out.split('\n').slice(-4).join('\n'));
      });
    } else res.writeHead(404).end();
  } catch (e) { res.writeHead(500).end(String(e.message)); }
}).listen(PORT, '127.0.0.1', () => console.log(`Review page: http://127.0.0.1:${PORT}  (Ctrl+C to stop)`));
