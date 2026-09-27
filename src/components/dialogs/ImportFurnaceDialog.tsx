/**
 * ImportFurnaceDialog — Import dialog for Furnace (.fur) and DefleMask (.dmf) files.
 *
 * Reads the file with the same Furnace WASM loader the import uses, so the
 * preview accepts exactly what the import accepts — DefleMask files included —
 * and names each chip the way Furnace does. Displays chip system, author,
 * subsong list, and lets the user choose which subsong to import.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Cpu, FileAudio, AlertCircle } from 'lucide-react';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from './ImportModuleDialog';
import { loadFurFileWasm } from '@lib/import/wasm/FurnaceFileOps';
import { useModalClose } from '@hooks/useDialogKeyboard';

interface ImportFurnaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
}

type FurnacePreview = Awaited<ReturnType<typeof loadFurFileWasm>>;

// ── Component ──────────────────────────────────────────────────────────────

export const ImportFurnaceDialog: React.FC<ImportFurnaceDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  useModalClose({ isOpen, onClose });
  const [module, setModule]           = useState<FurnacePreview | null>(null);
  const [moduleBuffer, setModuleBuffer] = useState<ArrayBuffer | null>(null);
  const [moduleFile, setModuleFile]   = useState<File | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
  const [format, setFormat]           = useState('Furnace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!/\.(fur|dmf)$/i.test(file.name)) {
      setError('Please select a Furnace (.fur) or DefleMask (.dmf) file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setModule(null);
    setModuleBuffer(null);
    setModuleFile(null);
    setSelectedSubsong(0);

    try {
      const buf = await file.arrayBuffer();
      const parsed = await loadFurFileWasm(buf);
      setFormat(/\.dmf$/i.test(file.name) ? 'DefleMask' : 'Furnace');
      setModule(parsed);
      setModuleBuffer(buf);
      setModuleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse Furnace file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(() => {
    if (!module || !moduleBuffer || !moduleFile) return;
    const info: ModuleInfo = {
      metadata: {
        title: module.name || moduleFile.name.replace(/\.[^/.]+$/, ''),
        type: 'Furnace',
        channels: module.numChannels,
        patterns: module.nativeData.subsongs[selectedSubsong]?.ordersLen ?? 0,
        orders: module.nativeData.subsongs[selectedSubsong]?.ordersLen ?? 0,
        instruments: module.instrumentBinaries.length,
        samples: module.samples.length,
        duration: 0,
      },
      arrayBuffer: moduleBuffer,
      file: moduleFile,
    };
    onImport(info, { useLibopenmpt: false, subsong: selectedSubsong });
    onClose();
  }, [module, moduleBuffer, moduleFile, selectedSubsong, onImport, onClose]);

  const handleClose = useCallback(() => {
    setModule(null);
    setModuleBuffer(null);
    setModuleFile(null);
    setError(null);
    setSelectedSubsong(0);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const subsongs = module?.nativeData.subsongs ?? [];
  const subsong = subsongs[selectedSubsong] ?? subsongs[0];
  const bpm = subsong
    ? Math.round(2.5 * (subsong.hz || 60) * ((subsong.virtualTempoN || 150) / (subsong.virtualTempoD || 150)))
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[99990]">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-full max-w-[90vw] md:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import Furnace Module</h2>
          </div>
          <Button variant="icon" size="icon" onClick={handleClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isLoading
                ? 'border-accent-primary/50 bg-accent-primary/5'
                : 'border-dark-border hover:border-accent-primary/50 hover:bg-dark-bgHover'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".fur,.dmf"
              onChange={handleInputChange}
              className="hidden"
            />
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Reading file…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileAudio size={32} className="text-text-muted" />
                <p className="text-sm text-text-primary">Drop a .fur or .dmf file here or click to browse</p>
                <p className="text-xs text-text-muted">Furnace tracker and DefleMask modules</p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Module metadata */}
          {module && (
            <>
              {/* Title + system badge */}
              <div className="bg-dark-bg rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary truncate">{module.name || moduleFile?.name.replace(/\.[^/.]+$/, '')}</p>
                    {module.author && (
                      <p className="text-xs text-text-muted mt-0.5">by {module.author}</p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded flex-shrink-0">
                    {format}
                  </span>
                </div>

                {/* Chip / system */}
                {module.systemNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {module.systemNames.map((chipName, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-dark-bgSecondary border border-dark-border rounded"
                      >
                        <Cpu size={10} className="text-accent-primary" />
                        {chipName}
                        {module.nativeData.systemChans?.[i] ? (
                          <span className="text-text-muted">{module.nativeData.systemChans[i]} channels</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-text-muted">Channels</span>
                    <span className="text-text-primary font-mono">{module.numChannels}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Instruments</span>
                    <span className="text-text-primary font-mono">{module.instrumentBinaries.length}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Samples</span>
                    <span className="text-text-primary font-mono">{module.samples.length}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Subsongs</span>
                    <span className="text-text-primary font-mono">{subsongs.length}</span>
                  </div>
                  {subsong && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-text-muted">Pattern Length</span>
                        <span className="text-text-primary font-mono">{subsong.patLen} rows</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-text-muted">BPM</span>
                        <span className="text-text-primary font-mono">{bpm} @ {subsong.hz}Hz</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Subsong picker */}
              {subsongs.length > 1 && (
                <div className="bg-dark-bg rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-text-primary">Import Subsong</p>
                  <CustomSelect
                    value={String(selectedSubsong)}
                    onChange={(v) => setSelectedSubsong(Number(v))}
                    options={subsongs.map((ss, i) => ({
                      value: String(i),
                      label: `${i + 1}. ${ss.name || `Subsong ${i + 1}`}${i === 0 ? ' (default)' : ''}`,
                    }))}
                    className="w-full text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-2 text-text-primary cursor-pointer"
                  />
                </div>
              )}

              {/* Info note */}
              <p className="text-xs text-text-muted">
                Furnace files are always imported using the native parser. Chip-specific instruments
                (FM, PSG, Amiga, etc.) are preserved and routed to their original synthesis engines.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!module}>
            Import Module
          </Button>
        </div>
      </div>
    </div>
  );
};
