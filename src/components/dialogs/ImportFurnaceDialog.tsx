/**
 * ImportFurnaceDialog — Import dialog for Furnace (.fur) and DefleMask (.dmf) files.
 *
 * Parses the file locally with parseFurnaceSong() to extract rich metadata before
 * committing to the import.  Displays chip system, author, subsong list, and lets
 * the user choose which subsong to import.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Cpu, FileAudio, AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/Button';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from './ImportModuleDialog';
import type { FurnaceModule } from '@lib/import/formats/FurnaceSongParser';

interface ImportFurnaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
}

// ── Chip name lookup (from Furnace system IDs) ─────────────────────────────
// Covers the most common chip IDs. Unrecognised IDs fall back to hex string.
const CHIP_NAMES: Record<number, string> = {
  0x00: 'None',
  0x01: 'YMU759',
  0x02: 'Genesis (YM2612+SN76489)',
  0x03: 'SMS (SN76489)',
  0x04: 'Game Boy (DMG)',
  0x05: 'PC Engine (HuC6280)',
  0x06: 'NES (2A03)',
  0x07: 'C64 (6581)',
  0x08: 'Amiga (Paula)',
  0x09: 'YM2151',
  0x0A: 'YM2612',
  0x0B: 'TIA',
  0x0C: 'SAA1099',
  0x0D: 'AY-3-8910',
  0x0E: 'AY8930',
  0x0F: 'POKEY',
  0x10: 'QSound',
  0x11: 'ZX Spectrum Beeper',
  0x12: 'YM2203',
  0x13: 'YM2608',
  0x14: 'YM2610',
  0x15: 'YM2610B',
  0x16: 'YM2610B (OPN2C variant)',
  0x17: 'SMS + YM2413',
  0x18: 'NeoGeo (YM2610+SSG)',
  0x19: 'MSX (AY-3-8910)',
  0x1A: 'OPL (YM3526)',
  0x1B: 'OPL2 (YM3812)',
  0x1C: 'OPL3 (YMF262)',
  0x1D: 'MultiPCM',
  0x1E: 'PC Speaker',
  0x1F: 'Dummy System',
  0x20: 'YM2413',
  0x21: 'SN76489 (extra)',
  0x22: 'OPN2 (YM2612)',
  0x23: 'OPM (YM2151)',
  0x24: 'NES + VRC6',
  0x25: 'NES + VRC7',
  0x26: 'NES + FDS',
  0x27: 'NES + MMC5',
  0x28: 'NES + Namco 163',
  0x29: 'NES + Sunsoft 5B',
  0x2A: 'SNES (SPC700)',
  0x2B: 'Virtual Boy (VSU)',
  0x2C: 'MSX + SCC',
  0x2D: 'RF5C68',
  0x2E: 'WonderSwan',
  0x2F: 'Coleco ColecoVision (SN76489)',
  0x30: 'OPL4 (YMF278)',
  0x31: 'OPLL (YM2413)',
  0x32: 'NES (extra)',
  0x33: 'OPN (YM2203, extra)',
  0x34: 'PC-88 (OPNA+SSG)',
  0x35: 'GBA (Direct Sound)',
  0x36: 'KurumiOscillator',
  0x37: 'OPL2 (4-op)',
  0x38: 'OPL3 (4-op)',
  0x39: 'YM2610',
  0x3A: 'ZX Spectrum AY',
  0x3B: 'SCC+',
  0x42: 'C64 (8580)',
  0x43: 'YM2612 (Ext. Ch3)',
  0x46: 'GBC (extra)',
  0x47: 'PC-98 (OPNA)',
  0x48: 'Lynx',
  0x4A: 'OPZ (YM2414)',
  0x4C: 'X1-010',
  0x4D: 'VERA',
  0x4F: 'Sega PCM',
  0x50: 'Namco 163',
  0x53: 'ESFM',
  0xAA: 'Sega Master System',
};

function getChipName(id: number): string {
  return CHIP_NAMES[id] ?? `Chip 0x${id.toString(16).toUpperCase()}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ImportFurnaceDialog: React.FC<ImportFurnaceDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  const [module, setModule]           = useState<FurnaceModule | null>(null);
  const [moduleBuffer, setModuleBuffer] = useState<ArrayBuffer | null>(null);
  const [moduleFile, setModuleFile]   = useState<File | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
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
      const { parseFurnaceSong } = await import('@lib/import/formats/FurnaceSongParser');
      const parsed = await parseFurnaceSong(buf);
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
        channels: module.chans,
        patterns: module.patterns.size,
        orders: module.subsongs[selectedSubsong]?.ordersLen ?? 0,
        instruments: module.instruments.length,
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

  const subsong = module?.subsongs[selectedSubsong] ?? module?.subsongs[0];
  const bpm = subsong
    ? Math.round(2.5 * (subsong.hz || 60) * ((subsong.virtualTempo || 150) / (subsong.virtualTempoD || 150)))
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[500px] max-h-[85vh] overflow-hidden flex flex-col">

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
                <p className="text-sm text-text-muted">Parsing Furnace file…</p>
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
                    Furnace v{module.version}
                  </span>
                </div>

                {/* Chip / system */}
                {module.systems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {module.systems.map((chipId, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-dark-bgSecondary border border-dark-border rounded"
                      >
                        <Cpu size={10} className="text-accent-primary" />
                        {getChipName(chipId)}
                        {module.systemChans[i] ? (
                          <span className="text-text-muted">{module.systemChans[i]}ch</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-text-muted">Channels</span>
                    <span className="text-text-primary font-mono">{module.chans}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Instruments</span>
                    <span className="text-text-primary font-mono">{module.instruments.length}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Samples</span>
                    <span className="text-text-primary font-mono">{module.samples.length}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-text-muted">Subsongs</span>
                    <span className="text-text-primary font-mono">{module.subsongs.length}</span>
                  </div>
                  {subsong && (
                    <>
                      <div className="flex flex-col">
                        <span className="text-text-muted">Pattern len</span>
                        <span className="text-text-primary font-mono">{subsong.patLen} rows</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-text-muted">BPM</span>
                        <span className="text-text-primary font-mono">{bpm} @ {subsong.hz}Hz</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Song comment */}
                {module.comment && (
                  <div className="text-xs text-text-muted bg-dark-bgSecondary p-2 rounded max-h-20 overflow-y-auto font-mono whitespace-pre-wrap border border-dark-border/50">
                    {module.comment}
                  </div>
                )}
              </div>

              {/* Subsong picker */}
              {module.subsongs.length > 1 && (
                <div className="bg-dark-bg rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-text-primary">Import Subsong</p>
                  <div className="relative">
                    <select
                      value={selectedSubsong}
                      onChange={(e) => setSelectedSubsong(Number(e.target.value))}
                      className="w-full text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-2 pr-8 text-text-primary appearance-none cursor-pointer"
                    >
                      {module.subsongs.map((ss, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {ss.name || `Subsong ${i + 1}`}
                          {i === 0 ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                  {subsong?.comment && (
                    <p className="text-xs text-text-muted italic">{subsong.comment}</p>
                  )}
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
