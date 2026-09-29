/**
 * A stored effect parameter as a number, or `fallback` when it is missing or
 * not a finite number.
 *
 * `Number(p.x) ?? fallback` does not do this: Number(undefined) is NaN, which
 * is not nullish, so the fallback never applied and NaN reached AudioParams
 * ("non-finite value" at creation, 2026-09-29).
 */
export function paramNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A stored effect parameter as a number, or `undefined` when it is missing or
 * not a finite number - for effect options whose class applies its own
 * default with `??`. A bare `Number(p.x)` gave NaN for a missing value, and
 * NaN is not nullish, so the class default never applied (2026-09-29).
 */
export function paramOptional(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
