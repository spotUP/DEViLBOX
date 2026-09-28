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
