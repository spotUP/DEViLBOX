/**
 * NoteRenderer - Draws piano roll notes to canvas
 *
 * Each note is a filled rectangle with optional decorators:
 * - Selection highlight (white border)
 * - Velocity bar overlay
 * - TB-303/TT-303 indicators: slide, accent, hammer, mute
 * - Note name label when zoomed in
 * - Visible resize handle indicator (yellow line)
 * - Ghost note rendering (dashed, transparent)
 */

import { Viewport } from './Viewport';
import type { PianoRollNote } from '../../../types/pianoRoll';

/** Instrument colors - expanded palette for better differentiation */
const INSTRUMENT_COLORS = [
  '#06b6d4', // cyan - inst 0
  '#a855f7', // purple - inst 1
  '#22c55e', // green - inst 2
  '#f59e0b', // amber - inst 3
  '#ec4899', // pink - inst 4
  '#3b82f6', // blue - inst 5
  '#ef4444', // red - inst 6
  '#14b8a6', // teal - inst 7
  '#f97316', // orange - inst 8
  '#8b5cf6', // violet - inst 9
  '#10b981', // emerald - inst 10
  '#eab308', // yellow - inst 11
  '#d946ef', // fuchsia - inst 12
  '#0ea5e9', // sky - inst 13
  '#fb923c', // orange-400 - inst 14
  '#84cc16', // lime - inst 15
];

const DEFAULT_COLOR = '#64748b'; // gray for null instrument

const NOTE_RADIUS = 5;
const NOTE_V_PADDING = 3; // vertical padding within lane
const RESIZE_HANDLE_COLOR = 'rgba(255,245,157,0.85)';

export interface NoteRenderColors {
  selectionRing: string;
  ghostBorder: string;
  slideIndicator: string;
  accentIndicator: string;
  hammerIndicator: string;
  muteIndicator: string;
  playhead: string;
  playheadGlow: string;
  selectionBox: string;
  selectionBoxFill: string;
}

export const DEFAULT_NOTE_COLORS: NoteRenderColors = {
  selectionRing: '#ffffff',
  ghostBorder: 'rgba(255,255,255,0.5)',
  slideIndicator: 'rgba(250,204,21,0.7)',     // Yellow
  accentIndicator: 'rgba(255,100,0,0.85)',    // Orange
  hammerIndicator: 'rgba(168,85,247,0.7)',    // Purple
  muteIndicator: 'rgba(107,114,128,0.7)',     // Gray
  playhead: '#ef4444',
  playheadGlow: 'rgba(239,68,68,0.12)',
  selectionBox: '#60a5fa',
  selectionBoxFill: 'rgba(59,130,246,0.12)',
};

export class NoteRenderer {
  colors: NoteRenderColors = { ...DEFAULT_NOTE_COLORS };

  /**
   * Draw all notes to the given context.
   * Supports repeating pattern visualization by rendering notes at pattern boundaries.
   */
  render(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    notes: PianoRollNote[],
    selectedNoteIds: Set<string>,
    showVelocity: boolean,
    ghostNotes: PianoRollNote[],
    patternLength?: number,
  ): void {
    const range = vp.getVisibleRange();

    // If patternLength provided, calculate how many pattern repeats to show
    const patternRepeats: number[] = [0]; // Always show at offset 0
    if (patternLength && patternLength > 0) {
      // Calculate which pattern repeats are visible
      const firstRepeat = Math.floor(range.startRow / patternLength);
      const lastRepeat = Math.ceil(range.endRow / patternLength);
      
      patternRepeats.length = 0;
      for (let i = firstRepeat; i <= lastRepeat; i++) {
        patternRepeats.push(i * patternLength);
      }
    }

    // Draw ghost notes first (under real notes)
    for (const offset of patternRepeats) {
      for (const note of ghostNotes) {
        this.drawGhostNoteWithOffset(ctx, vp, note, offset, range);
      }
    }

    // Draw real notes at all visible pattern offsets
    for (const offset of patternRepeats) {
      for (const note of notes) {
        const offsetNote = {
          ...note,
          startRow: note.startRow + offset,
          endRow: note.endRow + offset,
        };
        
        // Skip off-screen notes
        if (offsetNote.endRow < range.startRow || offsetNote.startRow > range.endRow) continue;
        if (offsetNote.midiNote < range.startNote || offsetNote.midiNote > range.endNote) continue;

        const isSelected = selectedNoteIds.has(note.id);
        this.drawNote(ctx, vp, offsetNote, isSelected, showVelocity);
      }
    }
  }

  /**
   * Draw a ghost note with pattern offset.
   */
  private drawGhostNoteWithOffset(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    note: PianoRollNote,
    offset: number,
    range: { startRow: number; endRow: number; startNote: number; endNote: number },
  ): void {
    const offsetNote = {
      ...note,
      startRow: note.startRow + offset,
      endRow: note.endRow + offset,
    };
    
    if (offsetNote.endRow < range.startRow || offsetNote.startRow > range.endRow) return;
    if (offsetNote.midiNote < range.startNote || offsetNote.midiNote > range.endNote) return;
    
    this.drawGhostNote(ctx, vp, offsetNote);
  }

  /**
   * Draw a single note rectangle with decorators.
   */
  private drawNote(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    note: PianoRollNote,
    isSelected: boolean,
    showVelocity: boolean,
  ): void {
    const x = vp.rowToPixelX(note.startRow);
    const w = (note.endRow - note.startRow) * vp.horizontalZoom;
    const rawY = vp.noteToPixelY(note.midiNote);
    const y = rawY + NOTE_V_PADDING;
    const h = vp.verticalZoom - NOTE_V_PADDING * 2 - 1; // breathing room

    const noteW = Math.max(4, w - 1); // Minimum visible width, small gap
    const color = note.instrument !== null
      ? INSTRUMENT_COLORS[note.instrument % INSTRUMENT_COLORS.length]
      : DEFAULT_COLOR;

    // Base opacity varies with velocity (squared curve for perceptual brightness)
    const velNorm = note.velocity / 127;
    const alpha = 0.33 + 0.67 * velNorm * velNorm;

    // Note body
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isSelected ? this.brighten(color) : color;
    this.roundRect(ctx, x, y, noteW, h, NOTE_RADIUS);
    ctx.fill();

    // Selection ring (white border) or subtle dark border
    if (isSelected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.colors.selectionRing;
      ctx.lineWidth = 2.5;
      this.roundRect(ctx, x, y, noteW, h, NOTE_RADIUS);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      this.roundRect(ctx, x, y, noteW, h, NOTE_RADIUS);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Velocity bar overlay (dark bar from bottom showing inverse velocity)
    if (showVelocity && noteW > 16) {
      const velFraction = 1 - note.velocity / 127;
      const barH = h * velFraction;
      if (barH > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y, noteW, barH);
      }
    }

    // TB-303 / TT-303 indicators
    this.drawIndicators(ctx, x, y, noteW, h, note);

    // Note name label when zoomed in enough
    if (noteW > 16 && vp.verticalZoom >= 10) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `${Math.min(10, vp.verticalZoom - 3)}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const name = this.getNoteName(note.midiNote);
      ctx.fillText(name, x + 3, y + h / 2);
    }

    // Resize handle indicator (visible yellow line at right edge)
    if (noteW > 14) {
      ctx.fillStyle = RESIZE_HANDLE_COLOR;
      ctx.fillRect(x + noteW - 2, y + 3, 1, h - 6);
    }
  }

  /**
   * Draw TB-303/TT-303 indicators on a note.
   */
  private drawIndicators(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    note: PianoRollNote,
  ): void {
    // Slide: yellow bar on right side
    if (note.slide) {
      ctx.fillStyle = this.colors.slideIndicator;
      ctx.fillRect(x + w - 4, y, 3, h);
    }

    // Accent: orange triangle in top-left corner
    if (note.accent) {
      ctx.fillStyle = this.colors.accentIndicator;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.closePath();
      ctx.fill();
    }

    // Hammer: purple diamond on left side (offset right if accent is also present)
    if (note.hammer) {
      const cx = x + (note.accent ? 12 : 5);
      const cy = y + h / 2;
      const sz = Math.min(4, h / 3);
      ctx.fillStyle = this.colors.hammerIndicator;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sz);
      ctx.lineTo(cx + sz, cy);
      ctx.lineTo(cx, cy + sz);
      ctx.lineTo(cx - sz, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Mute: gray cross-hatch pattern (striped overlay)
    if (note.mute) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = this.colors.muteIndicator;
      ctx.fillRect(x, y, w, h);
      // Diagonal stripes
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let sx = x - h; sx < x + w; sx += 6) {
        ctx.moveTo(sx, y + h);
        ctx.lineTo(sx + h, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw a ghost note (drag preview).
   */
  private drawGhostNote(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    note: PianoRollNote,
  ): void {
    const x = vp.rowToPixelX(note.startRow);
    const w = (note.endRow - note.startRow) * vp.horizontalZoom;
    const rawY = vp.noteToPixelY(note.midiNote);
    const y = rawY + NOTE_V_PADDING;
    const h = vp.verticalZoom - NOTE_V_PADDING * 2 - 1;
    const noteW = Math.max(4, w - 1);
    const color = note.instrument !== null
      ? INSTRUMENT_COLORS[note.instrument % INSTRUMENT_COLORS.length]
      : DEFAULT_COLOR;

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = color;
    this.roundRect(ctx, x, y, noteW, h, NOTE_RADIUS);
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = this.colors.ghostBorder;
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, noteW, h, NOTE_RADIUS);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /**
   * Draw playhead line with glow.
   */
  drawPlayhead(ctx: CanvasRenderingContext2D, vp: Viewport, row: number): void {
    const x = vp.rowToPixelX(row);
    if (x < -3 || x > vp.width + 3) return;

    // Subtle glow
    ctx.fillStyle = this.colors.playheadGlow;
    ctx.fillRect(x - 2, 0, 7, vp.height);

    // Main line
    ctx.fillStyle = this.colors.playhead;
    ctx.fillRect(x, 0, 3, vp.height);
  }

  /**
   * Draw selection box rectangle.
   */
  drawSelectionBox(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
  ): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    ctx.fillStyle = this.colors.selectionBoxFill;
    ctx.fillRect(left, top, w, h);
    ctx.strokeStyle = this.colors.selectionBox;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, w, h); // +0.5 for crisp 1px line
  }

  // ---- Helpers ----

  private brighten(hex: string): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 40);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 40);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 40);
    return `rgb(${r},${g},${b})`;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number,
    r: number,
  ): void {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private getNoteName(midiNote: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    return `${names[midiNote % 12]}${octave}`;
  }
}
