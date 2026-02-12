/**
 * HitTester - Spatial index for click/hover detection on piano roll notes
 *
 * Maintains note bounding rects in draw order (preserving z-ordering).
 * Linear scan is fine for <1000 notes. Also detects resize handles
 * (within HANDLE_WIDTH of left/right edge).
 */

import { Viewport } from './Viewport';
import type { PianoRollNote } from '../../../types/pianoRoll';

/** Width of the resize handle zone at note edges (pixels) */
const HANDLE_WIDTH = 8;

export type HitZone = 'body' | 'resize-start' | 'resize-end' | 'none';

export interface HitResult {
  note: PianoRollNote;
  zone: HitZone;
}

interface NoteRect {
  note: PianoRollNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class HitTester {
  private rects: NoteRect[] = [];

  /**
   * Rebuild the spatial index from notes and current viewport.
   * Preserves original array order (= draw order = z-order).
   * Call when notes or viewport changes.
   */
  rebuild(notes: PianoRollNote[], vp: Viewport): void {
    this.rects = notes.map(note => ({
      note,
      x: vp.rowToPixelX(note.startRow),
      y: vp.noteToPixelY(note.midiNote),
      w: (note.endRow - note.startRow) * vp.horizontalZoom,
      h: vp.verticalZoom - 1,
    }));
    // No sort — preserve draw order so "last match wins" = topmost note
  }

  /**
   * Test a point (in canvas CSS coordinates) against all notes.
   * Returns the topmost hit (last in draw order = highest z).
   */
  hitTest(px: number, py: number): HitResult | null {
    let best: HitResult | null = null;

    for (const r of this.rects) {
      // X bounds check
      if (px < r.x || px > r.x + r.w) continue;

      // Y bounds check
      if (py < r.y || py > r.y + r.h) continue;

      // Determine zone
      const relX = px - r.x;
      let zone: HitZone = 'body';
      if (relX <= HANDLE_WIDTH && r.w > HANDLE_WIDTH * 2) {
        zone = 'resize-start';
      } else if (relX >= r.w - HANDLE_WIDTH) {
        zone = 'resize-end';
      }

      // Last match wins (later in draw order = on top)
      best = { note: r.note, zone };
    }

    return best;
  }

  /**
   * Find all notes within a rectangular selection box (in canvas CSS coordinates).
   */
  findInRect(x1: number, y1: number, x2: number, y2: number): PianoRollNote[] {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);

    const result: PianoRollNote[] = [];
    for (const r of this.rects) {
      // Overlap test
      if (r.x + r.w < left || r.x > right) continue;
      if (r.y + r.h < top || r.y > bottom) continue;
      result.push(r.note);
    }
    return result;
  }

  /**
   * Get the cursor style for a given position.
   */
  getCursor(px: number, py: number, tool: string): string {
    if (tool === 'draw') return 'crosshair';
    if (tool === 'erase') return 'not-allowed';

    const hit = this.hitTest(px, py);
    if (!hit) return 'default';

    switch (hit.zone) {
      case 'resize-start':
      case 'resize-end':
        return 'ew-resize';
      case 'body':
        return 'move';
      default:
        return 'default';
    }
  }
}
