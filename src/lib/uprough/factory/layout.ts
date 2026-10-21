/**
 * Factory slot-grid layout (R2f). The whole factory must fit the fullscreen dialog with no scrolling, so the slot grid
 * is sized from the room it has: the column count follows the width (the draft's 270 px columns where they fit), and
 * each slot's waveform takes whatever height is left in its row after the card's fixed parts, clamped to the draft's 170 px.
 */

/** Draft column width (D:69) and the narrowest column the layout falls back to. */
export const COLUMN_WIDTH = 270;
const FALLBACK_WIDTHS = [270, 230, 200, 170, 140] as const;
/** Gap between slot cards in CSS pixels. */
export const SLOT_GAP = 12;
/** Height of a slot card apart from its waveform: padding, heading, caption, chip row and the gaps between them. */
export const SLOT_CHROME = 104;
export const WAVE_MIN = 28;
export const WAVE_MAX = 170;
/** A wave this tall is comfortable; the layout adds columns (narrower cards) only until it reaches it. */
const WAVE_COMFORT = 56;

export interface SlotGrid { cols: number; rows: number; wave: number }

/** Columns, rows and waveform height for `count` slots in a `width` by `height` area. */
export function slotGrid(width: number, height: number, count: number): SlotGrid {
  let best: SlotGrid = { cols: 1, rows: Math.max(1, count), wave: WAVE_MIN };
  for (const colMin of FALLBACK_WIDTHS) {
    const cols = Math.max(1, Math.min(Math.max(1, count), Math.floor((width + SLOT_GAP) / (colMin + SLOT_GAP))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const slotH = (height - SLOT_GAP * (rows - 1)) / rows;
    const wave = Math.round(Math.min(WAVE_MAX, Math.max(WAVE_MIN, slotH - SLOT_CHROME)));
    best = { cols, rows, wave };
    if (slotH - SLOT_CHROME >= WAVE_COMFORT) break;
  }
  return best;
}
