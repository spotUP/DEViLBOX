/**
 * SunVoxImportDialog — Pick a single .sunsynth file and import it as a SunVox instrument.
 */
import React, { useState } from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';

interface SunVoxImportDialogProps {
  onClose: () => void;
  /** Called with the instrument name and SunVoxConfig; caller creates the instrument. */
  onImport: (name: string, config: SunVoxConfig) => void;
}

interface PendingImport {
  name: string;
  config: SunVoxConfig;
}

export const SunVoxImportDialog: React.FC<SunVoxImportDialogProps> = ({ onClose, onImport }) => {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const name = file.name.replace(/\.sunsynth$/i, '');
      const config: SunVoxConfig = {
        patchData: buffer,
        patchName: name,
        controlValues: {},
      };
      setPending({ name, config });
      setError(null);
    } catch (err) {
      setPending(null);
      setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleImport = () => {
    if (!pending) return;
    onImport(pending.name, pending.config);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ft2-bg border border-ft2-border p-4 rounded min-w-[340px] max-w-[500px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-ft2-highlight font-mono font-bold text-sm mb-3">
          Import Instrument from SunSynth
        </h2>

        <input
          type="file"
          accept=".sunsynth"
          onChange={handleFile}
          className="block w-full mb-3 text-ft2-text text-xs font-mono cursor-pointer"
        />

        {filename && !error && (
          <p className="text-ft2-textDim text-xs font-mono mb-2">{filename}</p>
        )}

        {error && (
          <p className="text-red-400 text-xs font-mono mb-2">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono text-ft2-text border border-ft2-border hover:border-ft2-highlight transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={pending === null}
            className="px-3 py-1 text-xs font-mono bg-ft2-highlight text-ft2-bg disabled:opacity-40 disabled:cursor-default"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};
