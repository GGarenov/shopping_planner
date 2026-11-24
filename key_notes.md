1. For data of the foods and prices we will use eBag mcp.
2. Downloaded table with the ingredients
3. Recipe dataset (with meals, eggs on benedicts, chicken with rice or whatever..)
4.

## Things to improve

1. ✅ DONE (2026-11-23) — Maybe we should get from somewhere else the ingredients data instead of USDA?
   - Decision: keep USDA as the fallback, but use the **real eBag label of the product being bought** first.
   - The planner now tracks which product supplies which grams, so macros come from that product's label
     (when the label is valid). In the test plan 16 of 42 bought products use their eBag label.
   - eBag labels collected so far: 471 valid out of 799 products checked; the daily sync fetches 400 more
     per day, cheapest products first.
   - Possible later: CIQUAL (French open food table) for Bulgarian-type items without labels.
2. ✅ DONE — We should optimize the speed
   - Planner rewritten in two stages: (1) choose meals, (2) choose products and whole packs.
   - Fewer candidate recipes per slot (8 best by price per gram of protein + fish/variety options).
   - Result: **~5 s** instead of 120 s (and 120 s used to stop at the time limit).
   - Also added: no main protein twice a day, fish at least once a week, real budget check in both stages.
3. ✅ DONE — We should fix this 62 auto-linked products
   - 62 → **0** flagged. Weight read from product names ("0.800-1.100 кг", "~ 1 кг", "450 G"),
     default weights for bunches/pieces (dill 50 g, cabbage 1.2 kg…), invalid labels just ignored,
     ambiguous rules fixed ("3,2%" milk, flavoured кашкавал, lentil bread…), kitchen tools excluded
     (a garlic press was linked to garlic), 3 weightless products excluded in `data/ebag_overrides.json`.
   - Review page: `npm run review` → http://127.0.0.1:5177 — the cheapest products per ingredient with
     OK / Wrong buttons; "Apply" re-links. Answers are saved in `data/ebag_overrides.json`.
4. ✅ DONE — Yes add them to the cart but dont buy anything.
   - Cart filled with the test plan (36 products, €86.22, free delivery), nothing ordered.
   - New: `npm run cart` (dry run) / `npm run cart -- --apply` re-checks every product right before adding
     and swaps sold-out ones for the next cheapest. Found that eBag can say "available" with stock 0 —
     the sync and the cart script now treat stock 0 as sold out.

## Next ideas

- Limit each protein per week (the cheap pork loin appears up to 6× a week).
- Batch cooking: count leftovers of мусака / кюфтета / брауни as later meals.
- Schedule the daily sync (Windows Task Scheduler) — not set up yet.
- Turkey breast, mackerel and rice cakes currently have no eBag product.

## Commands

- `npm run ebag:sync` — daily: prices, promos, stock, new products (`npm run ebag:relink` = re-link only, seconds)
- `npm run plan -- data/profiles/test.json` — make a week plan (saved in `data/plans/`)
- `npm run cart` — check the latest plan against live stock; add `-- --apply` to fill the eBag cart
- `npm run review` — review page for product links
- `npm run recipes:build` — rebuild `data/recipes.json` after editing `data/recipes_src/`
