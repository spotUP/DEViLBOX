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
const COL_GAP = 4;

// Mobile-scaled constants (1.6x for finger-friendly targets)
const MOBILE_SCALE     = 1.6;
const M_CHAR_WIDTH     = Math.round(CHAR_WIDTH * MOBILE_SCALE);
const M_LINE_NUM_W     = Math.round(LINE_NUMBER_WIDTH * MOBILE_SCALE);
const M_FONT_SIZE_PX   = Math.round(FONT_SIZE_PX * MOBILE_SCALE);
const M_FONT           = `${M_FONT_SIZE_PX}px "JetBrains Mono", "Fira Code", monospace`;
const M_COL_GAP        = Math.round(COL_GAP * MOBILE_SCALE);

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

// Effect type → display char (matches TrackerGLRenderer's EFFECT_CHARS)
const EFFECT_CHARS_2D: string[] = new Array(39);
for (let i = 0; i < 10; i++) EFFECT_CHARS_2D[i] = i.toString();
for (let i = 10; i < 36; i++) EFFECT_CHARS_2D[i] = String.fromCharCode(55 + i);
EFFECT_CHARS_2D[36] = 'Z';  // DUB_EFFECT_GLOBAL
EFFECT_CHARS_2D[37] = 'Z';  // DUB_EFFECT_PERCHANNEL
EFFECT_CHARS_2D[38] = 'Z';  // DUB_EFFECT_PARAM_STEP

// ─────────────────────────────────────────────────────────────────────────────

export class TrackerCanvas2DRenderer {
  private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width  = 800;
  height = 600;
  private dpr = 1;
  private readonly mobile: boolean;
  // Resolved constants based on mobile flag
  private readonly cw: number;
  private readonly lnw: number;
  private readonly font: string;
  private readonly colGap: number;

  constructor(canvas: OffscreenCanvas | HTMLCanvasElement, mobile = false) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[TrackerCanvas2DRenderer] Canvas2D not supported');
    this.ctx = ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    this.width  = canvas.width;
    this.height = canvas.height;
    this.mobile = mobile;
    this.cw     = mobile ? M_CHAR_WIDTH : CHAR_WIDTH;
    this.lnw    = mobile ? M_LINE_NUM_W : LINE_NUMBER_WIDTH;
    this.font   = mobile ? M_FONT : FONT;
    this.colGap = mobile ? M_COL_GAP : COL_GAP;
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

    const { ctx, dpr, cw, lnw, font, colGap } = this;
    const W = this.width;
    const H = this.height;
    // On mobile, enforce a larger minimum row height for finger-friendly targets
    const baseRowH = ui.rowHeight ?? ROW_HEIGHT;
    const rowH = this.mobile ? Math.max(Math.round(ROW_HEIGHT * MOBILE_SCALE), baseRowH) : baseRowH;
    const hiInterval = ui.rowHighlightInterval || 4;
    const hi2Interval = ui.rowSecondaryHighlightInterval || 0;
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

    // D (0xD = Pattern Break) and B (0xB = Position Jump) effects both cause
    // the pattern to end early — rows after either are unreachable.
    // Find the earliest occurrence across all channels.
    let dRow = -1;
    let breakRow = numRows; // first unreachable row index
    outer: for (let r = 0; r < numRows; r++) {
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        const cell = pattern.channels[ch]?.rows?.[r];
        if (!cell) continue;
        const isBreak = (e: number | undefined) => e === 0xD || e === 0xB;
        if (isBreak(cell.effTyp)  || isBreak(cell.effTyp2) ||
            isBreak(cell.effTyp3) || isBreak(cell.effTyp4) ||
            isBreak(cell.effTyp5) || isBreak(cell.effTyp6) ||
            isBreak(cell.effTyp7) || isBreak(cell.effTyp8)) {
          dRow = r;
          breakRow = r + 1; // rows AFTER the break row are unreachable
          break outer;
        }
      }
    }

    const { offsets: chanOffsets, widths: chanWidths } = layout;
    const numChan = pattern.channels.length;

    // Mute / solo dimming
    const anySolo = pattern.channels.some(ch => ch.solo);
    const MUTED_ALPHA = 0.3;

    // ── Row backgrounds ─────────────────────────────────────────────────────
    for (let r = startRow; r < endRow; r++) {
      const y = (r - scrollRow) * rowH;
      const isPast = r >= breakRow;

      if (isPlaying && r === playRow) {
        ctx.fillStyle = 'rgba(233,69,96,0.18)';
      } else if (selection &&
        r >= selection.startRow && r <= selection.endRow) {
        ctx.fillStyle = theme.selection;
      } else if (hi2Interval > 0 && r % hi2Interval === 0) {
        ctx.fillStyle = isPast ? theme.rowNormal : theme.rowSecondaryHighlight;
      } else if (r % hiInterval === 0) {
        ctx.fillStyle = isPast ? theme.rowNormal : theme.rowHighlight;
      } else {
        ctx.fillStyle = theme.rowNormal;
      }
      ctx.fillRect(0, y, W, rowH);

      // Hatching overlay for unreachable rows (past D00 break)
      if (isPast) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y, W, rowH);
      }

      // D row indicator — accent line at the bottom of the break row so
      // it's visible even when D00 is on the last row (nothing to dim below)
      if (r === dRow) {
        ctx.fillStyle = 'rgba(233,180,69,0.7)'; // amber
        ctx.fillRect(0, y + rowH - 2, W, 2);
      }
    }

    // ── Line number gutter ──────────────────────────────────────────────────
    ctx.font = font;
    for (let r = startRow; r < endRow; r++) {
      const y = (r - scrollRow) * rowH;
      const isPast = r >= breakRow;
      const isHi2 = !isPast && hi2Interval > 0 && r % hi2Interval === 0;
      const isHi = !isPast && r % hiInterval === 0;
      ctx.globalAlpha = isPast ? 0.3 : 1;
      ctx.fillStyle = (isHi2 || isHi) ? theme.lineNumberHighlight : theme.lineNumber;
      const label = ui.useHex
        ? r.toString(16).toUpperCase().padStart(3, '0')
        : r.toString().padStart(3, ' ');
      ctx.fillText(label, 2, y + rowH - Math.round(6 * (this.mobile ? MOBILE_SCALE : 1)));
    }
    ctx.globalAlpha = 1;

    // ── Bookmark indicators ──────────────────────────────────────────────────
    if (ui.bookmarks && ui.bookmarks.length > 0) {
      ctx.fillStyle = theme.bookmark || '#f59e0b';
      ctx.globalAlpha = 0.9;
      for (const bm of ui.bookmarks) {
        if (bm >= startRow && bm < endRow) {
          const y = (bm - scrollRow) * rowH;
          ctx.fillRect(0, y, 3, rowH);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Channel separator lines ─────────────────────────────────────────────
    ctx.strokeStyle = theme.trackerBorder || theme.border;
    ctx.lineWidth   = 1;
    for (let ch = 0; ch < numChan; ch++) {
      const x = lnw + (chanOffsets[ch] ?? 0);
      ctx.beginPath();
      ctx.moveTo(x - 0.5, 0);
      ctx.lineTo(x - 0.5, H);
      ctx.stroke();
    }

    // ── Cell text ───────────────────────────────────────────────────────────
    ctx.font = font;
    ctx.textBaseline = 'middle';

    for (let ch = 0; ch < numChan; ch++) {
      const chanX  = lnw + (chanOffsets[ch] ?? 0);
      const chan   = pattern.channels[ch];
      if (!chan) continue;

      // Muted / non-solo darkening overlay
      const isDimmed = chan.muted || (anySolo && !chan.solo);
      if (isDimmed) {
        const chW = chanWidths[ch] ?? cw * 9;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(chanX, 0, chW, H);
      }

      // Dim text alpha for muted/non-solo channels
      if (isDimmed) ctx.globalAlpha = MUTED_ALPHA;

      for (let r = startRow; r < endRow; r++) {
        // Unreachable rows (past D00 break) render at reduced alpha
        const isPastBreak = r >= breakRow;
        if (!isDimmed) ctx.globalAlpha = isPastBreak ? 0.25 : 1;
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
              str = isEmpty ? '---' : (table[val] ?? '???');
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
            px += col.charWidth * cw + colGap;
          }
        } else {
          // FIXED-COLUMN PATH (Note / Inst / Vol / Eff)
          // Render all note column groups
          const totalNoteCols = chan.noteCols ?? 1;
          const NOTE_COL_GROUP_W = cw * 3 + 4 + 4 + cw * 2 + 4 + cw * 2 + 4; // note+inst+vol+gaps
          for (let nc = 0; nc < totalNoteCols; nc++) {
            const ncX = chanX + 2 + nc * NOTE_COL_GROUP_W;
            const noteVal = nc === 0 ? (cell?.note ?? 0)
              : nc === 1 ? (cell?.note2 ?? 0)
              : nc === 2 ? (cell?.note3 ?? 0) : (cell?.note4 ?? 0);
            const noteText = noteStr(noteVal, displayOffset);
            ctx.fillStyle = isPlayRow ? theme.textNoteActive
              : noteVal === 0 ? theme.textMuted : theme.textNote;
            ctx.fillText(noteText, ncX, y);

            const inst = nc === 0 ? (cell?.instrument ?? 0)
              : nc === 1 ? (cell?.instrument2 ?? 0)
              : nc === 2 ? (cell?.instrument3 ?? 0) : (cell?.instrument4 ?? 0);
            ctx.fillStyle = isPlayRow ? '#ffffff' : inst === 0 ? theme.textMuted : theme.textInstrument;
            ctx.fillText(inst === 0 ? '··' : hex2(inst), ncX + cw * 3 + 2, y);

            const vol = nc === 0 ? (cell?.volume ?? 0)
              : nc === 1 ? (cell?.volume2 ?? 0)
              : nc === 2 ? (cell?.volume3 ?? 0) : (cell?.volume4 ?? 0);
            ctx.fillStyle = isPlayRow ? '#ffffff' : vol === 0 ? theme.textMuted : theme.textVolume;
            ctx.fillText(vol === 0 ? '··' : hex2(vol), ncX + cw * 5 + 4, y);
          }

          // Effects start after all note column groups
          const effBaseX = chanX + 2 + totalNoteCols * NOTE_COL_GROUP_W;
          const eff  = cell?.effTyp ?? 0;
          const effp = cell?.eff    ?? 0;
          ctx.fillStyle = isPlayRow ? '#ffffff' : eff === 0 && effp === 0 ? theme.textMuted : theme.textEffect;
          const effStr = eff === 0 && effp === 0 ? '···' : `${EFFECT_CHARS_2D[eff] ?? '?'}${hex2(effp)}`;
          ctx.fillText(effStr, effBaseX, y);
        }
      }

      // Restore alpha after muted channel or past-break rows
      ctx.globalAlpha = 1;
    }

    // ── Cursor rect ─────────────────────────────────────────────────────────
    const curY = (cursor.rowIndex - scrollRow) * rowH;
    if (curY >= -rowH && curY < H) {
      const ch = cursor.channelIndex;
      const curX = lnw + (chanOffsets[ch] ?? 0);
      // Clamp cursor width to canvas bounds (channel may be wider than viewport on mobile)
      const rawCurW = (chanWidths[ch] ?? cw * 9) - 2;
      const curW = Math.min(rawCurW, W - curX - 2);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth   = this.mobile ? 3 : 2;
      ctx.strokeRect(curX + 1, curY + 1, curW, rowH - 2);
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
