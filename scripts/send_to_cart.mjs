// Puts a plan's shopping list into the eBag cart (never checks out — that is only possible on the website).
//   node scripts/send_to_cart.mjs [data/plans/<plan>.json]           -> dry run: checks availability, shows what it would do
//   node scripts/send_to_cart.mjs [data/plans/<plan>.json] --apply   -> writes the cart
// Before adding, every product is re-checked with get_product (availability changes within hours).
// If a product is sold out, the next cheapest alternative from the plan is used, with enough packs
// to cover the same edible grams.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./ebag_client.mjs";
import { ROOT } from "./ebag_config.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
let planPath = args.find((a) => a.endsWith(".json"));
if (!planPath) {
  const dir = path.join(ROOT, "data", "plans");
  planPath = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
console.log(`Plan: ${path.relative(ROOT, planPath)} — ${plan.shopping.length} products, planned checkout ${plan.checkout_eur} EUR`);
console.log(apply ? "Mode: APPLY (the cart will be changed, nothing is bought)" : "Mode: dry run (add --apply to change the cart)");

const api = await connect({ interactive: false });
// eBag can report is_available: true with available_quantity 0 — that is out of stock.
const isAvailable = async (id) => {
  try {
    const p = await api.call("get_product", { product_id: id });
    const stock = p.available_quantity == null ? null : Number(p.available_quantity);
    return p.is_available && (stock == null || stock > 0) ? p : null;
  } catch {
    return null;
  }
};

// For every shopping item: the planned product if in stock, otherwise the alternatives in order of price.
const actions = [],
  missing = [];
for (const item of plan.shopping) {
  const options = [];
  const first = await isAvailable(item.ebag_id);
  if (first)
    options.push({
      id: item.ebag_id,
      name: item.product,
      qty: item.packs,
      unit: first.unit ?? item.unit,
      price: Number(first.prices?.promo_unit_delta ?? first.prices?.unit_delta),
    });
  for (const alt of item.alternatives ?? []) {
    const p = await isAvailable(alt.ebag_id);
    if (!p) continue;
    const qty = Math.max(1, Math.ceil(item.used_edible_g / alt.usable_g));
    options.push({
      id: alt.ebag_id,
      name: alt.name,
      qty,
      unit: p.unit ?? alt.unit,
      price: Number(p.prices?.promo_unit_delta ?? p.prices?.unit_delta),
      replaces: item.product,
    });
  }
  if (!options.length) {
    missing.push(item.product);
    console.log(`  ✗ ${item.product} — sold out, no alternative available`);
    continue;
  }
  const chosen = options[0];
  actions.push({ ...chosen, fallbacks: options.slice(1) });
  console.log(
    `  ${chosen.replaces ? "↻" : "✓"} ${chosen.qty} ${chosen.unit} × ${chosen.name}${chosen.replaces ? `  (instead of sold-out ${chosen.replaces})` : ""} — ${(chosen.qty * chosen.price).toFixed(2)} EUR`,
  );
}

const total = actions.reduce((a, x) => a + x.qty * x.price, 0);
console.log(
  `\nEstimated cart total: ${total.toFixed(2)} EUR (${actions.length} products${missing.length ? `, ${missing.length} missing` : ""})`,
);

if (apply) {
  for (const a of actions) {
    // If eBag still refuses the product (stock changed seconds ago), try the next alternative.
    let added = false;
    for (const o of [a, ...a.fallbacks]) {
      try {
        await api.call("update_cart_item", { product_id: o.id, action: "set", quantity: o.qty, unit: o.unit });
        if (o !== a) console.log(`  ↻ ${a.name} refused by the cart — added ${o.name} instead`);
        added = true;
        break;
      } catch (e) {
        /* try next */
      }
    }
    if (!added) console.log(`  ! could not add ${a.name} or any alternative`);
  }
  const cart = await api.call("get_cart", { page_size: 50 });
  console.log(
    `Cart now: ${cart.total_items} items, total ${cart.totals?.total} EUR, delivery ${cart.totals?.shipping_price} EUR — ${cart.url}`,
  );
  console.log("Nothing was ordered. Review and check out on the eBag website if you want to buy.");
}
await api.close();
