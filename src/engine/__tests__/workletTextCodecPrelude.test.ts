/**
 * The worklet scope has no TextEncoder/TextDecoder. Engine worklets that call
 * them (ASAP, the eagleplayer runner...) played silence unless UADE's worklet
 * had installed a substitute first (2026-10-05/06). worklets/text-codec.js is
 * loaded by WASMSingletonBase before every engine worklet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const ROOT = join(__dirname, '../../..');

describe('worklet text codec prelude', () => {
  it('defines TextEncoder/TextDecoder in a scope that lacks them, round-tripping UTF-8', () => {
    const scope: Record<string, unknown> = { Uint8Array, String };
    scope.globalThis = scope;
    runInNewContext(readFileSync(join(ROOT, 'public/worklets/text-codec.js'), 'utf8'), scope);
    const TE = scope.TextEncoder as new () => { encode(s: string): Uint8Array };
    const TD = scope.TextDecoder as new () => { decode(b: Uint8Array): string };
    for (const text of ['chop suey.sap', 'Schumann - Träumerei.eup', 'ふるさと', 'emoji \u{1F3B5} tune']) {
      const bytes = new TE().encode(text);
      expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode(text)));
      expect(new TD().decode(bytes)).toBe(text);
    }
  });

  it('is added before the engine worklet in WASMSingletonBase', () => {
    const src = readFileSync(join(ROOT, 'src/engine/wasm/WASMSingletonBase.ts'), 'utf8');
    const codec = src.indexOf('worklets/text-codec.js');
    const engine = src.indexOf('addModule(workletUrl)');
    expect(codec).toBeGreaterThan(-1);
    expect(engine).toBeGreaterThan(codec);
  });
});
