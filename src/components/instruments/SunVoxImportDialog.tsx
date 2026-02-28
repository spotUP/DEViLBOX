/**
 * SunVoxImportDialog — Import a .sunsynth or .sunvox file as a SunVox instrument.
 */
import React, { useState, useEffect } from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';

interface SunVoxImportDialogProps {
  onClose: () => void;
  /** Called with the instrument name and SunVoxConfig; caller creates the instrument. */
  onImport: (name: string, config: SunVoxConfig) => void;
  /** Pre-supplied file (from drag-drop). When set, skip the file picker. */
  initialFile?: File;
}

interface PendingImport {
  name: string;
  config: SunVoxConfig;
}

export const SunVoxImportDialog: React.FC<SunVoxImportDialogProps> = ({ onClose, onImport, initialFile }) => {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Auto-load the initial file when provided (drag-drop path)
  useEffect(() => {
    if (!initialFile) return;
    const load = async () => {
      setFilename(initialFile.name);
      try {
        const buffer = await initialFile.arrayBuffer();
        const name = initialFile.name.replace(/\.(sunsynth|sunvox)$/i, '');
        const config: SunVoxConfig = {
          patchData: buffer,
          patchName: name,
          isSong: initialFile.name.toLowerCase().endsWith('.sunvox'),
          controlValues: {},
        };
        setPending({ name, config });
        setError(null);
      } catch (err) {
        setPending(null);
        setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void load();
  }, [initialFile]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const name = file.name.replace(/\.(sunsynth|sunvox)$/i, '');
      const config: SunVoxConfig = {
        patchData: buffer,
        patchName: name,
        isSong: file.name.toLowerCase().endsWith('.sunvox'),
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

  const isSong = filename.toLowerCase().endsWith('.sunvox');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10050]" onClick={onClose}>
      <div
        className="bg-ft2-bg border border-ft2-border p-4 rounded min-w-[340px] max-w-[500px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-ft2-highlight font-mono font-bold text-sm mb-3">
          {isSong ? 'Import SunVox Song as Instrument' : 'Import SunSynth Patch'}
        </h2>

        {!initialFile && (
          <input
            type="file"
            accept=".sunsynth,.sunvox"
            onChange={handleFile}
            className="block w-full mb-3 text-ft2-text text-xs font-mono cursor-pointer"
          />
        )}

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
