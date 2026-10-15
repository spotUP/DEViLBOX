import { describe, it, expect } from 'vitest';
import { knobCellWidth, sectionFlexBasis, SECTION_PADDING } from '../synthPanelSizing';
import { KLYSTRACK_LAYOUT } from '@/constants/synthLayouts/klystrack';
import type { SectionDescriptor } from '@/types/synthPanel';

const toggle = (key: string) => ({ type: 'toggle' as const, key, label: key });
const select = (key: string) => ({ type: 'select' as const, key, label: key, options: [] });
const knob = (key: string) => ({ type: 'knob' as const, key, label: key });

describe('synth panel section width', () => {
  it('a section of toggles and selects only is not squeezed to its padding', () => {
    const toggles: SectionDescriptor = { label: 'T', controls: [toggle('a'), toggle('b')] };
    const selects: SectionDescriptor = { label: 'S', controls: [select('a')] };
    expect(sectionFlexBasis(toggles)).toBeGreaterThan(SECTION_PADDING + 100);
    expect(sectionFlexBasis(selects)).toBeGreaterThan(SECTION_PADDING + 100);
  });

  it('knob sections keep three to a row', () => {
    const four: SectionDescriptor = { label: 'K', controls: [knob('a'), knob('b'), knob('c'), knob('d')] };
    expect(sectionFlexBasis(four)).toBe(3 * 80 + SECTION_PADDING);
  });

  it('every klystrack section asks for room for what it holds', () => {
    for (const section of KLYSTRACK_LAYOUT.sections ?? []) {
      expect(sectionFlexBasis(section), section.label).toBeGreaterThanOrEqual(SECTION_PADDING + 80);
    }
  });

  it('a long knob label gets a cell wide enough that it cannot run into the next knob', () => {
    expect(knobCellWidth('Cutoff')).toBe(80);
    expect(knobCellWidth('Modulator Envelope Start')).toBeGreaterThan(24 * 6);
    const wide: SectionDescriptor = { label: 'W', controls: [knob('Modulator Multiplier'), knob('Modulator Attack'), knob('Modulator Decay')] };
    expect(sectionFlexBasis(wide)).toBeGreaterThan(3 * 80 + SECTION_PADDING);
  });
});
