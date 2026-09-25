/**
 * Runs the real FurnaceFileOps WASM under vitest. The build is web-only and
 * its loader injects a <script> tag (`FurnaceFileOps.ts` getModule), so the
 * tag is answered here by evaluating the same file and handing the factory the
 * .wasm bytes directly. Call from `beforeAll`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

export const repoRoot = path.resolve(__dirname, '../../../..');

export function installFurnaceFileOpsWasm(): void {
  const js = fs.readFileSync(path.join(repoRoot, 'public/furnace-fileops/FurnaceFileOps.js'), 'utf8');
  const wasmBinary = fs.readFileSync(path.join(repoRoot, 'public/furnace-fileops/FurnaceFileOps.wasm'));
  const realAppend = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.src.endsWith('/furnace-fileops/FurnaceFileOps.js')) {
      (0, eval)(js);
      const g = globalThis as unknown as { createFurnaceFileOps: (o?: object) => Promise<unknown> };
      const factory = g.createFurnaceFileOps;
      g.createFurnaceFileOps = (o = {}) => factory({ ...o, wasmBinary });
      queueMicrotask(() => node.onload?.(new Event('load')));
      return node;
    }
    return realAppend(node);
  });
}

/** A song under public/data/songs, as an ArrayBuffer. */
export function readSong(rel: string): ArrayBuffer {
  const b = fs.readFileSync(path.join(repoRoot, 'public/data/songs', rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
