# Smakform – Open Food Facts, Norway subset

Contains information from [Open Food Facts](https://openfoodfacts.org), which is made available here under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Individual contents are under the
[Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1-0/). This file is a derivative
database of Open Food Facts and is likewise available under ODbL 1.0.

This is the product table bundled in the Smakform app (a food diary for Norway). Every version that ships in the
app is published here; the git history is the archive of versions.

## Files

- `data/off-no.json` — the table. Header: source, licence, dump date (`downloaded`), nutrient order. Each row:
  `[ean, name, brand, quantity, servingG, [kcal, protein, fat, saturated, carbohydrate, sugars, fibre, salt], liquid]`,
  values per 100 g (per 100 ml when `liquid` is 1), `null` = not given on Open Food Facts.
- `scripts/off-import.mjs` — streams the full Open Food Facts CSV export and keeps the products tagged `en:norway`
  (into `work/`, not published).
- `scripts/off-build.mjs` + `scripts/plausibility.ts` — build `data/off-no.json` from that.

Rebuild (Node 22+):

```
node scripts/off-import.mjs
node --experimental-strip-types scripts/off-build.mjs
```

## Method

Products tagged `en:norway`. Left out: rows without a valid EAN/GTIN (check digit), a name or an energy value, and
rows with physically impossible or self-contradicting figures (energy outside 0–900 kcal/100 g, a nutrient over
100 g/100 g, saturates above fat or sugars above carbohydrate, macronutrients over 100 g, kJ and kcal that do not
match, stated energy far from the energy calculated with the EU factors of Regulation (EU) 1169/2011 Annex XIV, an
all-zero entry outside low-energy categories). A label serving that cannot be true (under 5 g, over 1000 g or
1500 kcal, or larger than the package) is left empty. Where only kJ was given, kcal = kJ / 4.184. Values are rounded
to 2 decimals; otherwise unchanged. Only the first brand is kept. The exact rules are in `scripts/plausibility.ts`.

## No warranty

The data are added by volunteers and may be wrong or out of date. Always check the packaging, especially for
allergens. No allergen data are included.
