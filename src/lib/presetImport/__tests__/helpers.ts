import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SynthPanelLayout } from '@/types/synthPanel';
import { ParseError } from '../types';
import { expect } from 'vitest';

export const ROOT = path.resolve(__dirname, '../../../..');

export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Files of an upstream directory under third-party/ or public/, or [] when the directory is absent (tests then skip). */
export function filesIn(rel: string, ext: string): string[] {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function read(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(file));
}

export interface Range { min: number; max: number }

/** Numeric min/max of every layout control that declares one (knob/slider min/max, select option values, toggles 0..1). */
export function layoutRanges(layout: SynthPanelLayout): Map<string, Range> {
  const out = new Map<string, Range>();
  const sections = [...(layout.sections ?? []), ...(layout.tabs ?? []).flatMap((t) => t.sections)];
  for (const s of sections) {
    for (const c of s.controls) {
      if ((c.type === 'knob' || c.type === 'slider') && typeof c.min === 'number' && typeof c.max === 'number') {
        out.set(c.key, { min: c.min, max: c.max });
      } else if (c.type === 'select') {
        const v = c.options.map((o) => Number(o.value)).filter((n) => Number.isFinite(n));
        if (v.length) out.set(c.key, { min: Math.min(...v), max: Math.max(...v) });
      } else if (c.type === 'toggle') out.set(c.key, { min: 0, max: 1 });
      else if (c.type === 'switch3way') out.set(c.key, { min: 0, max: 2 });
    }
  }
  return out;
}

/** Every config value whose key the layout bounds must lie inside the bound; returns how many were checked. */
export function expectInsideLayout(values: Record<string, unknown>, layout: SynthPanelLayout): number {
  const ranges = layoutRanges(layout);
  let checked = 0;
  for (const [k, v] of Object.entries(values)) {
    const r = ranges.get(k);
    if (!r || typeof v !== 'number') continue;
    checked++;
    expect(v, `${k} = ${v} outside layout [${r.min}, ${r.max}]`).toBeGreaterThanOrEqual(r.min);
    expect(v, `${k} = ${v} outside layout [${r.min}, ${r.max}]`).toBeLessThanOrEqual(r.max);
  }
  return checked;
}

export function expectParseError(fn: () => unknown): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ParseError);
}
