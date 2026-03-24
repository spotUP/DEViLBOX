/**
 * TrackerCanvas2DRenderer — Canvas2D fallback for environments where
 * OffscreenCanvas WebGL2 is unavailable (e.g. Safari < 17.4, Chrome with
 * hardware acceleration disabled).
 *
 * Implements the same render() / resize() interface as TrackerGLRenderer
 * so the worker can swap between them transparently.
 */

import type {
  PatternSnapshot,
  CursorSnapshot,
  SelectionSnapshot,
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
} from './worker-types';

const ROW_HEIGHT   = 24;
const CHAR_WIDTH   = 10;
const LINE_NUMBER_WIDTH = 40;
const FONT_SIZE_PX = 13;
const FONT = `${FONT_SIZE_PX}px "JetBrains Mono", "Fira Code", monospace`;

// ── Note name lookup ─────────────────────────────────────────────────────────

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const NOTE_CACHE = new Map<number, string[]>();

function buildNoteTable(displayOffset: number): string[] {
  const table = new Array<string>(256).fill('   ');
  for (let n = 1; n <= 96; n++) {
    const adjusted = n + displayOffset;
    const idx = ((adjusted - 1) % 12 + 12) % 12;
    const oct = Math.floor((adjusted - 1) / 12);
    table[n] = `${NOTE_NAMES[idx]}${oct}`;
  }
  table[97] = 'OFF';
  table[98] = 'FAD';
  NOTE_CACHE.set(displayOffset, table);
  return table;
}

function noteStr(n: number, displayOffset: number): string {
  const table = NOTE_CACHE.get(displayOffset) ?? buildNoteTable(displayOffset);
  return n === 0 ? '···' : (table[n] ?? '???');
}

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0'));
const HEX1: string[] = Array.from({ length: 16 }, (_, i) => i.toString(16).toUpperCase());

function hex2(v: number): string { return HEX[v & 0xff] ?? '00'; }

const COL_GAP = 4;

// ─────────────────────────────────────────────────────────────────────────────

export class TrackerCanvas2DRenderer {
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  width  = 800;
  height = 600;
  private dpr = 1;

  constructor(canvas: OffscreenCanvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[TrackerCanvas2DRenderer] Canvas2D not supported');
    this.ctx = ctx;
    this.width  = canvas.width;
    this.height = canvas.height;
  }

  resize(w: number, h: number, dpr: number): void {
    this.width  = w;
    this.height = h;
    this.dpr    = dpr;
    this.ctx.canvas.width  = Math.round(w * dpr);
    this.ctx.canvas.height = Math.round(h * dpr);
  }

  render(opts: {
    patterns: PatternSnapshot[];
    currentPatternIndex: number;
    scrollX: number;
    cursor: CursorSnapshot;
    selection: SelectionSnapshot | null;
    playback: { row: number; smoothOffset: number; patternIndex: number; isPlaying: boolean };
    theme: ThemeSnapshot;
    ui: UIStateSnapshot;
    layout: ChannelLayoutSnapshot;
    dragOver: { channelIndex: number; rowIndex: number } | null;
  }): void {
    const {
      patterns, currentPatternIndex, cursor, selection,
      playback, theme, ui, layout,
    } = opts;

    const { isPlaying, row: playRow, patternIndex: playPatIdx } = playback;
    const activePatIdx = isPlaying ? playPatIdx : currentPatternIndex;
    const pattern = patterns[activePatIdx];

    const { ctx, dpr } = this;
    const W = this.width;
    const H = this.height;
    const rowH = ui.rowHeight ?? ROW_HEIGHT;
    const hiInterval = ui.rowHighlightInterval || 4;
    const displayOffset = ui.noteDisplayOffset ?? 0;

    if (H < 48 || W < 48) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    if (!pattern) {
      ctx.restore();
      return;
    }

    const numRows = pattern.length;
    const visibleRows = Math.ceil(H / rowH) + 2;

    // Scroll so cursor/playback row is centered
    const centerRow = isPlaying ? playRow : cursor.rowIndex;
    const halfVisible = Math.floor(H / rowH / 2);
    const scrollRow = Math.max(0, Math.min(centerRow - halfVisible, numRows - 1));
    const startRow = Math.max(0, scrollRow);
    const endRow   = Math.min(numRows, startRow + visibleRows);

    const { offsets: chanOffsets, widths: chanWidths } = layout;
    const numChan = pattern.channels.length;

    // Mute / solo dimming
    const anySolo = pattern.channels.some(ch => ch.solo);
    const MUTED_ALPHA = 0.3;

    // ── Row backgrounds ─────────────────────────────────────────────────────
    for (let r = startRow; r < endRow; r++) {
      const y = (r - scrollRow) * rowH;

      if (isPlaying && r === playRow) {
        ctx.fillStyle = 'rgba(233,69,96,0.18)';
      } else if (selection &&
        r >= selection.startRow && r <= selection.endRow) {
        ctx.fillStyle = theme.selection;
      } else if (r % hiInterval === 0) {
        ctx.fillStyle = theme.rowHighlight;
      } else {
        ctx.fillStyle = theme.rowNormal;
      }
      ctx.fillRect(0, y, W, rowH);
    }

    // ── Line number gutter ──────────────────────────────────────────────────
    ctx.font = FONT;
    for (let r = startRow; r < endRow; r++) {
      const y = (r - scrollRow) * rowH;
      const isHi = r % hiInterval === 0;
      ctx.fillStyle = isHi ? theme.lineNumberHighlight : theme.lineNumber;
      const label = ui.useHex
        ? r.toString(16).toUpperCase().padStart(3, '0')
        : r.toString().padStart(3, ' ');
      ctx.fillText(label, 2, y + rowH - 6);
    }

    // ── Channel separator lines ─────────────────────────────────────────────
    ctx.strokeStyle = theme.border;
    ctx.lineWidth   = 1;
    for (let ch = 0; ch < numChan; ch++) {
      const x = LINE_NUMBER_WIDTH + (chanOffsets[ch] ?? 0);
      ctx.beginPath();
      ctx.moveTo(x - 0.5, 0);
      ctx.lineTo(x - 0.5, H);
      ctx.stroke();
    }

    // ── Cell text ───────────────────────────────────────────────────────────
    ctx.font = FONT;
    ctx.textBaseline = 'middle';

    for (let ch = 0; ch < numChan; ch++) {
      const chanX  = LINE_NUMBER_WIDTH + (chanOffsets[ch] ?? 0);
      const chan   = pattern.channels[ch];
      if (!chan) continue;

      // Muted / non-solo darkening overlay
      const isDimmed = chan.muted || (anySolo && !chan.solo);
      if (isDimmed) {
        const chW = chanWidths[ch] ?? CHAR_WIDTH * 9;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(chanX, 0, chW, H);
      }

      // Dim text alpha for muted/non-solo channels
      if (isDimmed) ctx.globalAlpha = MUTED_ALPHA;

      for (let r = startRow; r < endRow; r++) {
        const y   = (r - scrollRow) * rowH + rowH / 2;
        const cell = chan.rows[r];
        const isPlayRow = isPlaying && r === playRow;

        if (ui.columns && cell?.params) {
          // DATA-DRIVEN PATH — renders custom format columns
          const chColumns = chan.columnSpecs ?? ui.columns;
          let px = chanX + 2;
          for (let ci = 0; ci < chColumns.length; ci++) {
            const col = chColumns[ci];
            const val = cell.params[ci] ?? col.emptyValue;
            const isEmpty = val === col.emptyValue;
            let str: string;
            if (col.type === 'note') {
              const table = NOTE_CACHE.get(displayOffset) ?? buildNoteTable(displayOffset);
              str = val === 0 ? '···' : (table[val] ?? '???');
            } else {
              switch (col.hexDigits) {
                case 1:  str = isEmpty ? '·' : (HEX1[val & 0xF] ?? '0'); break;
                case 2:  str = isEmpty ? '··' : hex2(val); break;
                case 3:  str = isEmpty ? '···' : (val & 0xFFF).toString(16).toUpperCase().padStart(3, '0'); break;
                default: str = isEmpty ? '····' : (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); break;
              }
            }
            if (isPlayRow) {
              ctx.fillStyle = '#ffffff';
            } else if (isEmpty) {
              const [r, g, b, a] = col.emptyColor;
              ctx.fillStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`;
            } else {
              const [r, g, b, a] = col.color;
              ctx.fillStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`;
            }
            ctx.fillText(str, px, y);
            px += col.charWidth * CHAR_WIDTH + COL_GAP;
          }
        } else {
          // FIXED-COLUMN PATH (Note / Inst / Vol / Eff)
          const noteVal = cell?.note ?? 0;
          const noteText = noteStr(noteVal, displayOffset);
          ctx.fillStyle = isPlayRow ? theme.textNoteActive
            : noteVal === 0         ? theme.textMuted
            :                         theme.textNote;
          ctx.fillText(noteText, chanX + 2, y);

          const inst = cell?.instrument ?? 0;
          ctx.fillStyle = isPlayRow ? '#ffffff' : inst === 0 ? theme.textMuted : theme.textInstrument;
          ctx.fillText(inst === 0 ? '··' : hex2(inst), chanX + 2 + CHAR_WIDTH * 3 + 2, y);

          const vol = cell?.volume ?? 0;
          ctx.fillStyle = isPlayRow ? '#ffffff' : vol === 0 ? theme.textMuted : theme.textVolume;
          ctx.fillText(vol === 0 ? '··' : hex2(vol), chanX + 2 + CHAR_WIDTH * 5 + 4, y);

          const eff  = cell?.effTyp ?? 0;
          const effp = cell?.eff    ?? 0;
          ctx.fillStyle = isPlayRow ? '#ffffff' : eff === 0 && effp === 0 ? theme.textMuted : theme.textEffect;
          const effStr = eff === 0 && effp === 0 ? '···' : `${hex2(eff)[1]}${hex2(effp)}`;
          ctx.fillText(effStr, chanX + 2 + CHAR_WIDTH * 7 + 6, y);
        }
      }

      // Restore alpha after muted channel
      if (isDimmed) ctx.globalAlpha = 1;
    }

    // ── Cursor rect ─────────────────────────────────────────────────────────
    const curY = (cursor.rowIndex - scrollRow) * rowH;
    if (curY >= -rowH && curY < H) {
      const ch = cursor.channelIndex;
      const curX = LINE_NUMBER_WIDTH + (chanOffsets[ch] ?? 0);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth   = 2;
      ctx.strokeRect(curX + 1, curY + 1, (chanWidths[ch] ?? CHAR_WIDTH * 9) - 2, rowH - 2);
    }

    // ── Center line ─────────────────────────────────────────────────────────
    const centerY = Math.floor(H / 2);
    ctx.strokeStyle = theme.accentGlow;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(W, centerY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  dispose(): void {
    // Nothing to clean up for Canvas2D
  }
}
