/**
 * GTUltraTableStudioModal — opens the Waveform Studio for a GT Ultra table.
 *
 * GoatTracker tables have 255 entries with left+right columns. For the
 * wave table, the LEFT column is the waveform shape (we edit that);
 * for pulse/filter/speed the same pattern applies for their respective
 * parameter sequences.
 *
 * This modal adapts the Uint8Array view into a `WavetableData` that
 * the `WavetableEditor` component understands, then commits changes
 * back via `engine.setTableEntry(type, row, left, right)`.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { WavetableEditor, type WavetableData } from '../instruments/editors/WavetableEditor';
import { useGTUltraStore, type GTTableData } from '../../stores/useGTUltraStore';
import { useModalClose } from '@hooks/useDialogKeyboard';

interface GTUltraTableStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableType: 'wave' | 'pulse' | 'filter' | 'speed';
  /** Which column to edit (0=left, 1=right). Defaults to left. */
  column?: 0 | 1;
}

const TABLE_TYPE_INDEX: Record<string, number> = {
  wave: 0, pulse: 1, filter: 2, speed: 3,
};

export const GTUltraTableStudioModal: React.FC<GTUltraTableStudioModalProps> = ({
  isOpen, onClose, tableType, column = 0,
}) => {
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);

  // Build a WavetableData snapshot from the GT table's chosen column.
  // Local state lets us edit without racing the store.
  const initial = useMemo<WavetableData>(() => {
    const table: GTTableData = tableData[tableType] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
    const source = column === 0 ? table.left : table.right;
    return {
      id: 0,
      data: Array.from(source),
      len: 255,
      max: 255,
    };
  }, [tableData, tableType, column]);

  const [local, setLocal] = useState<WavetableData>(initial);

  // Reset local state when modal re-opens (or when the source changes)
  React.useEffect(() => {
    if (isOpen) setLocal(initial);
  }, [isOpen, initial]);

  useModalClose({ isOpen, onClose });

  const handleCommit = useCallback(() => {
    if (!engine) return;
    const typeIdx = TABLE_TYPE_INDEX[tableType];
    const table: GTTableData = tableData[tableType] ?? { left: new Uint8Array(255), right: new Uint8Array(255) };
    // Write each edited row back via the engine. The other column stays unchanged.
    for (let i = 0; i < 255; i++) {
      const left = column === 0 ? (local.data[i] ?? 0) : (table.left[i] ?? 0);
      const right = column === 1 ? (local.data[i] ?? 0) : (table.right[i] ?? 0);
      engine.setTableEntry(typeIdx, i, left, right);
    }
    engine.checkpointUndo();
    onClose();
  }, [engine, tableType, column, local, tableData, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
          <div>
            <h2 className="text-sm font-mono font-bold text-text-primary uppercase tracking-wider">
              Waveform Studio — GT Ultra {tableType} table ({column === 0 ? 'LEFT' : 'RIGHT'})
            </h2>
            <p className="text-[10px] font-mono text-text-muted">
              Edits commit back to the chip via engine.setTableEntry on save.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded text-text-muted hover:text-text-primary border border-dark-border"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <WavetableEditor
            wavetable={local}
            onChange={setLocal}
            initialLayout="studio"
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-dark-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-dark-bgSecondary text-text-muted hover:text-text-primary border border-dark-border"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-accent-highlight/20 text-accent-highlight hover:bg-accent-highlight/30 border border-accent-highlight/50"
          >
            Save to chip
          </button>
        </div>
      </div>
    </div>
  );
};
