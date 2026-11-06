/**
 * Plausibility rules for Open Food Facts label data (nutrition-expert 06.11, «Approved constants»).
 * Used by `scripts/off-build.mjs` at import time. We never repair OFF values (ODbL: no edits of
 * their data, and a guess is worse than a gap): a row that cannot be true is dropped; a serving
 * that cannot be true is removed (the product stays, the amount screen starts at 100 g).
 * Pure and self-contained (no imports): the build script loads this file with Node's type stripping.
 * Any change needs nutrition-expert review (AGENTS §2).
 */

/** kJ per kcal (Reg. (EU) 1169/2011 Annex XIV). E */
export const KJ_PER_KCAL = 4.184;
/** Energy factors, kcal per g (1169/2011 Annex XIV). E */
export const KCAL_PER_G = { protein: 4, carbohydrate: 4, fat: 9, fibre: 2, polyols: 2.4, alcohol: 7 } as const;
/** OFF stores alcohol in % vol; ethanol density 0.789 g/ml turns it into g per 100 ml. E (physics) */
export const ETHANOL_G_PER_ML = 0.789;
/** 100 g of pure fat = 900 kcal: the highest possible energy per 100 g. E */
export const KCAL_MAX_100G = 900;
/** No nutrient can exceed 100 g per 100 g. E */
export const NUTRIENT_MAX_100G = 100;
/** Protein + fat + carbohydrate + fibre + salt per 100 g, with room for label rounding. P */
export const SUM_MAX_100G = 101;
/** «of which» values may exceed their total only by label rounding (saturates ≤ fat, sugars ≤ carbohydrate). P */
export const SUBSET_TOL_G = 0.5;
/** Stated vs calculated energy: allowed gap = max(absolute, relative × the larger). Label rounding ≈ 9 kcal, ×2. P */
export const ENERGY_ABS_TOL_KCAL = 20;
/** Relative gap: catches kJ-in-the-kcal-field and per-serving-vs-per-100 g mix-ups on crowd data. P */
export const ENERGY_REL_TOL = 0.35;
/** kJ / kcal must be in this ratio when both are given and kcal ≥ KJ_KCAL_MIN_KCAL (Annex XIV 4.0–4.33 + margin). E + P */
export const KJ_KCAL_RATIO = { min: 3.9, max: 4.45 } as const;
export const KJ_KCAL_MIN_KCAL = 20;
/** Below this energy a product must be in a low-energy category, else it is a volunteer's placeholder. P */
export const LOW_ENERGY_KCAL = 4;
export const LOW_ENERGY_CATEGORIES = ['en:waters', 'en:beverages', 'en:teas', 'en:coffees', 'en:sweeteners', 'en:salts', 'en:spices', 'en:vinegars'] as const;
/** A label serving outside these bounds, above this energy, or above the net package size is removed. P */
export const SERVING_MIN_G = 5;
export const SERVING_MAX_G = 1000;
export const SERVING_MAX_KCAL = 1500;

export interface LabelInput {
  kcal: number | null;
  kj: number | null;
  proteinG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  carbohydrateG: number | null;
  sugarsG: number | null;
  fibreG: number | null;
  saltG: number | null;
  polyolsG: number | null;
  /** % vol, as OFF stores it. */
  alcoholVol: number | null;
  categories: readonly string[];
}

export type DropReason =
  | 'no_energy'
  | 'kcal_range'
  | 'macro_range'
  | 'sat_gt_fat'
  | 'sugar_gt_carb'
  | 'sum_gt_100'
  | 'kj_kcal_mismatch'
  | 'energy_mismatch'
  | 'zero_energy_suspect';

/** The energy per 100 g to use (kcal, else kJ / 4.184), or why the row cannot be true. */
export function checkLabel(x: LabelInput): { ok: true; kcal: number } | { ok: false; reason: DropReason } {
  let kcal = x.kcal;
  if (kcal === null && x.kj !== null) kcal = x.kj / KJ_PER_KCAL;
  if (kcal === null) return { ok: false, reason: 'no_energy' };
  if (kcal < 0 || kcal > KCAL_MAX_100G) return { ok: false, reason: 'kcal_range' };
  const { proteinG: p, fatG: f, saturatedFatG: sat, carbohydrateG: c, sugarsG: sug, fibreG: fib, saltG: salt } = x;
  for (const v of [p, f, sat, c, sug, fib, salt, x.polyolsG]) if (v !== null && (v < 0 || v > NUTRIENT_MAX_100G)) return { ok: false, reason: 'macro_range' };
  if (sat !== null && f !== null && sat > f + SUBSET_TOL_G) return { ok: false, reason: 'sat_gt_fat' };
  if (sug !== null && c !== null && sug > c + SUBSET_TOL_G) return { ok: false, reason: 'sugar_gt_carb' };
  const pol = x.polyolsG ?? 0;
  // Polyols are part of «carbohydrate» (Annex I(10)).
  if (c !== null && pol > c + SUBSET_TOL_G) return { ok: false, reason: 'sugar_gt_carb' };
  if ((p ?? 0) + (f ?? 0) + (c ?? 0) + (fib ?? 0) + (salt ?? 0) > SUM_MAX_100G) return { ok: false, reason: 'sum_gt_100' };
  // kJ = 0 next to kcal > 0 is an empty field filled with 0 by a volunteer, not a second value.
  if (x.kcal !== null && x.kj !== null && x.kj > 0 && x.kcal >= KJ_KCAL_MIN_KCAL) {
    const r = x.kj / x.kcal;
    if (r < KJ_KCAL_RATIO.min || r > KJ_KCAL_RATIO.max) return { ok: false, reason: 'kj_kcal_mismatch' };
  }
  if (p !== null && f !== null && c !== null) {
    const alcG = (x.alcoholVol ?? 0) * ETHANOL_G_PER_ML;
    const calc = KCAL_PER_G.protein * p + KCAL_PER_G.fat * f + KCAL_PER_G.carbohydrate * Math.max(0, c - pol) + KCAL_PER_G.polyols * pol + KCAL_PER_G.fibre * (fib ?? 0) + KCAL_PER_G.alcohol * alcG;
    if (Math.abs(calc - kcal) > Math.max(ENERGY_ABS_TOL_KCAL, ENERGY_REL_TOL * Math.max(calc, kcal))) return { ok: false, reason: 'energy_mismatch' };
  }
  if (kcal < LOW_ENERGY_KCAL && !x.categories.some((t) => (LOW_ENERGY_CATEGORIES as readonly string[]).includes(t))) return { ok: false, reason: 'zero_energy_suspect' };
  return { ok: true, kcal };
}

/** Net package size in g (or ml ≈ g) from «500 g», «1,75 l», «4 x 125 g», or null when unreadable. */
export function netGrams(quantity: string | null): number | null {
  if (!quantity) return null;
  const q = quantity.toLowerCase().replace(',', '.');
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|dl|l)\b/.exec(q);
  const one = /(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|dl|l)\b/.exec(q);
  const toG = (n: number, u: string) => n * ({ kg: 1000, g: 1, l: 1000, dl: 100, cl: 10, ml: 1 } as Record<string, number>)[u]!;
  if (multi) return Number(multi[1]) * toG(Number(multi[2]), multi[3]!);
  if (one) return toG(Number(one[1]), one[2]!);
  return null;
}

/** Liquid if the package size is in litres (OFF «_100g» then means per 100 ml). */
export function isLiquidQuantity(quantity: string | null): boolean {
  return !!quantity && /\d\s*(ml|cl|dl|l)\b/i.test(quantity.replace(',', '.'));
}

/** The label serving if it can be true, else null (then the amount screen starts at 100 g). */
export function checkServing(servingG: number | null, kcalPer100: number, quantity: string | null): number | null {
  if (servingG === null || !(servingG >= SERVING_MIN_G && servingG <= SERVING_MAX_G)) return null;
  if ((servingG * kcalPer100) / 100 > SERVING_MAX_KCAL) return null;
  const net = netGrams(quantity);
  if (net !== null && servingG > net + SUBSET_TOL_G) return null; // e.g. a soup powder's «250 ml prepared» on 77 g
  return servingG;
}
