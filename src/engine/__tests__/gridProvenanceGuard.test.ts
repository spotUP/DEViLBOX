/**
 * G11 guard: a parser cannot ship a pattern grid that is not listed.
 *
 * Walks FORMAT_REGISTRY (the structure every dispatcher, dialog and loader
 * derives from) against src/lib/import/gridProvenance.ts. A format with no
 * entry fails; a RECONSTRUCTED one needs a unit that exists in the plan; a
 * WALK one needs its oracle test on disk. Add the key there, with the class
 * the parser really has, in the same commit as the parser.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORMAT_REGISTRY } from '@/lib/import/FormatRegistry';
import {
  DIRECT_GRIDS,
  GRID_PLAN_FILE,
  RECONSTRUCTED_GRIDS,
  SCOPE_GRIDS,
  WALK_GRIDS,
  gridProvenanceOf,
} from '@/lib/import/gridProvenance';

const ROOT = resolve(__dirname, '../../..');
const planText = readFileSync(resolve(ROOT, GRID_PLAN_FILE), 'utf8');

function planDefines(unit: string): boolean {
  const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(\\*\\*|\\| )${esc}(?![\\w-])`).test(planText);
}

/** Every reason the table does not cover `keys`; empty = the guard passes. */
function auditGridTable(keys: readonly string[]): string[] {
  const problems: string[] = [];
  for (const key of keys) {
    const p = gridProvenanceOf(key);
    if (!p) { problems.push(`${key}: no entry in gridProvenance.ts (DIRECT, WALK, SCOPE or RECONSTRUCTED with a plan unit)`); continue; }
    if (p.source === 'WALK' && !existsSync(resolve(ROOT, p.oracleTest!))) problems.push(`${key}: oracle test ${p.oracleTest} does not exist`);
    if (p.source === 'RECONSTRUCTED' && !planDefines(p.planUnit!)) problems.push(`${key}: plan unit ${p.planUnit} is not defined in ${GRID_PLAN_FILE}`);
  }
  return problems;
}

describe('every registry format declares where its grid comes from', () => {
  const keys = FORMAT_REGISTRY.map((f) => f.key);

  it('registry keys are unique (a duplicate would hide a second grid source)', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists every registry format, with a real oracle test or plan unit where one is required', () => {
    expect(auditGridTable(keys)).toEqual([]);
  });

  it('keeps no entry for a format that left the registry, and no key in two classes', () => {
    const known = new Set(keys);
    const all = [...Object.keys(WALK_GRIDS), ...Object.keys(SCOPE_GRIDS), ...Object.keys(RECONSTRUCTED_GRIDS), ...DIRECT_GRIDS];
    expect(all.filter((k) => !known.has(k))).toEqual([]);
    expect(all.length).toBe(new Set(all).size);
  });

  it('rejects a new format that is not listed (revert check)', () => {
    expect(auditGridTable([...keys, 'fakeUnlistedFormat'])).toEqual([
      'fakeUnlistedFormat: no entry in gridProvenance.ts (DIRECT, WALK, SCOPE or RECONSTRUCTED with a plan unit)',
    ]);
  });

  it('rejects a reconstructed entry whose plan unit does not exist', () => {
    expect(planDefines('G11-no-such-unit')).toBe(false);
    expect(planDefines('U28')).toBe(true);
  });
});
