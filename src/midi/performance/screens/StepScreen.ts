/**
 * StepScreen — MK2 display for step sequencer mode.
 *
 * Left screen:  4-channel pattern dot grid (16 rows visible at a time)
 * Right screen: Selected step detail (note, velocity, instrument, fx)
 *
 * Activated by the Step button.
 * Pads 1-16 toggle steps in the current channel at the visible page.
 */

import { MK2Display } from '../MK2Display';
import type { MK2Screen, MK2ScreenContext } from './MK2ScreenManager';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number | null | undefined): string {
  if (note == null || note === 0) return '...';
  const name = NOTE_NAMES[note % 12];
  const oct = Math.floor(note / 12) - 1;
  return `${name}${oct}`;
}

export class StepScreen implements MK2Screen {

  render(left: MK2Display, right: MK2Display, ctx: MK2ScreenContext): void {
    this.renderPatternGrid(left, ctx);
    this.renderStepDetail(right, ctx);
  }

  softLabels(): string[] {
    return ['CH<', 'CH>', 'PG<', 'PG>', '', '', 'CLR', 'FILL'];
  }

  private renderPatternGrid(d: MK2Display, ctx: MK2ScreenContext): void {
    const { W, WHITE } = MK2Display;
    const state = useTrackerStore.getState();
    const pattern = state.patterns[state.currentPatternIndex];
    if (!pattern) return;

    const contentY = 10; // below soft labels
    const numCh = Math.min(pattern.channels.length, 8);
    const visibleCh = Math.min(numCh - ctx.stepCursorChannel, 4);
    const startCh = ctx.stepCursorChannel;

    // 16 rows visible, each row = 2px + 1px gap = 3px (fits 46/3 = 15 rows, use 2px rows)
    const rowH = 3;
    const visibleRows = Math.min(16, pattern.length);
    const startRow = Math.max(0, ctx.stepCursorRow - 8); // center cursor in view

    // Column width per channel
    const chW = Math.floor((W - 20) / visibleCh); // 20px for row numbers

    // Row numbers on the left
    for (let r = 0; r < visibleRows; r++) {
      const row = startRow + r;
      if (row >= pattern.length) break;
      const y = contentY + r * rowH;
      const rowStr = String(row).padStart(2, '0');
      d.text(0, y, rowStr, row % 4 === 0 ? WHITE : WHITE); // could dim non-beat rows
    }

    // Channel headers
    for (let c = 0; c < visibleCh; c++) {
      const x = 20 + c * chW;
      d.text(x + 2, contentY - 8, `C${startCh + c + 1}`, WHITE);
    }

    // Grid dots
    for (let r = 0; r < visibleRows; r++) {
      const row = startRow + r;
      if (row >= pattern.length) break;
      const y = contentY + r * rowH;

      for (let c = 0; c < visibleCh; c++) {
        const ch = pattern.channels[startCh + c];
        if (!ch) continue;
        const cell = ch.rows[row];
        const x = 20 + c * chW;

        if (cell?.note) {
          // Filled block for notes
          d.fillRect(x + 2, y, chW - 4, 2, WHITE);
        } else {
          // Dot for empty
          d.pixel(x + Math.floor(chW / 2), y + 1, WHITE);
        }
      }

      // Playhead indicator
      const currentRow = useTransportStore.getState().currentRow;
      if (row === currentRow) {
        d.text(W - 6, y, '>', WHITE);
      }
    }
  }

  private renderStepDetail(d: MK2Display, ctx: MK2ScreenContext): void {
    const { W, WHITE, BLACK } = MK2Display;
    const state = useTrackerStore.getState();
    const pattern = state.patterns[state.currentPatternIndex];
    if (!pattern) return;

    const ch = pattern.channels[ctx.stepCursorChannel];
    if (!ch) {
      d.text(4, 20, 'NO CHANNEL', WHITE);
      return;
    }

    // Header
    d.fillRect(0, 0, W, 10, WHITE);
    d.text(2, 2, `CH${ctx.stepCursorChannel + 1} ROW ${ctx.stepCursorRow}`, BLACK, WHITE);

    const cell = ch.rows[ctx.stepCursorRow];

    if (!cell || !cell.note) {
      d.text(4, 20, '--- EMPTY ---', WHITE);
      d.text(4, 34, 'Press pad to', WHITE);
      d.text(4, 44, 'place a note', WHITE);
      return;
    }

    // Note
    d.text(4, 14, 'Note', WHITE);
    d.text(100, 14, noteToString(cell.note), WHITE);

    // Velocity
    d.text(4, 24, 'Velocity', WHITE);
    const vel = cell.volume >= 0 ? cell.volume : 127;
    d.rect(100, 24, W - 104, 6, WHITE);
    const velFill = Math.round((vel / 127) * (W - 106));
    if (velFill > 0) d.fillRect(101, 25, velFill, 4, WHITE);
    d.text(4, 33, `${vel}`, WHITE);

    // Instrument
    d.text(4, 44, 'Instrument', WHITE);
    d.text(100, 44, `${cell.instrument ?? '-'}`, WHITE);

    // Effect
    if (cell.effect) {
      d.text(4, 54, 'Effect', WHITE);
      d.text(100, 54, `${cell.effect}`, WHITE);
    }
  }
}
