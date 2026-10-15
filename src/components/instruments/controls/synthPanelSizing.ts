/**
 * The width a DOMSynthPanel section asks for, from what it holds: knobs and sliders up to three to a row, toggles
 * up to three to a row, and a select (its own row) wide enough to read an option. A section of toggles and selects
 * only used to ask for the padding alone and was squeezed to a sliver.
 */
import type { SectionDescriptor } from '@/types/synthPanel';

export const KNOB_WIDTH = 80;
export const TOGGLE_WIDTH = 72;
export const SELECT_WIDTH = 168;
export const SECTION_PADDING = 32;
const PER_ROW = 3;

export function sectionFlexBasis(section: SectionDescriptor): number {
  let knobs = 0, toggles = 0, selects = 0;
  for (const c of section.controls) {
    if (c.type === 'knob' || c.type === 'slider') knobs++;
    else if (c.type === 'select') selects++;
    else toggles++;
  }
  const content = Math.max(
    Math.min(knobs, PER_ROW) * KNOB_WIDTH,
    Math.min(toggles, PER_ROW) * TOGGLE_WIDTH,
    selects > 0 ? SELECT_WIDTH : 0,
  );
  return content + SECTION_PADDING;
}
