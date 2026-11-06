#!/usr/bin/env node
// Step 2 of the Open Food Facts import: work/off-no.jsonl (from off-import.mjs) → data/off-no.json, the compact table the
// Smakform app bundles for search.
//
//   node --experimental-strip-types scripts/off-build.mjs
//
// Kept: a valid EAN/GTIN, a name, and an energy value per 100 g. Values are copied from the label
// data as OFF has them; rows that are physically impossible are dropped, never «fixed» (we do not
// edit OFF data — ODbL 4.4; nutrition-expert reviews the plausibility rules). Unknown stays null.
// This file is a derivative database of OFF under ODbL 1.0: it stays a separate file, is never
// merged with Matvaretabellen or our own data in one record, and is offered under ODbL (legal 06.11).

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
// Run with type stripping: node --experimental-strip-types scripts/off-build.mjs
import { checkLabel, checkServing, isLiquidQuantity } from './plausibility.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IN = join(ROOT, 'work', 'off-no.jsonl');
const OUT = join(ROOT, 'data', 'off-no.json');

const num = (s) => {
  if (s === undefined || s === null || String(s).trim() === '') return null;
  const x = Number(String(s).replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const round = (x) => (x === null ? null : Math.round(x * 100) / 100);

/** GS1 check digit for EAN-8 / UPC-A / EAN-13 / GTIN-14. */
function validGtin(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const firstBrand = (s) => clean(String(s ?? '').split(',')[0]);

const reasons = {};
const drop = (r) => {
  reasons[r] = (reasons[r] ?? 0) + 1;
  return null;
};

function build(r) {
  const ean = clean(r.code);
  if (!validGtin(ean)) return drop('ean');
  const name = clean(r.product_name);
  if (name.length < 2) return drop('name');
  if (r.no_nutrition_data === 'on') return drop('no_nutrition_data');
  const x = {
    kcal: num(r['energy-kcal_100g']),
    kj: num(r['energy-kj_100g']),
    proteinG: num(r.proteins_100g),
    fatG: num(r.fat_100g),
    saturatedFatG: num(r['saturated-fat_100g']),
    carbohydrateG: num(r.carbohydrates_100g),
    sugarsG: num(r.sugars_100g),
    fibreG: num(r.fiber_100g),
    saltG: num(r.salt_100g),
    polyolsG: num(r.polyols_100g),
    alcoholVol: num(r.alcohol_100g),
    categories: String(r.categories_tags ?? '').split(',').filter(Boolean),
  };
  // The rules and constants live in packages/core/src/products/plausibility.ts (unit-tested).
  const check = checkLabel(x);
  if (!check.ok) return drop(check.reason);
  const quantity = clean(r.quantity) || null;
  const rawServing = num(r.serving_quantity);
  const serving = checkServing(rawServing, check.kcal, quantity);
  if (rawServing !== null && serving === null) reasons.serving_removed = (reasons.serving_removed ?? 0) + 1;
  return [
    ean,
    name,
    firstBrand(r.brands) || null,
    quantity,
    round(serving),
    [round(check.kcal), round(x.proteinG), round(x.fatG), round(x.saturatedFatG), round(x.carbohydrateG), round(x.sugarsG), round(x.fibreG), round(x.saltG)],
    isLiquidQuantity(quantity) ? 1 : 0,
    Number(r.unique_scans_n) || 0,
  ];
}

const byEan = new Map();
const rl = createInterface({ input: createReadStream(IN), crlfDelay: Infinity });
let n = 0;
for await (const line of rl) {
  if (!line) continue;
  n++;
  const row = build(JSON.parse(line));
  if (!row) continue;
  const prev = byEan.get(row[0]);
  if (!prev) byEan.set(row[0], row);
  else drop('duplicate');
}
// Most-scanned first: search ties are broken by this order.
const MIN_PRODUCTS = 15_000; // the 2026-11 dump gave 21 410: far fewer means a broken input
const meta = JSON.parse(readFileSync(join(dirname(IN), 'off-no.meta.json'), 'utf8'));
const products = [...byEan.values()].sort((a, b) => b[7] - a[7] || a[1].localeCompare(b[1])).map((r) => r.slice(0, 7));
if (products.length < MIN_PRODUCTS) throw new Error(`only ${products.length} products — not overwriting ${OUT}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'Open Food Facts (https://world.openfoodfacts.org)',
    // ODbL 4.2 b: the licence travels with the file (legal 06.11).
    license: 'Open Database License (ODbL) 1.0 https://opendatacommons.org/licenses/odbl/1-0/; contents: Database Contents License (DbCL) 1.0 https://opendatacommons.org/licenses/dbcl/1-0/',
    notice: 'Contains information from Open Food Facts, which is made available here under the Open Database License (ODbL).',
    copy: 'https://github.com/Olegglasstrader/smakform-off-norway',
    downloaded: meta.dumpDate,
    nutrients: ['kcal', 'protein', 'fat', 'saturated', 'carbohydrate', 'sugars', 'fibre', 'salt'],
    // row: [ean, name, brand, quantity, servingG, nutrients per 100 g (per 100 ml if liquid), liquid 0/1]
    products,
  }) + '\n',
);
console.log(`✓ ${products.length} products of ${n} → ${OUT}`);
console.log('dropped:', reasons);
