/**
 * MaxTraxGrid — pure dumb renderer for the MaxTrax editable tracker grid.
 *
 * Columns: one global-effect column on the left, then per-channel groups each
 * containing note / velocity / duration / offset / effect sub-columns.
 * All edits are dispatched through the `edit` object (no local mutable state
 * beyond cursor/selection and scroll).
 */

import React, { useState, useCallback } from 'react';
import type {
  MaxTraxGrid as MaxTraxGridType,
  GridNoteCell,
  GridEffectCell,
} from '@/lib/maxtrax/maxtraxGrid.types';

// ── MIDI note name helper ────────────────────────────────────────────────────
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'] as const;

function midiNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[pitch % 12];
  return `${name}${octave}`;
}

// ── Effect token formatter ────────────────────────────────────────────────────
function effectToken(cell: GridEffectCell): string {
  const { command, data, stopTime } = cell;
  if (command >= 0xFF) return 'END';
  if (command >= 0xE0) {
    const val = data - 128;
    return `BND${val >= 0 ? '+' : ''}${val}`;
  }
  if (command >= 0xC0) return `PRG${data}`;
  if (command >= 0xB0) {
    const cc = command & 0x0f;
    return `CC${cc}=${data}`;
  }
  if (command >= 0xA0) return `MRK${data}`;
  if (command >= 0x80) {
    return `TMP${stopTime}`;
  }
  return `${command.toString(16).toUpperCase().padStart(2, '0')}:${data}`;
}

// ── Channel tint palette (intentional decorative palette per DEViLBOX pattern) ─
const CHANNEL_TINTS = [
  'bg-blue-950/40',
  'bg-purple-950/40',
  'bg-teal-950/40',
  'bg-rose-950/40',
  'bg-amber-950/40',
  'bg-indigo-950/40',
  'bg-green-950/40',
  'bg-pink-950/40',
] as const;

// ── Inline edit state ────────────────────────────────────────────────────────
interface CellEditState {
  eventIndex: number;
  field: 'velocity' | 'duration' | 'offset';
  value: string;
}

// ── Grouped column structure ─────────────────────────────────────────────────
/** A column entry that carries the original index into grid.columns. */
interface IndexedCol {
  channel: number;
  voice: number;
  colIdx: number; // index into grid.columns — matches GridNoteCell.column
}

interface ChannelGroup {
  channel: number;
  cols: IndexedCol[];
}

// ── Props ────────────────────────────────────────────────────────────────────
interface MaxTraxGridProps {
  grid: MaxTraxGridType;
  edit: {
    setNoteDuration(eventIndex: number, dur: number): void;
    moveNote(eventIndex: number, absTick: number): void;
    setNoteField(eventIndex: number, patch: { pitch?: number; velocity?: number; duration?: number; offset?: number }): void;
    setEffectField(eventIndex: number, patch: { command?: number; data?: number; stopTime?: number }): void;
  };
}

export const MaxTraxGrid: React.FC<MaxTraxGridProps> = ({ grid, edit }) => {
  const { rowCount, columns, noteCells, effectCells } = grid;

  const [cursorRow, setCursorRow] = useState(0);
  const [cellEdit, setCellEdit] = useState<CellEditState | null>(null);

  // Build lookup: `${colIdx}:${row}` → GridNoteCell
  const noteCellsByColRow = React.useMemo(() => {
    const map = new Map<string, GridNoteCell>();
    for (const c of noteCells) {
      map.set(`${c.column}:${c.row}`, c);
    }
    return map;
  }, [noteCells]);

  const globalEffectsByRow = React.useMemo(() => {
    const map = new Map<number, GridEffectCell>();
    for (const c of effectCells) {
      if (c.channel === 'global') map.set(c.row, c);
    }
    return map;
  }, [effectCells]);

  const channelEffectsByChRow = React.useMemo(() => {
    const map = new Map<string, GridEffectCell>();
    for (const c of effectCells) {
      if (c.channel !== 'global') {
        map.set(`${c.channel}:${c.row}`, c);
      }
    }
    return map;
  }, [effectCells]);

  // Group columns by channel, preserving original index
  const channelGroups = React.useMemo((): ChannelGroup[] => {
    const groupMap = new Map<number, IndexedCol[]>();
    const order: number[] = [];
    columns.forEach((col, colIdx) => {
      if (!groupMap.has(col.channel)) {
        groupMap.set(col.channel, []);
        order.push(col.channel);
      }
      groupMap.get(col.channel)!.push({ channel: col.channel, voice: col.voice, colIdx });
    });
    return order.map(ch => ({ channel: ch, cols: groupMap.get(ch)! }));
  }, [columns]);

  const commitCellEdit = useCallback(() => {
    if (!cellEdit) return;
    const num = parseInt(cellEdit.value, 10);
    if (isNaN(num)) { setCellEdit(null); return; }
    const { eventIndex, field } = cellEdit;
    if (field === 'duration') {
      edit.setNoteDuration(eventIndex, Math.max(0, num));
    } else if (field === 'velocity') {
      edit.setNoteField(eventIndex, { velocity: Math.max(0, Math.min(127, num)) });
    } else if (field === 'offset') {
      edit.setNoteField(eventIndex, { offset: num });
    }
    setCellEdit(null);
  }, [cellEdit, edit]);

  const handleFieldKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitCellEdit(); }
    if (e.key === 'Escape') { setCellEdit(null); }
  }, [commitCellEdit]);

  const rows = Array.from({ length: rowCount }, (_, i) => i);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-dark-bg font-mono text-[10px] text-text-primary select-none">
      <table className="border-collapse" style={{ minWidth: 'max-content' }}>
        <thead className="sticky top-0 z-10 bg-dark-bgSecondary">
          <tr>
            {/* Row number header */}
            <th className="w-8 px-1 py-0.5 text-right text-text-muted border-r border-dark-border border-b border-dark-border font-normal sticky left-0 bg-dark-bgSecondary z-20">
              #
            </th>
            {/* Global effect column header */}
            <th className="px-1 py-0.5 text-center text-text-muted border-r border-dark-border border-b border-dark-border font-normal whitespace-nowrap" style={{ minWidth: 72 }}>
              Global FX
            </th>
            {/* Per-channel headers */}
            {channelGroups.map((group, groupIdx) => {
              const subColCount = group.cols.length * 4 + 1;
              return (
                <th
                  key={group.channel}
                  colSpan={subColCount}
                  className={`px-1 py-0.5 text-center border-r border-dark-border border-b border-dark-border font-normal text-accent-secondary ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                >
                  Channel {group.channel}
                </th>
              );
            })}
          </tr>
          <tr>
            <th className="sticky left-0 bg-dark-bgSecondary z-20 border-r border-dark-border border-b border-dark-borderLight" />
            <th className="px-1 py-0.5 text-center text-text-muted border-r border-dark-border border-b border-dark-borderLight font-normal text-[9px]">
              FX
            </th>
            {channelGroups.map((group, groupIdx) => (
              <React.Fragment key={group.channel}>
                {group.cols.map((col) => (
                  <React.Fragment key={`${col.channel}.${col.voice}`}>
                    <th
                      className={`px-1 py-0.5 text-center border-l border-dark-borderLight border-b border-dark-borderLight font-normal text-[9px] text-text-secondary ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                      style={{ minWidth: 40 }}
                    >
                      {`Ch${col.channel}.${col.voice}`}
                    </th>
                    <th
                      className={`px-0.5 py-0.5 text-center border-b border-dark-borderLight font-normal text-[9px] text-text-muted ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                      style={{ minWidth: 28 }}
                    >
                      Vel
                    </th>
                    <th
                      className={`px-0.5 py-0.5 text-center border-b border-dark-borderLight font-normal text-[9px] text-text-muted ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                      style={{ minWidth: 32 }}
                    >
                      Dur
                    </th>
                    <th
                      className={`px-0.5 py-0.5 text-center border-b border-dark-borderLight font-normal text-[9px] text-text-muted ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                      style={{ minWidth: 28 }}
                    >
                      Off
                    </th>
                  </React.Fragment>
                ))}
                <th
                  className={`px-1 py-0.5 text-center border-l border-dark-borderLight border-r border-dark-border border-b border-dark-borderLight font-normal text-[9px] text-text-muted ${CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length]}`}
                  style={{ minWidth: 56 }}
                >
                  FX
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isEven = row % 4 === 0;
            const isCursor = row === cursorRow;
            const rowBg = isCursor
              ? 'bg-accent-primary/20'
              : isEven
              ? 'bg-dark-bgSecondary/40'
              : '';
            const globalFx = globalEffectsByRow.get(row);

            return (
              <tr
                key={row}
                className={`${rowBg} hover:bg-dark-bgHover cursor-pointer`}
                onClick={() => setCursorRow(row)}
              >
                {/* Row number */}
                <td className="px-1 text-right text-text-muted border-r border-dark-borderLight sticky left-0 bg-dark-bg z-10 tabular-nums">
                  {row.toString().padStart(3, '0')}
                </td>

                {/* Global FX cell */}
                <td className="px-1 text-accent-warning border-r border-dark-border text-center whitespace-nowrap">
                  {globalFx
                    ? effectToken(globalFx)
                    : <span className="text-text-muted opacity-30">···</span>
                  }
                </td>

                {/* Per-channel cells */}
                {channelGroups.map((group, groupIdx) => {
                  const chFx = channelEffectsByChRow.get(`${group.channel}:${row}`);
                  const tint = CHANNEL_TINTS[groupIdx % CHANNEL_TINTS.length];

                  return (
                    <React.Fragment key={group.channel}>
                      {group.cols.map((col) => {
                        const cell = noteCellsByColRow.get(`${col.colIdx}:${row}`);

                        if (!cell) {
                          return (
                            <React.Fragment key={`${col.channel}.${col.voice}.empty`}>
                              <td className={`px-1 text-center text-text-muted border-l border-dark-borderLight ${tint} opacity-20`}>···</td>
                              <td className={`px-0.5 text-center text-text-muted ${tint} opacity-20`}>··</td>
                              <td className={`px-0.5 text-center text-text-muted ${tint} opacity-20`}>···</td>
                              <td className={`px-0.5 text-center text-text-muted ${tint} opacity-20`}>··</td>
                            </React.Fragment>
                          );
                        }

                        if (cell.kind === 'noteOff') {
                          return (
                            <React.Fragment key={`${col.channel}.${col.voice}.off`}>
                              <td
                                className={`px-1 text-center text-text-muted border-l border-dark-borderLight ${tint}`}
                                colSpan={4}
                              >
                                ===
                              </td>
                            </React.Fragment>
                          );
                        }

                        // noteOn
                        const isEditingVel = cellEdit?.eventIndex === cell.eventIndex && cellEdit.field === 'velocity';
                        const isEditingDur = cellEdit?.eventIndex === cell.eventIndex && cellEdit.field === 'duration';
                        const isEditingOff = cellEdit?.eventIndex === cell.eventIndex && cellEdit.field === 'offset';

                        return (
                          <React.Fragment key={`${col.channel}.${col.voice}.on`}>
                            {/* Pitch */}
                            <td className={`px-1 text-center border-l border-dark-borderLight ${tint} text-accent-highlight whitespace-nowrap`}>
                              {midiNoteName(cell.pitch)}
                            </td>
                            {/* Velocity */}
                            <td
                              className={`px-0.5 text-center ${tint} text-accent-secondary cursor-text`}
                              onDoubleClick={() => setCellEdit({ eventIndex: cell.eventIndex, field: 'velocity', value: String(cell.velocity) })}
                            >
                              {isEditingVel ? (
                                <input
                                  autoFocus
                                  className="w-8 bg-dark-bgTertiary border border-accent-primary rounded text-text-primary font-mono text-[10px] px-0.5 text-center"
                                  value={cellEdit!.value}
                                  onChange={e => setCellEdit(s => s ? { ...s, value: e.target.value } : s)}
                                  onBlur={commitCellEdit}
                                  onKeyDown={handleFieldKeyDown}
                                />
                              ) : (
                                cell.velocity
                              )}
                            </td>
                            {/* Duration */}
                            <td
                              className={`px-0.5 text-center ${tint} text-text-secondary cursor-text`}
                              onDoubleClick={() => setCellEdit({ eventIndex: cell.eventIndex, field: 'duration', value: String(cell.duration) })}
                            >
                              {isEditingDur ? (
                                <input
                                  autoFocus
                                  className="w-10 bg-dark-bgTertiary border border-accent-primary rounded text-text-primary font-mono text-[10px] px-0.5 text-center"
                                  value={cellEdit!.value}
                                  onChange={e => setCellEdit(s => s ? { ...s, value: e.target.value } : s)}
                                  onBlur={commitCellEdit}
                                  onKeyDown={handleFieldKeyDown}
                                />
                              ) : (
                                cell.duration
                              )}
                            </td>
                            {/* Offset */}
                            <td
                              className={`px-0.5 text-center ${tint} text-text-muted cursor-text`}
                              onDoubleClick={() => setCellEdit({ eventIndex: cell.eventIndex, field: 'offset', value: String(cell.offset) })}
                            >
                              {isEditingOff ? (
                                <input
                                  autoFocus
                                  className="w-8 bg-dark-bgTertiary border border-accent-primary rounded text-text-primary font-mono text-[10px] px-0.5 text-center"
                                  value={cellEdit!.value}
                                  onChange={e => setCellEdit(s => s ? { ...s, value: e.target.value } : s)}
                                  onBlur={commitCellEdit}
                                  onKeyDown={handleFieldKeyDown}
                                />
                              ) : (
                                cell.offset !== 0 ? cell.offset : <span className="opacity-30">0</span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {/* Per-channel FX */}
                      <td className={`px-1 text-center border-l border-dark-borderLight border-r border-dark-border ${tint} text-accent-warning whitespace-nowrap`}>
                        {chFx
                          ? effectToken(chFx)
                          : <span className="text-text-muted opacity-20">···</span>
                        }
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
