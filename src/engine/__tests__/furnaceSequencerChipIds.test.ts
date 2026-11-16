import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = (p: string) => resolve(__dirname, '../../..', p);

// The WASM build preempts sysDef.h, so the sequencer cannot static_assert against the real
// DivSystem enum. This test ties every SEQ_CHIP_* id to Furnace's enum instead.
// The pre-commit hook tests a copy of the tree without the vendored Furnace source.
const haveFurnace = existsSync(repo('third-party/furnace-master/src/engine/sysDef.h'));
const read = (p: string) => (haveFurnace ? readFileSync(repo(p), 'utf8') : '');
const sysDef = read('third-party/furnace-master/src/engine/sysDef.h');
const seq = read('furnace-wasm/common/FurnaceSequencer.cpp');
const wrapper = read('furnace-wasm/common/FurnaceDispatchWrapper.cpp');

function enumIds(src: string, name: string): Map<string, number> {
  const body = src.slice(src.indexOf(`enum ${name} {`)).split('};')[0];
  const ids = new Map<string, number>();
  let n = 0;
  for (const m of body.matchAll(/^\s*(DIV_SYSTEM_\w+)\s*(?:=\s*(\d+))?/gm)) {
    if (m[2] !== undefined) n = Number(m[2]);
    ids.set(m[1], n++);
  }
  return ids;
}

describe.skipIf(!haveFurnace)('FurnaceSequencer chip ids', () => {
  const real = enumIds(sysDef, 'DivSystem');

  it('every SEQ_CHIP_X define equals DIV_SYSTEM_X in the real enum', () => {
    const defs = [...seq.matchAll(/#define SEQ_CHIP_(\w+)\s+(\d+)/g)];
    expect(defs.length).toBeGreaterThan(50);
    for (const [, name, val] of defs) {
      expect(real.get(`DIV_SYSTEM_${name}`), name).toBe(Number(val));
    }
  });

  it('the effect switch uses named ids, never numeric literals', () => {
    const sw = seq.slice(seq.indexOf('perSystemEffect'));
    expect(sw.slice(0, sw.indexOf('perSystemPostEffect'))).not.toMatch(/case \d+:\s*\/\/ DIV_SYSTEM/);
  });

  it('the wrapper enum copy matches the real enum', () => {
    const local = enumIds(wrapper, 'DivSystemLocal');
    for (const [k, v] of local) if (k !== 'DIV_SYSTEM_MAX') expect(real.get(k), k).toBe(v);
  });
});
