/**
 * InstrumentTableEditor - the one table editor for an instrument's step list (a klystrack program, an arpeggio
 * table). A thin wrapper over PatternEditorCanvas in format mode: one non-pattern channel, no VU meters, the
 * shared format keyboard (hex entry, cursor, copy/paste, read-only columns). The ARP_COLUMN copies in the
 * instrument controls take the same props when they migrate.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { PatternEditorCanvas } from '@components/tracker/PatternEditorCanvas';
import { Button } from '@components/ui/Button';
import { SectionLabel } from './SectionLabel';
import type { ColumnDef, FormatCell, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export interface InstrumentTableEditorProps {
  label: string;
  columns: ColumnDef[];
  rows: FormatCell[];
  /** The step an engine is playing now. Undefined: nothing plays and the cursor row is shown. */
  playingRow?: number;
  onCellChange: OnCellChange;
  /** The row the cursor is on, reported as it moves (for a description of the step under the cursor). */
  onCursorRow?: (row: number) => void;
  onInsertRow?: (row: number) => void;
  onDeleteRow?: (row: number) => void;
  /** Canvas height in px (default 320). */
  height?: number;
}

export const InstrumentTableEditor: React.FC<InstrumentTableEditorProps> = ({
  label, columns, rows, playingRow, onCellChange, onCursorRow, onInsertRow, onDeleteRow, height = 320,
}) => {
  const channels = useMemo<FormatChannel[]>(
    () => [{ label, patternLength: rows.length, rows, isPatternChannel: false }],
    [label, rows],
  );
  const cursorRow = useRef(0);
  const onCursor = useCallback((c: { rowIndex: number }) => {
    cursorRow.current = c.rowIndex;
    onCursorRow?.(c.rowIndex);
  }, [onCursorRow]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel color="var(--color-accent-primary)" label={label} />
        {(onInsertRow || onDeleteRow) && (
          <div className="flex gap-1">
            {onInsertRow && <Button size="sm" onClick={() => onInsertRow(cursorRow.current)}>Insert Step</Button>}
            {onDeleteRow && <Button size="sm" onClick={() => onDeleteRow(cursorRow.current)}>Delete Step</Button>}
          </div>
        )}
      </div>
      <div className="border border-dark-border rounded bg-dark-bg" style={{ height }}>
        <PatternEditorCanvas
          formatColumns={columns}
          formatChannels={channels}
          formatCurrentRow={playingRow ?? 0}
          formatIsPlaying={playingRow !== undefined}
          onFormatCellChange={onCellChange}
          onFormatCursorChange={onCursor}
          hideVUMeters={true}
        />
      </div>
    </div>
  );
};
