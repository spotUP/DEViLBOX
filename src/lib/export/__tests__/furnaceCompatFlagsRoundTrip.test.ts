/**
 * Every DivCompatFlags field of Furnace (song.h) must be parsed, sent to the dispatch,
 * and written back on .fur export. The field list is read from the struct, not typed here.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../..');
// The pre-commit snapshot leaves out third-party/, so fall back to the committed file.
const read = (p: string) => {
  const f = resolve(root, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : execFileSync('git', ['show', `HEAD:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24 });
};

function structFields(): string[] {
  const src = read('third-party/furnace-master/src/engine/song.h');
  const start = src.indexOf('struct DivCompatFlags');
  const end = src.indexOf('bool areDefaults', start);
  const names: string[] = [];
  for (const line of src.slice(start, end).split('\n')) {
    const m = /^\s+(?:bool|unsigned char)\s+([A-Za-z0-9_]+);/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Flags only the INF2 layout (Furnace 0.7) has; the 0.6.8.3 INFO layout cannot hold them. */
const INF2_ONLY = ['oldCenterRate', 'noVolSlideReset', 'arpSpeedGlobal'];

describe('DivCompatFlags coverage', () => {
  const fields = structFields();

  it('reads all 58 fields from song.h', () => {
    expect(fields.length).toBe(58);
  });

  it('parser INF2 defaults name every field', () => {
    const parser = read('src/lib/import/formats/FurnaceSongParser.ts');
    for (const f of fields) expect(parser, f).toMatch(new RegExp(`\\b${f}\\b`));
  });

  it('dispatch engine sends every field in struct order', () => {
    const eng = read('src/engine/furnace-dispatch/FurnaceDispatchEngine.ts');
    const body = eng.slice(eng.indexOf('new Uint8Array(58)'));
    const order = [...body.matchAll(/flagArray\[(\d+)\]\s*=\s*(?:flags\.)?([A-Za-z0-9_]+)/g)];
    const bySlot = new Map(order.map((m) => [Number(m[1]), m[2]]));
    fields.forEach((f, i) => expect(bySlot.get(i) ?? '', `slot ${i}`).toContain(f));
  });

  it('exporter INFO layout holds every field except the INF2-only ones', () => {
    const exp = read('src/lib/export/FurnaceModuleExporter.ts');
    const block = exp.slice(exp.indexOf('INFO_COMPAT_FLAGS'), exp.indexOf('function block('));
    for (const f of fields) {
      if (INF2_ONLY.includes(f)) expect(block, f).not.toMatch(new RegExp(`\\['${f}'`));
      else expect(block, f).toMatch(new RegExp(`\\['${f}'`));
    }
  });
});
