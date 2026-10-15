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
/** Knob labels are one line app-wide (.knob-label nowrap, upper case, spaced mono): about this many px per character. */
const LABEL_CHAR_PX = 6.8;

/** The width of a control's cell: a knob is 80 px, a longer label gets the room to read without running into its neighbour. */
export function knobCellWidth(label: string): number {
  return Math.max(KNOB_WIDTH, Math.ceil(label.length * LABEL_CHAR_PX) + 8);
}

export function sectionFlexBasis(section: SectionDescriptor): number {
  const knobWidths: number[] = [];
  let toggles = 0, selects = 0;
  for (const c of section.controls) {
    if (c.type === 'knob' || c.type === 'slider') knobWidths.push(knobCellWidth(c.label));
    else if (c.type === 'select') selects++;
    else toggles++;
  }
  // The widest row of up to three knobs, as the panel wraps them.
  let widestRow = 0;
  for (let i = 0; i < knobWidths.length; i += PER_ROW) {
    widestRow = Math.max(widestRow, knobWidths.slice(i, i + PER_ROW).reduce((a, b) => a + b, 0));
  }
  const content = Math.max(
    widestRow,
    Math.min(toggles, PER_ROW) * TOGGLE_WIDTH,
    selects > 0 ? SELECT_WIDTH : 0,
  );
  return content + SECTION_PADDING;
}
