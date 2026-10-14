/**
 * Typed arrays and Maps as plain JSON, and back.
 *
 * A native editor's model (SID Factory 2, CheeseCutter) holds Uint8Arrays and
 * a Map, a Furnace song's module samples Int8/Int16Arrays; a saved song
 * travels as JSON (.dbx) and through structured clone (IndexedDB), and JSON
 * turns a typed array into an object of numbers and drops a Map. Tagged, all
 * survive either route.
 */

const U8 = '__uint8array';
const I8 = '__int8array';
const I16 = '__int16array';
const MAP = '__map';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `value` with every Uint8Array / Int8Array / Int16Array and Map replaced by a tagged plain object. */
export function toTypedJson(value: unknown): unknown {
  if (value instanceof Uint8Array) return { [U8]: bytesToBase64(value) };
  if (value instanceof Int8Array || value instanceof Int16Array) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [value instanceof Int8Array ? I8 : I16]: bytesToBase64(bytes) };
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
    if (typeof o[U8] === 'string') return base64ToBytes(o[U8] as string) as T;
    if (typeof o[I8] === 'string') return new Int8Array(base64ToBytes(o[I8] as string).buffer) as T;
    if (typeof o[I16] === 'string') return new Int16Array(base64ToBytes(o[I16] as string).buffer) as T;
    if (Array.isArray(o[MAP])) return new Map((o[MAP] as unknown[][]).map(([k, v]) => [fromTypedJson(k), fromTypedJson(v)])) as T;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromTypedJson(v)])) as T;
  }
  return value as T;
}
