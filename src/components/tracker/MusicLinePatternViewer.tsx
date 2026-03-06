/**
 * MusicLinePatternViewer — Multi-channel pattern view with cursor & keyboard editing.
 *
 * Shows all channels' note data simultaneously for the current song position.
 * Each channel plays a different "part" (1-channel pattern) at each position;
 * this viewer assembles them into a familiar side-by-side tracker grid.
 *
 * Keyboard editing follows FT2 conventions: arrow keys navigate, note keys
 * enter data when record mode is on.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore , useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useEditorStore } from '@stores/useEditorStore';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(note: number): string {
  if (!note) return '---';
  if (note === 97) return '===';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + Math.floor(n / 12);
}

function instrStr(instr: number): string {
  return instr ? instr.toString(16).toUpperCase().padStart(2, '0') : '--';
}

function fxStr(typ: number | undefined, par: number | undefined): string {
  if (!typ && !par) return '\u00B7\u00B7\u00B7';
  const t = (typ ?? 0).toString(16).toUpperCase();
  const p = (par ?? 0).toString(16).toUpperCase().padStart(2, '0');
  return `${t}${p}`;
}

const FX_KEYS: Array<[string, string]> = [
  ['effTyp', 'eff'],
  ['effTyp2', 'eff2'],
  ['effTyp3', 'eff3'],
  ['effTyp4', 'eff4'],
  ['effTyp5', 'eff5'],
];

const ROW_H = 18; // px per row — must match CSS

// ─── FT2-style note keyboard maps ────────────────────────────────────────────
const LOWER_KEY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
};
const UPPER_KEY_MAP: Record<string, number> = {
  q: 0, '2': 1, w: 2, '3': 3, e: 4, r: 5, '5': 6, t: 7, '6': 8, y: 9, '7': 10, u: 11,
};
const HEX_CHARS = '0123456789abcdef';

export const MusicLinePatternViewer: React.FC = () => {
  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const currentRow = useTransportStore((s) => s.currentRow);
  const currentRowPerChannel = useTransportStore((s) => s.currentRowPerChannel);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const recordMode = useEditorStore((s) => s.recordMode);
  const editStep = useEditorStore((s) => s.editStep);
  const currentOctave = useEditorStore((s) => s.currentOctave);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursorState] = useState({ row: 0, channel: 0, column: 0 });
  const [hexDigit, setHexDigit] = useState(0);

  // Keep current row in view during playback
  useEffect(() => {
    if (!scrollRef.current) return;
    if (isPlaying) {
      const el = scrollRef.current;
      const targetScrollTop = currentRow * ROW_H - el.clientHeight / 2 + ROW_H / 2;
      el.scrollTop = Math.max(0, targetScrollTop);
    }
  }, [currentRow, isPlaying]);

  // Auto-scroll cursor into view when not playing
  useEffect(() => {
    if (isPlaying || !scrollRef.current) return;
    const el = scrollRef.current;
    const rowTop = (cursor.row + 1) * ROW_H + ROW_H; // +1 for header
    const rowBottom = rowTop + ROW_H;
    if (rowTop < el.scrollTop) {
      el.scrollTop = rowTop;
    } else if (rowBottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = rowBottom - el.clientHeight;
    }
  }, [cursor.row, isPlaying]);

  // Reset hex digit when column changes
  const setCursor = useCallback((next: { row: number; channel: number; column: number }) => {
    setCursorState((prev) => {
      if (prev.column !== next.column || prev.channel !== next.channel) {
        setHexDigit(0);
      }
      return next;
    });
  }, []);

  // ─── writeCell: update TrackerStore + engine ────────────────────────────────
  const writeCell = useCallback(
    (row: number, channel: number, field: 'note' | 'instrument' | 'effect', value: number, fxIndex?: number) => {
      if (!channelTrackTables) return;
      const patIdx = channelTrackTables[channel]?.[currentPos] ?? 0;
      const store = useTrackerStore.getState();
      const pat = store.patterns[patIdx];
      if (!pat?.channels[0]?.rows[row]) return;

      const cell = pat.channels[0].rows[row];
      let engineCell: { note?: number; inst?: number; fx?: number[] } = {};

      if (field === 'note') {
        cell.note = value;
        engineCell = { note: value };
      } else if (field === 'instrument') {
        cell.instrument = value;
        engineCell = { inst: value };
      } else if (field === 'effect' && fxIndex !== undefined) {
        const [typKey, parKey] = FX_KEYS[fxIndex];
        // value encodes type*256 + param
        const typ = (value >> 8) & 0xf;
        const par = value & 0xff;
        (cell as unknown as Record<string, number>)[typKey] = typ;
        (cell as unknown as Record<string, number>)[parKey] = par;
        // Build fx array for engine
        const fxArr: number[] = [];
        for (let i = 0; i < FX_KEYS.length; i++) {
          const t = (cell as unknown as Record<string, number>)[FX_KEYS[i][0]] ?? 0;
          const p = (cell as unknown as Record<string, number>)[FX_KEYS[i][1]] ?? 0;
          fxArr.push(t, p);
        }
        engineCell = { fx: fxArr };
      }

      // Sync to engine if running
      try {
        MusicLineEngine.getInstance().setPatternCell(patIdx, row, engineCell);
      } catch {
        // Engine may not be running
      }

      // Force store re-render
      useTrackerStore.setState((s) => ({ patterns: [...s.patterns] }));
    },
    [channelTrackTables, currentPos],
  );

  // ─── Keyboard handler ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!channelTrackTables || channelTrackTables.length === 0) return;

      const numChannels = channelTrackTables.length;
      const channelPatterns = channelTrackTables.map((table) => {
        const patIdx = table[currentPos] ?? 0;
        return useTrackerStore.getState().patterns[patIdx] ?? null;
      });
      const effectCols = channelPatterns[0]?.channels[0]?.channelMeta?.effectCols ?? 2;
      const colsPerChannel = 2 + effectCols;
      const numRows = channelPatterns[0]?.length ?? 128;

      const clampRow = (r: number) => Math.max(0, Math.min(numRows - 1, r));
      const { row, channel, column } = cursor;

      // ─── Navigation ────────────────────────────────────────────────────
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCursor({ ...cursor, row: clampRow(row - 1) });
          return;
        case 'ArrowDown':
          e.preventDefault();
          setCursor({ ...cursor, row: clampRow(row + 1) });
          return;
        case 'ArrowLeft': {
          e.preventDefault();
          let newCol = column - 1;
          let newCh = channel;
          if (newCol < 0) {
            newCh = channel - 1;
            if (newCh < 0) { newCh = numChannels - 1; }
            newCol = colsPerChannel - 1;
          }
          setCursor({ row, channel: newCh, column: newCol });
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          let newCol = column + 1;
          let newCh = channel;
          if (newCol >= colsPerChannel) {
            newCh = channel + 1;
            if (newCh >= numChannels) { newCh = 0; }
            newCol = 0;
          }
          setCursor({ row, channel: newCh, column: newCol });
          return;
        }
        case 'Tab': {
          e.preventDefault();
          const dir = e.shiftKey ? -1 : 1;
          let newCh = (channel + dir + numChannels) % numChannels;
          setCursor({ row, channel: newCh, column });
          return;
        }
        case 'PageUp':
          e.preventDefault();
          setCursor({ ...cursor, row: clampRow(row - 16) });
          return;
        case 'PageDown':
          e.preventDefault();
          setCursor({ ...cursor, row: clampRow(row + 16) });
          return;
        case 'Home':
          e.preventDefault();
          setCursor({ ...cursor, row: 0 });
          return;
        case 'End':
          e.preventDefault();
          setCursor({ ...cursor, row: numRows - 1 });
          return;
      }

      // ─── Editing (only when record mode is on and not playing) ─────────
      if (!recordMode || isPlaying) return;
      const advanceRow = () => setCursor({ ...cursor, row: clampRow(row + editStep) });

      // Delete: clear field, advance
      if (e.key === 'Delete') {
        e.preventDefault();
        if (column === 0) writeCell(row, channel, 'note', 0);
        else if (column === 1) writeCell(row, channel, 'instrument', 0);
        else writeCell(row, channel, 'effect', 0, column - 2);
        setHexDigit(0);
        advanceRow();
        return;
      }

      // Backspace: clear field, move up
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (column === 0) writeCell(row, channel, 'note', 0);
        else if (column === 1) writeCell(row, channel, 'instrument', 0);
        else writeCell(row, channel, 'effect', 0, column - 2);
        setHexDigit(0);
        setCursor({ ...cursor, row: clampRow(row - 1) });
        return;
      }

      const key = e.key.toLowerCase();

      // ─── Column 0: Note entry ──────────────────────────────────────────
      if (column === 0) {
        let semi: number | undefined;
        let octaveOffset = 0;
        if (key in LOWER_KEY_MAP) {
          semi = LOWER_KEY_MAP[key];
          octaveOffset = -1;
        } else if (key in UPPER_KEY_MAP) {
          semi = UPPER_KEY_MAP[key];
          octaveOffset = 0;
        }
        if (semi !== undefined) {
          e.preventDefault();
          const noteVal = Math.max(1, Math.min(96, (currentOctave + octaveOffset) * 12 + semi + 1));
          writeCell(row, channel, 'note', noteVal);
          advanceRow();
          return;
        }
        // Note off: key 1
        if (key === '1') {
          e.preventDefault();
          writeCell(row, channel, 'note', 97);
          advanceRow();
          return;
        }
        return;
      }

      // ─── Column 1: Instrument hex entry (2 nybbles) ───────────────────
      if (column === 1) {
        const hexVal = HEX_CHARS.indexOf(key);
        if (hexVal === -1) return;
        e.preventDefault();
        const patIdx = channelTrackTables[channel]?.[currentPos] ?? 0;
        const cell = useTrackerStore.getState().patterns[patIdx]?.channels[0]?.rows[row];
        const oldInst = cell?.instrument ?? 0;
        let newInst: number;
        if (hexDigit === 0) {
          newInst = (hexVal << 4) | (oldInst & 0x0f);
          setHexDigit(1);
        } else {
          newInst = (oldInst & 0xf0) | hexVal;
          setHexDigit(0);
          advanceRow();
        }
        writeCell(row, channel, 'instrument', newInst);
        return;
      }

      // ─── Columns 2+: Effect hex entry (3 nybbles: type + param) ───────
      const fxIndex = column - 2;
      if (fxIndex >= 0 && fxIndex < FX_KEYS.length) {
        const hexVal = HEX_CHARS.indexOf(key);
        if (hexVal === -1) return;
        e.preventDefault();
        const patIdx = channelTrackTables[channel]?.[currentPos] ?? 0;
        const cell = useTrackerStore.getState().patterns[patIdx]?.channels[0]?.rows[row];
        const [typKey, parKey] = FX_KEYS[fxIndex];
        const oldTyp = cell ? ((cell as unknown as Record<string, number>)[typKey] ?? 0) : 0;
        const oldPar = cell ? ((cell as unknown as Record<string, number>)[parKey] ?? 0) : 0;
        let newTyp = oldTyp;
        let newPar = oldPar;
        if (hexDigit === 0) {
          newTyp = hexVal;
          setHexDigit(1);
        } else if (hexDigit === 1) {
          newPar = (hexVal << 4) | (oldPar & 0x0f);
          setHexDigit(2);
        } else {
          newPar = (oldPar & 0xf0) | hexVal;
          setHexDigit(0);
          advanceRow();
        }
        writeCell(row, channel, 'effect', (newTyp << 8) | newPar, fxIndex);
        return;
      }
    },
    [channelTrackTables, currentPos, cursor, setCursor, recordMode, isPlaying, editStep, currentOctave, writeCell, hexDigit],
  );

  // ─── Early return for no data ──────────────────────────────────────────────
  if (!channelTrackTables || channelTrackTables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        No channel data
      </div>
    );
  }

  // Resolve each channel's pattern for the current position
  const channelPatterns = channelTrackTables.map((table) => {
    const patIdx = table[currentPos] ?? 0;
    return patterns[patIdx] ?? null;
  });

  // Number of effect columns from channelMeta (MusicLine sets 5)
  const effectCols = channelPatterns[0]?.channels[0]?.channelMeta?.effectCols ?? 2;
  const chanWidth = 56 + effectCols * 28; // note(28) + instr(20) + padding + fx cols

  // All parts are 128 rows
  const numRows = channelPatterns[0]?.length ?? 128;
  const rows = Array.from({ length: numRows }, (_, i) => i);

  const cursorBg = recordMode ? 'rgba(200, 50, 50, 0.3)' : 'rgba(80, 120, 200, 0.3)';

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'auto',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: `${ROW_H}px`,
        backgroundColor: '#0d0d0d',
        color: '#888',
        outline: 'none',
      }}
    >
      {/* Sticky header row */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333',
          height: ROW_H + 2,
          alignItems: 'center',
        }}
      >
        {/* Row number column */}
        <span style={{ width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 6, color: '#555' }}>
          ROW
        </span>
        {channelTrackTables.map((table, chIdx) => {
          const partIdx = table[currentPos] ?? 0;
          const pat = patterns[partIdx];
          return (
            <span
              key={chIdx}
              style={{
                width: chanWidth,
                flexShrink: 0,
                textAlign: 'center',
                color: '#aaa',
                fontSize: 11,
                letterSpacing: 0.5,
              }}
            >
              CH{chIdx + 1} {pat ? `P:${partIdx.toString().padStart(2, '0')}` : '???'}
            </span>
          );
        })}
      </div>

      {/* Pattern rows */}
      {rows.map((rowIdx) => {
        // Per-channel rows: highlight per-channel, not full row
        const hasPerChRows = isPlaying && currentRowPerChannel.length > 0;
        const isPlayhead = !hasPerChRows && isPlaying && rowIdx === currentRow;
        const isEvenGroup = Math.floor(rowIdx / 4) % 2 === 0;
        const isCursorRow = rowIdx === cursor.row;
        return (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              height: ROW_H,
              alignItems: 'center',
              backgroundColor: isPlayhead
                ? '#1a3a1a'
                : isEvenGroup
                ? 'transparent'
                : '#0a0a0a',
              borderBottom: rowIdx % 4 === 3 ? '1px solid #1e1e1e' : undefined,
            }}
          >
            {/* Row number */}
            <span
              style={{
                width: 36,
                flexShrink: 0,
                textAlign: 'right',
                paddingRight: 6,
                color: rowIdx % 4 === 0 ? '#555' : '#333',
                fontSize: 11,
              }}
            >
              {rowIdx.toString().padStart(3, '0')}
            </span>

            {/* Each channel's cell */}
            {channelPatterns.map((pat, chIdx) => {
              const cell = pat?.channels[0]?.rows[rowIdx];
              const hasNote = cell && cell.note > 0;
              const isCursorCh = isCursorRow && chIdx === cursor.channel;
              const isChPlayhead = hasPerChRows
                ? rowIdx === currentRowPerChannel[chIdx]
                : isPlayhead;
              return (
                <span
                  key={chIdx}
                  style={{
                    width: chanWidth,
                    flexShrink: 0,
                    display: 'flex',
                    gap: 2,
                    paddingLeft: 4,
                    paddingRight: 4,
                    borderLeft: '1px solid #1e1e1e',
                    backgroundColor: isChPlayhead ? '#1a3a1a' : undefined,
                    color: hasNote
                      ? isChPlayhead
                        ? '#88ff88'
                        : '#cccccc'
                      : '#333',
                  }}
                >
                  <span style={{
                    width: 28,
                    letterSpacing: 0,
                    backgroundColor: isCursorCh && cursor.column === 0 ? cursorBg : undefined,
                  }}>
                    {cell ? noteStr(cell.note) : '---'}
                  </span>
                  <span style={{
                    width: 20,
                    color: hasNote && cell.instrument ? '#ffaa44' : '#333',
                    backgroundColor: isCursorCh && cursor.column === 1 ? cursorBg : undefined,
                  }}>
                    {cell ? instrStr(cell.instrument) : '--'}
                  </span>
                  {Array.from({ length: effectCols }, (_, ec) => {
                    const [typKey, parKey] = FX_KEYS[ec];
                    const typ = cell ? (cell as unknown as Record<string, number>)[typKey] : undefined;
                    const par = cell ? (cell as unknown as Record<string, number>)[parKey] : undefined;
                    const hasFx = typ || par;
                    return (
                      <span key={ec} style={{
                        width: 24,
                        color: hasFx ? '#66aaff' : '#333',
                        fontSize: 10,
                        backgroundColor: isCursorCh && cursor.column === 2 + ec ? cursorBg : undefined,
                      }}>
                        {fxStr(typ, par)}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
