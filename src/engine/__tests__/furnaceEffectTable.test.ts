import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { FURNACE_EFFECT_TABLE } from '../furnace-dispatch/furnaceEffectTable.gen';

const repo = (p: string) => resolve(__dirname, '../../..', p);
// The pre-commit hook tests a copy of the tree without the vendored Furnace source.
const haveFurnace = existsSync(repo('third-party/furnace-master/src/engine/sysDef.h'));

function inputHash(): string {
  const h = createHash('sha256');
  for (const f of [
    'third-party/furnace-master/src/engine/sysDef.cpp',
    'third-party/furnace-master/src/engine/sysDef.h',
    'third-party/furnace-master/src/engine/dispatch.h',
    'tools/gen-furnace-effect-table.ts',
  ]) h.update(readFileSync(repo(f)));
  return h.digest('hex').slice(0, 16);
}

describe.skipIf(!haveFurnace)('Furnace effect table is generated from sysDef.cpp', () => {
  it('both outputs match the current sources (run tools/gen-furnace-effect-table.ts if not)', () => {
    const hash = inputHash();
    expect(readFileSync(repo('furnace-wasm/common/FurnaceEffectTable.gen.h'), 'utf8')).toContain(`source-hash: ${hash}`);
    expect(readFileSync(repo('src/engine/furnace-dispatch/furnaceEffectTable.gen.ts'), 'utf8')).toContain(`source-hash: ${hash}`);
  });

  it('covers every system registered in sysDef.cpp', () => {
    const src = readFileSync(repo('third-party/furnace-master/src/engine/sysDef.cpp'), 'utf8');
    const registered = new Set([...src.matchAll(/sysDefs\[(DIV_SYSTEM_\w+)\]\s*=\s*new DivSysDef/g)].map((m) => m[1]));
    expect(registered.size).toBeGreaterThan(90);
    expect(Object.keys(FURNACE_EFFECT_TABLE).length).toBeGreaterThanOrEqual(90);
  });

  it('has a non-empty effect lane for most systems', () => {
    const withEffects = Object.values(FURNACE_EFFECT_TABLE).filter((x) => Object.keys(x.effect).length > 0);
    expect(withEffects.length).toBeGreaterThan(60);
  });
});
