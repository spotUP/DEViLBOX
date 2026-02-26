/**
 * ImportMIDIDialog — Import dialog for Standard MIDI Files (.mid/.midi).
 *
 * Parses the file locally with @tonejs/midi to extract metadata (BPM, tracks,
 * time signature) before committing to the import.  Exposes the four MIDI import
 * options: quantize grid, merge channels, velocity→volume, and pattern length.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Music, FileAudio, AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/Button';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from './ImportModuleDialog';
import type { MIDIImportOptions } from '@lib/import/MIDIImporter';

interface MIDIPreview {
  bpm: number;
  timeSignature: [number, number];
  tracks: number;
  totalSeconds: number;
  name: string;
}

interface ImportMIDIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
}

const QUANTIZE_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: '1 row' },
  { value: 2, label: '2 rows (½ beat)' },
  { value: 4, label: '4 rows (1 beat)' },
  { value: 8, label: '8 rows (2 beats)' },
];

const PATTERN_LENGTH_OPTIONS = [32, 64, 128, 256];

// ── Component ──────────────────────────────────────────────────────────────

export const ImportMIDIDialog: React.FC<ImportMIDIDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  const [preview, setPreview]       = useState<MIDIPreview | null>(null);
  const [moduleFile, setModuleFile] = useState<File | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // MIDI import options
  const [quantize, setQuantize]                   = useState(1);
  const [mergeChannels, setMergeChannels]         = useState(false);
  const [velocityToVolume, setVelocityToVolume]   = useState(true);
  const [patternLength, setPatternLength]         = useState(64);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!/\.(mid|midi)$/i.test(file.name)) {
      setError('Please select a MIDI file (.mid or .midi).');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);
    setModuleFile(null);

    try {
      const buf = await file.arrayBuffer();
      const { Midi } = await import('@tonejs/midi');
      const midi = new Midi(buf);

      const bpm = midi.header.tempos.length > 0
        ? Math.round(midi.header.tempos[0].bpm)
        : 120;
      const timeSig: [number, number] = midi.header.timeSignatures.length > 0
        ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]]
        : [4, 4];

      setPreview({
        bpm,
        timeSignature: timeSig,
        tracks: midi.tracks.length,
        totalSeconds: Math.round(midi.duration),
        name: file.name.replace(/\.[^/.]+$/, ''),
      });
      setModuleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse MIDI file');
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
    if (!moduleFile || !preview) return;

    const midiOptions: MIDIImportOptions = {
      quantize,
      mergeChannels,
      velocityToVolume,
      defaultPatternLength: patternLength,
    };

    const info: ModuleInfo = {
      metadata: {
        title: preview.name,
        type: 'MIDI',
        channels: preview.tracks,
        patterns: 0,
        orders: 0,
        instruments: 0,
        samples: 0,
        duration: preview.totalSeconds,
      },
      arrayBuffer: new ArrayBuffer(0), // not used — parseMIDIFile re-reads from file
      file: moduleFile,
    };

    onImport(info, { useLibopenmpt: false, midiOptions });
    onClose();
  }, [moduleFile, preview, quantize, mergeChannels, velocityToVolume, patternLength, onImport, onClose]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setModuleFile(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const duration = preview
    ? `${Math.floor(preview.totalSeconds / 60)}:${String(preview.totalSeconds % 60).padStart(2, '0')}`
    : '0:00';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[480px] max-h-[85vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Music size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import MIDI File</h2>
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
              accept=".mid,.midi"
              onChange={handleInputChange}
              className="hidden"
            />
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Parsing MIDI file…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileAudio size={32} className="text-text-muted" />
                <p className="text-sm text-text-primary">Drop a .mid or .midi file here or click to browse</p>
                <p className="text-xs text-text-muted">Standard MIDI Format 0 and 1</p>
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

          {/* File preview */}
          {preview && (
            <div className="bg-dark-bg rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-text-primary truncate">{preview.name}</p>
                <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded flex-shrink-0">
                  MIDI
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-text-muted">BPM</span>
                  <span className="text-text-primary font-mono">{preview.bpm}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-text-muted">Time sig</span>
                  <span className="text-text-primary font-mono">{preview.timeSignature[0]}/{preview.timeSignature[1]}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-text-muted">Tracks</span>
                  <span className="text-text-primary font-mono">{preview.tracks}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-text-muted">Duration</span>
                  <span className="text-text-primary font-mono">{duration}</span>
                </div>
              </div>
            </div>
          )}

          {/* Import options */}
          <div className="bg-dark-bg rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-text-primary">Import Options</p>

            {/* Quantize */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-primary">Quantize</p>
                <p className="text-xs text-text-muted">Snap notes to grid</p>
              </div>
              <div className="relative">
                <select
                  value={quantize}
                  onChange={(e) => setQuantize(Number(e.target.value))}
                  className="text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-1.5 pr-7 text-text-primary appearance-none cursor-pointer"
                >
                  {QUANTIZE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Pattern length */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-text-primary">Pattern Length</p>
                <p className="text-xs text-text-muted">Rows per pattern</p>
              </div>
              <div className="relative">
                <select
                  value={patternLength}
                  onChange={(e) => setPatternLength(Number(e.target.value))}
                  className="text-sm bg-dark-bgSecondary border border-dark-border rounded px-3 py-1.5 pr-7 text-text-primary appearance-none cursor-pointer"
                >
                  {PATTERN_LENGTH_OPTIONS.map(len => (
                    <option key={len} value={len}>{len} rows</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Velocity to Volume */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-text-primary">Velocity → Volume</p>
                <p className="text-xs text-text-muted">Map note velocity to tracker volume column</p>
              </div>
              <input
                type="checkbox"
                checked={velocityToVolume}
                onChange={(e) => setVelocityToVolume(e.target.checked)}
                className="w-4 h-4 accent-accent-primary"
              />
            </label>

            {/* Merge Channels */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-text-primary">Merge Channels</p>
                <p className="text-xs text-text-muted">Combine all MIDI channels into fewer tracker channels</p>
              </div>
              <input
                type="checkbox"
                checked={mergeChannels}
                onChange={(e) => setMergeChannels(e.target.checked)}
                className="w-4 h-4 accent-accent-primary"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!moduleFile}>
            <Upload size={14} className="mr-1" />
            Import MIDI
          </Button>
        </div>
      </div>
    </div>
  );
};
