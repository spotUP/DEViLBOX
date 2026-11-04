/** Shared by the JXS WASM render tests: loads public/jxs and renders a note from a module image. */
import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';


const root = path.resolve(__dirname, '../../../..');
export async function loadJxsWasm(): Promise<any> {
  const js = fs.readFileSync(path.join(root, 'public/jxs/Jxs.js'), 'utf8')
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/self\.location\.href/g, "'.'")
    .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."');
  const factory = new Function(js + '\nreturn createJxs;')();
  return factory({ wasmBinary: fs.readFileSync(path.join(root, 'public/jxs/Jxs.wasm')) });
}

/** The first 120 blocks of a note on `instrument` (1-based), as one number list. */
export function renderNote(m: any, bytes: Uint8Array, instrument: number, note = 37): Float32Array {
  const ptr = m._malloc(bytes.length);
  m.HEAPU8.set(bytes, ptr);
  const out = m._malloc(128 * 8);
  expect(m._jxs_preview_open(ptr, bytes.length)).toBe(1);
  m._jxs_preview_note(instrument, note);
  const all = new Float32Array(120 * 256);
  for (let b = 0; b < 120; b++) {
    m._jxs_preview_render(out, 128);
    all.set(m.HEAPF32.subarray(out >> 2, (out >> 2) + 256), b * 256);
  }
  m._jxs_preview_stop();
  m._jxs_preview_close();
  m._free(ptr);
  m._free(out);
  return all;
}

export const differs = (a: Float32Array, b: Float32Array): boolean => {
  for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) > 1e-6) return true;
  return false;
};

