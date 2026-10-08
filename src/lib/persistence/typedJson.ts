/**
 * Typed arrays and Maps as plain JSON, and back.
 *
 * A native editor's model (SID Factory 2, CheeseCutter) holds Uint8Arrays and
 * a Map; a saved song travels as JSON (.dbx) and through structured clone
 * (IndexedDB), and JSON turns a Uint8Array into an object of numbers and
 * drops a Map. Tagged, both survive either route.
 */

const U8 = '__uint8array';
const MAP = '__map';

/** `value` with every Uint8Array and Map replaced by a tagged plain object. */
export function toTypedJson(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    let binary = '';
    for (let i = 0; i < value.length; i++) binary += String.fromCharCode(value[i]);
    return { [U8]: btoa(binary) };
  }
  if (value instanceof Map) return { [MAP]: Array.from(value.entries(), ([k, v]) => [toTypedJson(k), toTypedJson(v)]) };
  if (Array.isArray(value)) return value.map(toTypedJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toTypedJson(v)]));
  }
  return value;
}

/** The inverse of toTypedJson. */
export function fromTypedJson<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map(fromTypedJson) as T;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o[U8] === 'string') {
      const binary = atob(o[U8] as string);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes as T;
    }
    if (Array.isArray(o[MAP])) return new Map((o[MAP] as unknown[][]).map(([k, v]) => [fromTypedJson(k), fromTypedJson(v)])) as T;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromTypedJson(v)])) as T;
  }
  return value as T;
}
