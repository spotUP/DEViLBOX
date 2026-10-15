/**
 * The DX7 layout exposes every VCED parameter exactly once, with the ranges the voice format allows, in words, and every
 * section narrow enough for a 700 px column.
 *
 * Counted from two structures: VCED_MAX (dx7sysex.ts, the table of the 155 VCED parameters) and the controls of
 * DX7_LAYOUT.tabs (every `vced.N` key of every section of every tab).
 */
import { describe, it, expect } from 'vitest';
import { DX7_LAYOUT, DX7_NAME_FIRST_BYTE, DX7_NAME_LENGTH, dx7BreakPointName } from '@/constants/synthLayouts/dx7';
import { VCED_MAX } from '@/engine/dx7/dx7sysex';
import { sectionFlexBasis } from '../synthPanelSizing';
import type { ControlDescriptor, SectionDescriptor } from '@/types/synthPanel';

const sections: SectionDescriptor[] = (DX7_LAYOUT.tabs ?? []).flatMap((t) => t.sections);
const controls: ControlDescriptor[] = sections.flatMap((s) => s.controls);
const vcedControls = controls.filter((c) => /^vced\.\d+$/.test(c.key));

describe('DX7 layout parameter coverage', () => {
  it('the VCED table holds 155 parameters', () => {
    expect(VCED_MAX).toHaveLength(155);
  });

  it('every numeric VCED parameter (bytes 0..144) is on exactly one control', () => {
    const count = new Map<number, number>();
    for (const c of vcedControls) { const n = Number(c.key.slice(5)); count.set(n, (count.get(n) ?? 0) + 1); }
    const missing = [...Array(DX7_NAME_FIRST_BYTE).keys()].filter((n) => !count.has(n));
    const doubled = [...count].filter(([, k]) => k > 1).map(([n]) => n);
    const beyond = [...count.keys()].filter((n) => n >= DX7_NAME_FIRST_BYTE);
    expect({ missing, doubled, beyond }).toEqual({ missing: [], doubled: [], beyond: [] });
    expect(vcedControls).toHaveLength(145);
  });

  it('the voice name field covers the remaining ten bytes, so controls + name = 155', () => {
    expect(vcedControls.length + DX7_NAME_LENGTH).toBe(VCED_MAX.length);
    expect(DX7_NAME_FIRST_BYTE + DX7_NAME_LENGTH).toBe(155);
  });

  it('a control never offers a value the voice format cannot hold', () => {
    for (const c of vcedControls) {
      const max = VCED_MAX[Number(c.key.slice(5))];
      if (c.type === 'knob') expect([c.key, c.min, c.max]).toEqual([c.key, 0, max]);
      if (c.type === 'toggle') expect([c.key, max]).toEqual([c.key, 1]);
      if (c.type === 'select') expect([c.key, c.options.length]).toEqual([c.key, max + 1]);
    }
  });

  it('labels are words, not the front-panel abbreviations', () => {
    const labels = [...sections.map((s) => s.label), ...controls.map((c) => c.label), ...(DX7_LAYOUT.tabs ?? []).map((t) => t.label)];
    const abbreviated = labels.filter((l) => /\b(OP\d|R[1-4]|L[1-4]|PMD|AMD|PMS|XPOSE|BRK|SNS|FEEDBK|ALGO)\b/.test(l));
    expect(abbreviated).toEqual([]);
  });

  it('every section fits a 700 px editor column (no horizontal scrollbar)', () => {
    const column = 700 - 2 * 12 - 2 * 12; // editor padding and panel padding
    const wide = sections.map((s) => [s.label, sectionFlexBasis(s)] as const).filter(([, w]) => w > column);
    expect(wide).toEqual([]);
  });

  it('the break point reads as the key it is (39 is middle C, 0 is A-1, 99 is C8)', () => {
    expect([dx7BreakPointName(39), dx7BreakPointName(0), dx7BreakPointName(99)]).toEqual(['C3', 'A-1', 'C8']);
  });
});
