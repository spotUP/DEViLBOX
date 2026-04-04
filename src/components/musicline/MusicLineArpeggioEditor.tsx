/**
 * MusicLineArpeggioEditor -- Arpeggio table editor matching original Mline116.asm behavior.
 *
 * Cursor system: 9 positions (nibble-level editing), matching ArpOffset/ArpShift from ASM:
 *   Col 0: Note        (keyboard note entry, NOT hex)
 *   Col 1: WaveSample  high nibble (hex)
 *   Col 2: WaveSample  low nibble  (hex)
 *   Col 3: FX1 number  high nibble (hex)
 *   Col 4: FX1 param   high nibble (hex)
 *   Col 5: FX1 param   low nibble  (hex)
 *   Col 6: FX2 number  high nibble (hex)
 *   Col 7: FX2 param   high nibble (hex)
 *   Col 8: FX2 param   low nibble  (hex)
 *
 * Row format (6 bytes each):
 *   field 0: Note     — 0=wait, 1-60=note, 61=end, 62=restart, bit7=relative transpose
 *   field 1: WaveSample
 *   field 2: Effect1Num   (0=noop, 1=pitch up, 2=pitch down, 3=set vol, 4=vol up, 5=vol down, 6=restart)
 *   field 3: Effect1Param
 *   field 4: Effect2Num
 *   field 5: Effect2Param
 *
 * Edit modes (matching _ArpEdMode):
 *   0 = Vertical   (cursor advances DOWN after entry)
 *   1 = Horizontal (cursor advances RIGHT after entry)
 *
 * Special keys:
 *   Delete    — clear current field/cell
 *   Backspace — delete entire row, shift remaining rows up
 *   Return    — insert empty row at cursor, shift remaining down
 *
 * Block operations:
 *   Shift+Arrow/Click — mark block selection range
 *   Ctrl+C / Cmd+C   — copy marked block
 *   Ctrl+X / Cmd+X   — cut marked block (copy + clear)
 *   Ctrl+V / Cmd+V   — paste at cursor position
 *   Ctrl+A / Cmd+A   — select all rows
 *   Escape           — clear mark/selection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import type { MusicLineArpEntry } from '@/engine/musicline/MusicLineEngine';

// ── Block clipboard type ──────────────────────────────────────────────────────

interface ArpBlockClipboard {
  rows: MusicLineArpEntry[];
}

// Module-level clipboard so it persists across table changes and re-renders
let arpClipboard: ArpBlockClipboard | null = null;

// ── Constants ──────────────────────────────────────────────────────────────────

const VISIBLE_ROWS = 12;
const MAX_ROWS = 128;
const ROW_HEIGHT = 20;
const GRID_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
const NUM_CURSOR_COLS = 9;

const ML_NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Byte offset within 6-byte row for each cursor column (matches ArpOffset from ASM) */
const ARP_OFFSET = [0, 1, 1, 2, 3, 3, 4, 5, 5];

/** 1 = edit high nibble, 0 = edit low nibble (matches ArpShift from ASM) */
const ARP_SHIFT = [0, 1, 0, 0, 1, 0, 0, 1, 0];

/** Field keys matching MusicLineArpEntry for each byte offset */
const FIELD_KEYS: (keyof MusicLineArpEntry)[] = ['note', 'smpl', 'fx1', 'param1', 'fx2', 'param2'];

/** Colors for each visual group */
const COL_COLORS = [
  '#60e060', // 0: note
  '#e0c040', // 1: ws hi
  '#e0c040', // 2: ws lo
  '#60a0e0', // 3: fx1 num
  '#6080c0', // 4: fx1 param hi
  '#6080c0', // 5: fx1 param lo
  '#c060e0', // 6: fx2 num
  '#a060c0', // 7: fx2 param hi
  '#a060c0', // 8: fx2 param lo
];

/** Column widths in px */
const COL_WIDTHS = [36, 12, 12, 12, 12, 12, 12, 12, 12];

const ROW_NUM_WIDTH = 28;
// Gaps between groups: note | ws | fpp | fpp
const GROUP_GAP = 6;
const TOTAL_WIDTH = ROW_NUM_WIDTH + COL_WIDTHS.reduce((s, w) => s + w, 0) + GROUP_GAP * 3;

const SUB_FX_NAMES: Record<number, string> = {
  0: '---',
  1: 'Pitch Up',
  2: 'Pitch Dn',
  3: 'Set Vol',
  4: 'Vol Up',
  5: 'Vol Dn',
  6: 'Restart',
};

// FT2-style QWERTY-to-note mapping (same as inputConstants.ts NOTE_MAP)
const QWERTY_NOTE_MAP: Record<string, { semitone: number; octaveOffset: number }> = {
  // Bottom row (lower octave): C=0, C#=1, D=2, ...
  z: { semitone: 0, octaveOffset: 0 },
  s: { semitone: 1, octaveOffset: 0 },
  x: { semitone: 2, octaveOffset: 0 },
  d: { semitone: 3, octaveOffset: 0 },
  c: { semitone: 4, octaveOffset: 0 },
  v: { semitone: 5, octaveOffset: 0 },
  g: { semitone: 6, octaveOffset: 0 },
  b: { semitone: 7, octaveOffset: 0 },
  h: { semitone: 8, octaveOffset: 0 },
  n: { semitone: 9, octaveOffset: 0 },
  j: { semitone: 10, octaveOffset: 0 },
  m: { semitone: 11, octaveOffset: 0 },
  ',': { semitone: 0, octaveOffset: 1 },
  // Top row (higher octave)
  q: { semitone: 0, octaveOffset: 1 },
  '2': { semitone: 1, octaveOffset: 1 },
  w: { semitone: 2, octaveOffset: 1 },
  '3': { semitone: 3, octaveOffset: 1 },
  e: { semitone: 4, octaveOffset: 1 },
  r: { semitone: 5, octaveOffset: 1 },
  '5': { semitone: 6, octaveOffset: 1 },
  t: { semitone: 7, octaveOffset: 1 },
  '6': { semitone: 8, octaveOffset: 1 },
  y: { semitone: 9, octaveOffset: 1 },
  '7': { semitone: 10, octaveOffset: 1 },
  u: { semitone: 11, octaveOffset: 1 },
  i: { semitone: 0, octaveOffset: 2 },
  '9': { semitone: 1, octaveOffset: 2 },
  o: { semitone: 2, octaveOffset: 2 },
  '0': { semitone: 3, octaveOffset: 2 },
  p: { semitone: 4, octaveOffset: 2 },
};

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatNote(value: number): string {
  if (value === 0) return '---';
  if (value === 61) return 'END';
  if (value === 62) return 'RST';
  const rel = value & 0x80;
  const raw = value & 0x7f;
  if (raw >= 1 && raw <= 60) {
    const n = (raw - 1) % 12;
    const o = Math.floor((raw - 1) / 12) + 1;
    const name = `${ML_NOTES[n]}${o}`;
    return rel ? `~${name.slice(0, 2)}${o}` : name;
  }
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function formatHexNibble(value: number): string {
  return value.toString(16).toUpperCase();
}

/** Format a row for display: returns 9 strings for each cursor column */
function formatRow(entry: MusicLineArpEntry): string[] {
  const { note, smpl, fx1, param1, fx2, param2 } = entry;
  return [
    formatNote(note),                           // col 0: note (3 chars)
    formatHexNibble((smpl >> 4) & 0xf),         // col 1: ws hi
    formatHexNibble(smpl & 0xf),                // col 2: ws lo
    formatHexNibble((fx1 >> 4) & 0xf),          // col 3: fx1 num (high nibble only — fx num is 0-F)
    formatHexNibble((param1 >> 4) & 0xf),       // col 4: fx1 param hi
    formatHexNibble(param1 & 0xf),              // col 5: fx1 param lo
    formatHexNibble((fx2 >> 4) & 0xf),          // col 6: fx2 num
    formatHexNibble((param2 >> 4) & 0xf),       // col 7: fx2 param hi
    formatHexNibble(param2 & 0xf),              // col 8: fx2 param lo
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_ARP_ROW: MusicLineArpEntry = { note: 0, smpl: 0, fx1: 0, param1: 0, fx2: 0, param2: 0 };

function makeEmptyRows(): MusicLineArpEntry[] {
  return Array.from({ length: MAX_ROWS }, () => ({ ...EMPTY_ARP_ROW }));
}

/** Get normalized [lo, hi] range from two mark endpoints, or null if no mark. */
function normalizeMarkRange(start: number | null, end: number | null): [number, number] | null {
  if (start === null || end === null) return null;
  return [Math.min(start, end), Math.max(start, end)];
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface MusicLineArpeggioEditorProps {
  /** Initial table index to show (from instrument config). -1 = none. */
  initialTable?: number;
  /** Callback when the user selects a different table (optional, for parent sync). */
  onTableChange?: (tableIdx: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineArpeggioEditor: React.FC<MusicLineArpeggioEditorProps> = ({
  initialTable = 0,
  onTableChange,
}) => {
  const [numArps, setNumArps] = useState(0);
  const [selectedTable, setSelectedTable] = useState(Math.max(0, initialTable));
  const [rows, setRows] = useState<MusicLineArpEntry[]>([]);
  const [tableLength, setTableLength] = useState(0);
  const [loading, setLoading] = useState(true);

  // Cursor position
  const [selRow, setSelRow] = useState(0);
  const [selCol, setSelCol] = useState(0);

  // Edit mode: 0 = Vertical (advance down), 1 = Horizontal (advance right)
  const [editMode, setEditMode] = useState<0 | 1>(0);

  // Octave for note input (0-based, so octave 1 = offset 0, range 0-4 gives notes 1-60)
  const [octave, setOctave] = useState(2);

  // Block mark selection state — null means no mark active
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [markEnd, setMarkEnd] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Derived: normalized mark range
  const markRange = normalizeMarkRange(markStart, markEnd);

  // ── Load number of arp tables on mount ─────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && numArps === 0) {
        setNumArps(1);
      }
    }, 2000);

    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.ready().then(() => {
        engine.readInstArpConfig(0).then((cfg) => {
          clearTimeout(timeout);
          if (!cancelled) setNumArps(Math.max(1, cfg.numArps));
        }).catch(() => {
          clearTimeout(timeout);
          if (!cancelled) setNumArps(1);
        });
      });
    }

    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  // ── Load table data when selectedTable changes ─────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
        setLoading(false);
        setSelRow(0);
        setSelCol(0);
      }
    }, 2000);

    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        clearTimeout(timeout);
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      await engine.ready();

      try {
        const data = await engine.readArpTable(selectedTable);
        clearTimeout(timeout);
        if (cancelled) return;

        const effectiveRows = data.rows.length > 0 ? data.rows : makeEmptyRows();
        const effectiveLength = data.length > 0 ? data.length : MAX_ROWS;

        // Pad to MAX_ROWS if shorter
        while (effectiveRows.length < MAX_ROWS) {
          effectiveRows.push({ ...EMPTY_ARP_ROW });
        }

        setRows(effectiveRows);
        setTableLength(effectiveLength);
      } catch {
        clearTimeout(timeout);
        if (cancelled) return;
        setRows(makeEmptyRows());
        setTableLength(MAX_ROWS);
      }
      setLoading(false);
      setSelRow(0);
      setSelCol(0);
    })();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [selectedTable]);

  // ── Table selector change ──────────────────────────────────────────────────

  const handleTableChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedTable(idx);
    onTableChange?.(idx);
  }, [onTableChange]);

  // ── Cell click (with shift-click for mark selection) ──────────────────────

  const handleCellClick = useCallback((row: number, col: number, shiftKey: boolean) => {
    if (shiftKey) {
      // Extend or start mark selection
      if (markStart === null) {
        setMarkStart(selRow);
      }
      setMarkEnd(row);
    } else {
      // Clear mark on plain click
      setMarkStart(null);
      setMarkEnd(null);
    }
    setSelRow(row);
    setSelCol(col);
  }, [selRow, markStart]);

  // ── Write a byte-level value to the engine and update local state ──────────

  const commitByte = useCallback((row: number, fieldIdx: number, value: number) => {
    const fieldKey = FIELD_KEYS[fieldIdx];
    const clamped = Math.max(0, Math.min(255, value));

    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeArpEntry(selectedTable, row, fieldIdx, clamped);
    }

    setRows((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], [fieldKey]: clamped };
      return next;
    });
  }, [selectedTable]);

  /** Write a nibble at the current cursor column */
  const commitNibble = useCallback((row: number, cursorCol: number, nibbleValue: number) => {
    const fieldIdx = ARP_OFFSET[cursorCol];
    const isHigh = ARP_SHIFT[cursorCol] === 1;
    const fieldKey = FIELD_KEYS[fieldIdx];
    const currentByte = rowsRef.current[row]?.[fieldKey] ?? 0;

    let newByte: number;
    if (isHigh) {
      newByte = (nibbleValue << 4) | (currentByte & 0x0f);
    } else {
      newByte = (currentByte & 0xf0) | (nibbleValue & 0x0f);
    }

    commitByte(row, fieldIdx, newByte);
  }, [commitByte]);

  /** Advance cursor after an entry based on edit mode */
  const advanceCursor = useCallback(() => {
    if (editMode === 0) {
      // Vertical: move down
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
    } else {
      // Horizontal: move right, wrap to next row
      setSelCol((c) => {
        if (c < NUM_CURSOR_COLS - 1) return c + 1;
        setSelRow((r) => Math.min(r + 1, tableLength - 1));
        return 0;
      });
    }
  }, [editMode, tableLength]);

  // ── Insert row at cursor (shift remaining down) ────────────────────────────

  const insertRow = useCallback((atRow: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(atRow, 0, { ...EMPTY_ARP_ROW });
      // Trim to MAX_ROWS
      if (next.length > MAX_ROWS) next.length = MAX_ROWS;
      return next;
    });
  }, []);

  // ── Delete row at cursor (shift remaining up) ─────────────────────────────

  const deleteRow = useCallback((atRow: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(atRow, 1);
      next.push({ ...EMPTY_ARP_ROW });
      return next;
    });
  }, []);

  // ── Clear current field/cell ──────────────────────────────────────────────

  const clearCurrentField = useCallback(() => {
    const cursorCol = selCol;
    if (cursorCol === 0) {
      commitByte(selRow, 0, 0);
    } else {
      commitNibble(selRow, cursorCol, 0);
    }
  }, [selRow, selCol, commitByte, commitNibble]);

  // ── Block operations: Copy / Cut / Paste ───────────────────────────────────

  /** Write all 6 fields of an arp entry to the WASM engine */
  const writeFullRowToEngine = useCallback((tableIdx: number, rowIdx: number, entry: MusicLineArpEntry) => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    const vals = [entry.note, entry.smpl, entry.fx1, entry.param1, entry.fx2, entry.param2];
    for (let f = 0; f < vals.length; f++) {
      engine.writeArpEntry(tableIdx, rowIdx, f, vals[f]);
    }
  }, []);

  const copyBlock = useCallback(() => {
    if (!markRange) return;
    const [lo, hi] = markRange;
    arpClipboard = { rows: rowsRef.current.slice(lo, hi + 1).map((r) => ({ ...r })) };
  }, [markRange]);

  const cutBlock = useCallback(() => {
    if (!markRange) return;
    const [lo, hi] = markRange;
    // Copy first
    arpClipboard = { rows: rowsRef.current.slice(lo, hi + 1).map((r) => ({ ...r })) };
    // Clear the marked rows
    setRows((prev) => {
      const next = [...prev];
      for (let r = lo; r <= hi; r++) {
        next[r] = { ...EMPTY_ARP_ROW };
        writeFullRowToEngine(selectedTable, r, EMPTY_ARP_ROW);
      }
      return next;
    });
    setMarkStart(null);
    setMarkEnd(null);
  }, [markRange, selectedTable, writeFullRowToEngine]);

  const pasteBlock = useCallback(() => {
    if (!arpClipboard || arpClipboard.rows.length === 0) return;
    const startRow = selRow;
    const clipRows = arpClipboard.rows;
    setRows((prev) => {
      const next = [...prev];
      for (let i = 0; i < clipRows.length; i++) {
        const targetRow = startRow + i;
        if (targetRow >= tableLength) break;
        next[targetRow] = { ...clipRows[i] };
        writeFullRowToEngine(selectedTable, targetRow, clipRows[i]);
      }
      return next;
    });
  }, [selRow, tableLength, selectedTable, writeFullRowToEngine]);

  // ── Keyboard handling ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const cursorCol = selCol;
    const isMeta = e.metaKey || e.ctrlKey;

    // ── Block operations: Ctrl/Cmd+C, X, V, A ──
    if (isMeta && e.key === 'c') {
      e.preventDefault();
      copyBlock();
      return;
    }
    if (isMeta && e.key === 'x') {
      e.preventDefault();
      cutBlock();
      return;
    }
    if (isMeta && e.key === 'v') {
      e.preventDefault();
      pasteBlock();
      return;
    }
    if (isMeta && e.key === 'a') {
      e.preventDefault();
      setMarkStart(0);
      setMarkEnd(tableLength - 1);
      return;
    }

    // Escape — clear mark
    if (e.key === 'Escape') {
      e.preventDefault();
      setMarkStart(null);
      setMarkEnd(null);
      return;
    }

    // ── Shift+Arrow/Page/Home/End extends block selection ──
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (markStart === null) {
        setMarkStart(selRow);
        setMarkEnd(selRow);
      }
      if (e.key === 'ArrowDown') {
        const newRow = Math.min(selRow + 1, tableLength - 1);
        setSelRow(newRow);
        setMarkEnd(newRow);
      } else {
        const newRow = Math.max(selRow - 1, 0);
        setSelRow(newRow);
        setMarkEnd(newRow);
      }
      return;
    }
    if (e.shiftKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
      e.preventDefault();
      if (markStart === null) {
        setMarkStart(selRow);
        setMarkEnd(selRow);
      }
      if (e.key === 'PageDown') {
        const newRow = Math.min(selRow + VISIBLE_ROWS, tableLength - 1);
        setSelRow(newRow);
        setMarkEnd(newRow);
      } else {
        const newRow = Math.max(selRow - VISIBLE_ROWS, 0);
        setSelRow(newRow);
        setMarkEnd(newRow);
      }
      return;
    }
    if (e.shiftKey && e.key === 'Home') {
      e.preventDefault();
      if (markStart === null) setMarkStart(selRow);
      setSelRow(0);
      setMarkEnd(0);
      return;
    }
    if (e.shiftKey && e.key === 'End') {
      e.preventDefault();
      if (markStart === null) setMarkStart(selRow);
      const lastRow = tableLength - 1;
      setSelRow(lastRow);
      setMarkEnd(lastRow);
      return;
    }

    // ── Navigation (non-shift clears mark) ──
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow((r) => Math.max(r - 1, 0));
      return;
    }
    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      setSelCol((c) => Math.min(c + 1, NUM_CURSOR_COLS - 1));
      return;
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setSelCol((c) => Math.max(c - 1, 0));
      return;
    }

    // Page up/down
    if (e.key === 'PageDown') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow((r) => Math.min(r + VISIBLE_ROWS, tableLength - 1));
      return;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow((r) => Math.max(r - VISIBLE_ROWS, 0));
      return;
    }

    // Home/End
    if (e.key === 'Home') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setMarkStart(null); setMarkEnd(null);
      setSelRow(tableLength - 1);
      return;
    }

    // Delete — clear current field
    if (e.key === 'Delete') {
      e.preventDefault();
      clearCurrentField();
      return;
    }

    // Backspace — delete entire row, shift remaining up
    if (e.key === 'Backspace') {
      e.preventDefault();
      deleteRow(selRow);
      return;
    }

    // Enter/Return — insert empty row at cursor, shift remaining down
    if (e.key === 'Enter') {
      e.preventDefault();
      insertRow(selRow);
      return;
    }

    // Octave change: F1-F5
    if (e.key >= 'F1' && e.key <= 'F5') {
      e.preventDefault();
      setOctave(parseInt(e.key[1], 10) - 1);
      return;
    }

    // Edit mode toggle: F6
    if (e.key === 'F6') {
      e.preventDefault();
      setEditMode((m) => (m === 0 ? 1 : 0));
      return;
    }

    // ── Note column (col 0): keyboard note entry ──
    if (cursorCol === 0) {
      const key = e.key.toLowerCase();

      // Special: '1' = End (61), '`' or '~' = Restart (62)
      if (key === '1') {
        e.preventDefault();
        commitByte(selRow, 0, 61);
        advanceCursor();
        return;
      }
      if (key === '`' || key === '~') {
        e.preventDefault();
        commitByte(selRow, 0, 62);
        advanceCursor();
        return;
      }

      // QWERTY note mapping
      const mapping = QWERTY_NOTE_MAP[key];
      if (mapping) {
        e.preventDefault();
        const noteValue = (octave + mapping.octaveOffset) * 12 + mapping.semitone + 1;
        if (noteValue >= 1 && noteValue <= 60) {
          commitByte(selRow, 0, noteValue);
          advanceCursor();
        }
        return;
      }
      return; // Don't fall through to hex for the note column
    }

    // ── Hex nibble columns (cols 1-8) ──
    const hexMatch = e.key.match(/^[0-9a-fA-F]$/);
    if (hexMatch) {
      e.preventDefault();
      const nibbleValue = parseInt(hexMatch[0], 16);
      commitNibble(selRow, cursorCol, nibbleValue);
      advanceCursor();
      return;
    }
  }, [selRow, selCol, octave, tableLength, editMode, commitByte, commitNibble,
    advanceCursor, clearCurrentField, deleteRow, insertRow,
    copyBlock, cutBlock, pasteBlock, markStart]);

  // ── Scroll selected row into view ──────────────────────────────────────────

  useEffect(() => {
    if (!scrollRef.current) return;
    const top = selRow * ROW_HEIGHT;
    const bot = top + ROW_HEIGHT;
    const st = scrollRef.current.scrollTop;
    if (top < st) {
      scrollRef.current.scrollTop = top;
    } else if (bot > st + GRID_HEIGHT) {
      scrollRef.current.scrollTop = bot - GRID_HEIGHT;
    }
  }, [selRow]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Get the left offset + group gap for a cursor column */
  const getColLeft = (colIdx: number): number => {
    let left = ROW_NUM_WIDTH;
    for (let i = 0; i < colIdx; i++) {
      left += COL_WIDTHS[i];
      if (i === 0 || i === 2 || i === 5) left += GROUP_GAP;
    }
    return left;
  };

  /** Determine which cursor column was clicked based on x position */
  const getCursorColFromX = (x: number): number => {
    for (let i = NUM_CURSOR_COLS - 1; i >= 0; i--) {
      if (x >= getColLeft(i)) return i;
    }
    return 0;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ color: 'var(--color-text-muted)', fontSize: 11, padding: 12 }}>
        Loading arpeggio data...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: 1,
        minHeight: 0,
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      {/* ── Header: table selector + octave + edit mode ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '5px 8px',
          background: '#0e0e18',
          border: '1px solid #1e1e2e',
          borderRadius: 4,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ color: '#7a7a9a', fontSize: 10 }}>
          Table:
          <select
            value={selectedTable}
            onChange={handleTableChange}
            style={{
              marginLeft: 4,
              background: '#14141e',
              color: '#a0a0ff',
              border: '1px solid #2a2a3e',
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {Array.from({ length: numArps }, (_, i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <span style={{ color: '#7a7a9a', fontSize: 10 }}>
          Oct: <span style={{ color: '#60e060' }}>{octave + 1}</span>
          <span style={{ color: '#3a3a5a', marginLeft: 2 }}>(F1-F5)</span>
        </span>
        <span
          onClick={() => setEditMode((m) => (m === 0 ? 1 : 0))}
          style={{
            color: editMode === 0 ? '#60a0e0' : '#e0c040',
            fontSize: 10,
            cursor: 'pointer',
            userSelect: 'none',
            padding: '1px 4px',
            background: '#14141e',
            border: '1px solid #2a2a3e',
            borderRadius: 3,
          }}
        >
          {editMode === 0 ? 'Vert' : 'Horiz'}
          <span style={{ color: '#3a3a5a', marginLeft: 2 }}>(F6)</span>
        </span>
        <span style={{ color: '#7a7a9a', fontSize: 10 }}>
          Rows: <span style={{ color: '#a0a0ff' }}>{tableLength}</span>
        </span>
        {markRange && (
          <span style={{ color: '#60a0e0', fontSize: 10 }}>
            Mark: {markRange[0].toString(16).toUpperCase().padStart(2, '0')}-{markRange[1].toString(16).toUpperCase().padStart(2, '0')}
            ({markRange[1] - markRange[0] + 1} rows)
          </span>
        )}
      </div>

      {/* ── Sub-effect legend ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '2px 8px',
          fontSize: 9,
          color: '#5a5a7a',
          flexWrap: 'wrap',
        }}
      >
        {Object.entries(SUB_FX_NAMES).map(([k, v]) => (
          <span key={k}>
            <span style={{ color: '#60a0e0' }}>{parseInt(k).toString(16).toUpperCase()}</span>
            ={v}
          </span>
        ))}
      </div>

      {/* ── Column headers ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a3e',
          padding: '2px 0',
          userSelect: 'none',
          position: 'relative',
          height: 14,
        }}
      >
        <div style={{ width: ROW_NUM_WIDTH, textAlign: 'right', paddingRight: 4, color: '#4a4a6a', fontSize: 9 }}>
          #
        </div>
        <div style={{ position: 'absolute', left: getColLeft(0), color: '#60e060', fontSize: 9, opacity: 0.7 }}>
          Note
        </div>
        <div style={{ position: 'absolute', left: getColLeft(1), color: '#e0c040', fontSize: 9, opacity: 0.7 }}>
          WS
        </div>
        <div style={{ position: 'absolute', left: getColLeft(3), color: '#60a0e0', fontSize: 9, opacity: 0.7 }}>
          FPP
        </div>
        <div style={{ position: 'absolute', left: getColLeft(6), color: '#c060e0', fontSize: 9, opacity: 0.7 }}>
          FPP
        </div>
      </div>

      {/* ── Scrollable grid ── */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          minHeight: GRID_HEIGHT,
          maxHeight: GRID_HEIGHT,
          overflowY: 'auto',
          overflowX: 'hidden',
          outline: 'none',
          cursor: 'default',
        }}
      >
        <div style={{ width: TOTAL_WIDTH }}>
          {rows.slice(0, tableLength).map((entry, rowIdx) => {
            const isSelectedRow = rowIdx === selRow;
            const isMarked = markRange !== null && rowIdx >= markRange[0] && rowIdx <= markRange[1];
            const formatted = formatRow(entry);

            return (
              <div
                key={rowIdx}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const col = getCursorColFromX(x);
                  handleCellClick(rowIdx, col, e.shiftKey);
                }}
                style={{
                  display: 'flex',
                  position: 'relative',
                  height: ROW_HEIGHT,
                  alignItems: 'center',
                  background: isMarked
                    ? '#1a2a3e'
                    : isSelectedRow ? '#1a1a2e' : rowIdx % 4 === 0 ? '#0c0c16' : 'transparent',
                  borderBottom: '1px solid #12121e',
                  cursor: 'pointer',
                }}
              >
                {/* Row number */}
                <div
                  style={{
                    width: ROW_NUM_WIDTH,
                    textAlign: 'right',
                    paddingRight: 4,
                    color: isMarked ? '#60a0e0' : rowIdx % 4 === 0 ? '#5a5a8a' : '#3a3a5a',
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  {rowIdx.toString(16).toUpperCase().padStart(2, '0')}
                </div>

                {/* Data cells — positioned using getColLeft */}
                {formatted.map((text, colIdx) => {
                  const isSelected = isSelectedRow && colIdx === selCol;
                  const fieldIdx = ARP_OFFSET[colIdx];
                  const byteValue = entry[FIELD_KEYS[fieldIdx]];
                  const isEmpty = colIdx === 0 ? byteValue === 0 : text === '0';

                  // Tooltip for fx number columns
                  const tooltip = (colIdx === 3 || colIdx === 6)
                    ? SUB_FX_NAMES[(byteValue >> 4) & 0xf] ?? `Unknown`
                    : undefined;

                  return (
                    <div
                      key={colIdx}
                      title={tooltip}
                      style={{
                        position: 'absolute',
                        left: getColLeft(colIdx),
                        width: COL_WIDTHS[colIdx],
                        textAlign: 'center',
                        color: isEmpty ? '#2a2a3e' : COL_COLORS[colIdx],
                        background: isSelected ? '#2a2a4e' : 'transparent',
                        borderRadius: isSelected ? 2 : 0,
                        outline: isSelected ? `1px solid ${COL_COLORS[colIdx]}44` : 'none',
                        lineHeight: `${ROW_HEIGHT}px`,
                        fontSize: colIdx === 0 ? 11 : 10,
                      }}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Help bar ── */}
      <div style={{ padding: '2px 8px', fontSize: 9, color: '#3a3a5a' }}>
        Note: QWERTY | 1=END `=RST | Hex: 0-9 A-F | Del=Clear | BkSp=Del Row | Enter=Ins Row | F1-F5=Oct | F6=Mode
      </div>
      <div style={{ padding: '0px 8px 2px', fontSize: 9, color: '#3a3a5a' }}>
        Block: Shift+Arrow/Click=Mark | Ctrl+C=Copy | Ctrl+X=Cut | Ctrl+V=Paste | Ctrl+A=All | Esc=Deselect
      </div>
    </div>
  );
};
