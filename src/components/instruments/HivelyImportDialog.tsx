/**
 * HivelyImportDialog — Pick instruments from a .hvl or .ahx file and import
 * them into the current song.
 */
import React, { useState } from 'react';
import type { HivelyConfig } from '@typedefs/instrument';
import { extractInstrumentsFromHvl } from '@lib/import/formats/HivelyParser';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';
import { PatchLoadButton } from './controls/PatchLoadButton';

interface HivelyImportEntry {
  name: string;
  config: HivelyConfig;
  selected: boolean;
}

interface HivelyImportDialogProps {
  onClose: () => void;
  /** Called with the selected instruments in order; caller inserts them. */
  onImport: (instruments: Array<{ name: string; config: HivelyConfig }>) => void;
}

export const HivelyImportDialog: React.FC<HivelyImportDialogProps> = ({ onClose, onImport }) => {
  const [entries, setEntries] = useState<HivelyImportEntry[]>([]);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = (buffer: ArrayBuffer, fileName: string) => {
    setFilename(fileName);
    try {
      const found = extractInstrumentsFromHvl(buffer);
      setEntries(found.map(i => ({ ...i, selected: false })));
      setError(null);
    } catch (err) {
      setEntries([]);
      setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleAll = (selected: boolean) => {
    setEntries(prev => prev.map(e => ({ ...e, selected })));
  };

  const handleConfirm = () => {
    const selected = entries.filter(e => e.selected).map(({ name, config }) => ({ name, config }));
    if (selected.length > 0) onImport(selected);
    onClose();
  };

  useDialogKeyboard({ isOpen: true, onConfirm: handleConfirm, onCancel: onClose });

  const selectedCount = entries.filter(e => e.selected).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99990]" onClick={onClose}>
      <div
        className="bg-ft2-bg border border-ft2-border p-4 rounded min-w-[340px] max-w-[500px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-ft2-highlight font-mono font-bold text-sm mb-3">
          Import Instruments from HVL / AHX
        </h2>

        <div className="mb-3">
          <PatchLoadButton synthType="HivelySynth" onLoad={handleFile} label="Choose Song" />
        </div>

        {filename && !error && (
          <p className="text-ft2-textDim text-xs font-mono mb-2">{filename}</p>
        )}

        {error && (
          <p className="text-red-400 text-xs font-mono mb-2">{error}</p>
        )}

        {entries.length > 0 && (
          <>
            <div className="flex gap-2 mb-1">
              <button
                onClick={() => toggleAll(true)}
                className="text-xs text-ft2-highlight underline"
              >all</button>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs text-ft2-highlight underline"
              >none</button>
            </div>
            <div className="max-h-52 overflow-y-auto border border-ft2-border divide-y divide-ft2-border mb-3">
              {entries.map((entry, idx) => (
                <label
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-ft2-header select-none"
                >
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    onChange={() =>
                      setEntries(prev =>
                        prev.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x)
                      )
                    }
                    className="accent-ft2-highlight"
                  />
                  <span className="text-xs font-mono text-ft2-textDim w-5 shrink-0">
                    {(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs font-mono text-ft2-text truncate">
                    {entry.name || '(unnamed)'}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono text-ft2-text border border-ft2-border hover:border-ft2-highlight transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="px-3 py-1 text-xs font-mono bg-ft2-highlight text-ft2-bg disabled:opacity-40 disabled:cursor-default"
          >
            Import {selectedCount > 0 ? `(${selectedCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
