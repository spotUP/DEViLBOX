/**
 * Merge a PARTIAL update into a current value and keep everything the update
 * does not name.
 *
 * Used where a caller sends only the fields it wants changed (the MCP
 * `update_synth_config` tool). It differs from `deepMerge` in lib/migration.ts
 * in one way: a list of objects is merged entry by entry, by position, so
 * `{ operators: [{ tl: 10 }] }` changes the level of the first operator and
 * leaves its other fields and the other operators alone. `deepMerge` replaces
 * the whole list, which is right for "defaults under a loaded config" and wrong
 * for a partial edit.
 *
 * Rules:
 * - plain object over plain object: merged key by key, recursively;
 * - list of plain objects over a list: merged by position; a `null` or missing
 *   entry keeps the current entry; entries past the current length are added;
 * - anything else (numbers, strings, lists of numbers, typed arrays): the
 *   update value replaces the current value;
 * - an `undefined` update value changes nothing.
 *
 * The inputs are never mutated.
 */

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** A list an update can patch by position: every entry is an object or a "keep" hole. */
function isPatchList(value: unknown): value is (PlainObject | null | undefined)[] {
  return Array.isArray(value)
    && value.some(isPlainObject)
    && value.every((entry) => entry === null || entry === undefined || isPlainObject(entry));
}

export function mergePartialUpdate(current: unknown, update: unknown): unknown {
  if (update === undefined) return current;

  if (isPlainObject(update) && isPlainObject(current)) {
    const merged: PlainObject = { ...current };
    for (const key of Object.keys(update)) {
      merged[key] = mergePartialUpdate(current[key], update[key]);
    }
    return merged;
  }

  if (isPatchList(update) && Array.isArray(current)) {
    const length = Math.max(current.length, update.length);
    const merged: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const entry = update[i];
      merged.push(entry === null || entry === undefined ? current[i] : mergePartialUpdate(current[i], entry));
    }
    return merged;
  }

  return update;
}
