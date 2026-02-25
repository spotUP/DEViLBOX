/**
 * ImportModuleDialog - Dialog for importing MOD/XM/IT/S3M tracker files
 * Uses chiptune3/libopenmpt for parsing and playback preview
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Play, Square, Music, FileAudio, AlertCircle, Info } from 'lucide-react';
import { Button } from '@components/ui/Button';
import {
  loadModuleFile,
  previewModule,
  stopPreview,
  getSupportedExtensions,
  isSupportedModule,
  type ModuleInfo,
} from '@lib/import/ModuleLoader';
import { isUADEFormat } from '@lib/import/formats/UADEParser';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@engine/uade/UADEEngine';

export interface ImportOptions {
  useLibopenmpt: boolean;     // Use libopenmpt for sample-accurate playback
  subsong?: number;           // UADE subsong index (0-based)
  uadeMetadata?: UADEMetadata; // Pre-scanned UADE metadata (avoids double scan on import)
}

interface ImportModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null; // Pre-loaded file (from drag-drop)
}

// ── Format detection ──────────────────────────────────────────────────────────

type NativeFormatKey = 'fc' | 'soundmon' | 'sidmon2' | 'fred' | 'soundfx' | 'mugician';

const NATIVE_FORMAT_PATTERNS: Array<{ key: NativeFormatKey; regex: RegExp; label: string; description: string }> = [
  { key: 'fc',       regex: /\.(fc|fc2|fc3|fc4|fc13|fc14|sfc|smod|bfc|bsi)$/i, label: 'Future Composer', description: 'Handles FC 1.3/1.4. FC2 auto-falls back to UADE.' },
  { key: 'soundmon', regex: /\.(bp|bp3|sndmon)$/i,                              label: 'SoundMon',        description: 'Brian Postma\'s SoundMon V1/V2/V3.' },
  { key: 'sidmon2',  regex: /\.(sid2|smn)$/i,                                   label: 'SidMon II',       description: 'SidMon II — MIDI version.' },
  { key: 'fred',     regex: /\.fred$/i,                                          label: 'Fred Editor',     description: 'Fred Editor by Software of Sweden.' },
  { key: 'soundfx',  regex: /\.(sfx|sfx13)$/i,                                  label: 'Sound-FX',        description: 'Sound-FX v1.0 and v2.0.' },
  { key: 'mugician', regex: /\.(dmu|dmu2|mug|mug2)$/i,                          label: 'Digital Mugician', description: 'Digital Mugician V1/V2 by Rob Hubbard.' },
];

function detectNativeFormat(filename: string): (typeof NATIVE_FORMAT_PATTERNS)[number] | null {
  return NATIVE_FORMAT_PATTERNS.find(f => f.regex.test(filename)) ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ImportModuleDialog: React.FC<ImportModuleDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  const [moduleInfo, setModuleInfo]     = useState<ModuleInfo | null>(null);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [useLibopenmpt, setUseLibopenmpt] = useState(true);
  const [uadeMetadata, setUadeMetadata] = useState<UADEMetadata | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track whether a UADE scan is in-flight so handleClose can cancel it
  const uadeScanActiveRef = useRef(false);

  const formatEngine   = useSettingsStore((s) => s.formatEngine);
  const setFormatEngine = useSettingsStore((s) => s.setFormatEngine);

  // Derived format state
  const nativeFmt  = detectNativeFormat(loadedFileName);
  const isUADE     = !nativeFmt && isUADEFormat(loadedFileName);
  const isNativeSelected = nativeFmt ? (formatEngine[nativeFmt.key] as string) !== 'uade' : false;
  const uadeMode   = formatEngine.uade ?? 'enhanced';

  const handleFileSelect = useCallback(async (file: File) => {
    if (!isSupportedModule(file.name)) {
      setError(`Unsupported file format. Supported: ${getSupportedExtensions().slice(0, 5).join(', ')}...`);
      return;
    }

    const fname = file.name.toLowerCase();
    const nativeFmtForFile = detectNativeFormat(fname);
    const isUADEExclusive = !nativeFmtForFile && isUADEFormat(fname);

    setIsLoading(true);
    setError(null);
    setModuleInfo(null);
    setUadeMetadata(null);
    setSelectedSubsong(0);
    setLoadedFileName(fname);

    if (isUADEExclusive) {
      // UADE-exclusive format: libopenmpt cannot parse it; use UADEEngine directly
      try {
        const buf = await file.arrayBuffer();
        const { UADEEngine } = await import('@engine/uade/UADEEngine');
        const engine = UADEEngine.getInstance();
        await engine.ready();
        uadeScanActiveRef.current = true;
        const uadeMeta = await engine.load(buf, file.name);
        setUadeMetadata(uadeMeta);
        // Create a minimal ModuleInfo so the Import button is enabled
        setModuleInfo({
          metadata: {
            title: file.name.replace(/\.[^/.]+$/, ''),
            type: uadeMeta.formatName || 'UADE',
            channels: 4,
            patterns: 1,
            orders: uadeMeta.subsongCount,
            instruments: 0,
            samples: 0,
            duration: 0,
          },
          arrayBuffer: buf,
          file,
        });
      } catch (err) {
        // Don't show "Scan cancelled" as an error — that's expected from handleClose
        if (!(err instanceof Error && err.message === 'Scan cancelled')) {
          setError(err instanceof Error ? err.message : 'Failed to load UADE format');
        }
      } finally {
        uadeScanActiveRef.current = false;
        setIsLoading(false);
      }
      return;
    }

    // Standard path: libopenmpt (MOD, XM, IT, S3M, HVL, OKT, MED, native FC, etc.)
    try {
      const info = await loadModuleFile(file);
      setModuleInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load module');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load file if provided (from drag-drop)
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

  const handlePreview = useCallback(() => {
    if (!moduleInfo) return;
    if (isPlaying) {
      stopPreview(moduleInfo);
      setIsPlaying(false);
    } else {
      previewModule(moduleInfo);
      setIsPlaying(true);
    }
  }, [moduleInfo, isPlaying]);

  const handleImport = useCallback(() => {
    if (!moduleInfo) return;
    if (isPlaying) {
      stopPreview(moduleInfo);
      setIsPlaying(false);
    }
    onImport(moduleInfo, { useLibopenmpt, subsong: selectedSubsong, uadeMetadata: uadeMetadata ?? undefined });
    onClose();
  }, [moduleInfo, isPlaying, onImport, onClose, useLibopenmpt, selectedSubsong]);

  const handleClose = useCallback(() => {
    if (moduleInfo && isPlaying) stopPreview(moduleInfo);
    // Cancel any in-flight UADE scan so it doesn't resolve after the dialog closes
    if (uadeScanActiveRef.current) {
      import('@engine/uade/UADEEngine').then(({ UADEEngine }) => {
        if (UADEEngine.hasInstance()) UADEEngine.getInstance().cancelLoad();
      }).catch(() => {});
    }
    setModuleInfo(null);
    setLoadedFileName('');
    setError(null);
    setIsPlaying(false);
    setUadeMetadata(null);
    setSelectedSubsong(0);
    onClose();
  }, [moduleInfo, isPlaying, onClose]);

  if (!isOpen) return null;

  // Whether to show UADE enhanced/classic sub-selector
  const showUADEModeSelector = isUADE || (nativeFmt && !isNativeSelected);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <FileAudio size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import Tracker Module</h2>
          </div>
          <Button variant="icon" size="icon" onClick={handleClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(80vh-110px)]">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isLoading ? 'border-accent-primary/50 bg-accent-primary/5' : 'border-dark-border hover:border-accent-primary/50 hover:bg-dark-bgHover'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={getSupportedExtensions().join(',')}
              onChange={handleInputChange}
              className="hidden"
            />
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Loading module...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={32} className="text-text-muted" />
                <p className="text-sm text-text-primary">Drop a tracker file here or click to browse</p>
                <p className="text-xs text-text-muted">Supports MOD, XM, IT, S3M and 20+ other formats</p>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Module info */}
          {moduleInfo && (
            <div className="bg-dark-bg rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music size={16} className="text-accent-primary" />
                  <span className="font-medium text-text-primary">{moduleInfo.metadata.title}</span>
                </div>
                <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">
                  {uadeMetadata ? (uadeMetadata.formatName || 'UADE') : moduleInfo.metadata.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {uadeMetadata ? (
                  // UADE-specific metadata
                  <>
                    <div className="flex justify-between text-text-muted">
                      <span>Player:</span>
                      <span className="text-text-primary font-mono">{uadeMetadata.player || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Subsongs:</span>
                      <span className="text-text-primary font-mono">{uadeMetadata.subsongCount}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Channels:</span>
                      <span className="text-text-primary font-mono">4 (Paula)</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Samples:</span>
                      <span className="text-text-primary font-mono">
                        {Object.keys(uadeMetadata.enhancedScan?.samples ?? {}).length}
                      </span>
                    </div>
                  </>
                ) : (
                  // Standard libopenmpt metadata
                  <>
                    <div className="flex justify-between text-text-muted">
                      <span>Channels:</span>
                      <span className="text-text-primary font-mono">{moduleInfo.metadata.channels}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Patterns:</span>
                      <span className="text-text-primary font-mono">{moduleInfo.metadata.patterns}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Instruments:</span>
                      <span className="text-text-primary font-mono">{moduleInfo.metadata.instruments}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Samples:</span>
                      <span className="text-text-primary font-mono">{moduleInfo.metadata.samples}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Orders:</span>
                      <span className="text-text-primary font-mono">{moduleInfo.metadata.orders}</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Duration:</span>
                      <span className="text-text-primary font-mono">
                        {Math.floor(moduleInfo.metadata.duration / 60)}:{String(Math.floor(moduleInfo.metadata.duration % 60)).padStart(2, '0')}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Subsong picker — shown when UADE pre-scan detected multiple subsongs */}
              {uadeMetadata && uadeMetadata.subsongCount > 1 && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-text-muted whitespace-nowrap">Import subsong:</label>
                  {uadeMetadata.subsongCount > 20 ? (
                    // Number input for formats with many subsongs (avoids rendering hundreds of options)
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        min={1}
                        max={uadeMetadata.subsongCount}
                        value={selectedSubsong + 1}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(uadeMetadata.subsongCount, Number(e.target.value)));
                          setSelectedSubsong(v - 1);
                        }}
                        className="w-20 text-xs bg-dark-bgSecondary border border-dark-border rounded px-2 py-1.5 text-text-primary"
                      />
                      <span className="text-xs text-text-muted">of {uadeMetadata.subsongCount}</span>
                    </div>
                  ) : (
                    <select
                      value={selectedSubsong}
                      onChange={(e) => setSelectedSubsong(Number(e.target.value))}
                      className="flex-1 text-xs bg-dark-bgSecondary border border-dark-border rounded px-2 py-1.5 text-text-primary"
                    >
                      {Array.from({ length: uadeMetadata.subsongCount }, (_, i) => (
                        <option key={i} value={i}>
                          {`Subsong ${i + 1}${i === 0 ? ' (default)' : ''}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {moduleInfo.metadata.message && (
                <div className="text-xs text-text-muted bg-dark-bgSecondary p-2 rounded max-h-20 overflow-y-auto font-mono whitespace-pre-wrap">
                  {moduleInfo.metadata.message}
                </div>
              )}

              {/* Preview button — hidden for UADE-exclusive formats (libopenmpt can't play them) */}
              {!uadeMetadata && (
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={handlePreview}
                  icon={isPlaying ? <Square size={14} /> : <Play size={14} />}
                  className={isPlaying ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}
                >
                  {isPlaying ? 'Stop Preview' : 'Preview'}
                </Button>
              )}
            </div>
          )}

          {/* ── Engine selector for formats with a native parser ── */}
          {moduleInfo && nativeFmt && (
            <div className="bg-dark-bg rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-text-primary">
                Import Engine — <span className="text-accent-primary">{nativeFmt.label}</span>
              </p>

              {/* Native parser option */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nativeEngine"
                  checked={isNativeSelected}
                  onChange={() => setFormatEngine(nativeFmt.key as keyof FormatEnginePreferences, 'native')}
                  className="mt-0.5 accent-accent-primary"
                />
                <div>
                  <span className="text-sm text-text-primary">Native Parser (Fully Editable)</span>
                  <p className="text-xs text-text-muted">{nativeFmt.description}</p>
                </div>
              </label>

              {/* UADE option */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nativeEngine"
                  checked={!isNativeSelected}
                  onChange={() => setFormatEngine(nativeFmt.key as keyof FormatEnginePreferences, 'uade')}
                  className="mt-0.5 accent-accent-primary"
                />
                <div>
                  <span className="text-sm text-text-primary">UADE (Amiga Emulation)</span>
                  <p className="text-xs text-text-muted">Use UADE emulator instead of native parser.</p>
                </div>
              </label>

              {/* UADE mode sub-selector — shown when UADE is chosen for this format */}
              {showUADEModeSelector && (
                <div className="mt-2 ml-5 pl-3 border-l border-dark-border space-y-1.5">
                  <p className="text-xs text-text-muted font-medium">UADE Mode</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="uadeMode"
                      checked={uadeMode === 'enhanced'}
                      onChange={() => setFormatEngine('uade', 'enhanced')}
                      className="mt-0.5 accent-accent-primary"
                    />
                    <div>
                      <span className="text-sm text-text-primary">Enhanced (Editable)</span>
                      <p className="text-xs text-text-muted">Extracts real samples, detects effects.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="uadeMode"
                      checked={uadeMode === 'classic'}
                      onChange={() => setFormatEngine('uade', 'classic')}
                      className="mt-0.5 accent-accent-primary"
                    />
                    <div>
                      <span className="text-sm text-text-primary">Classic (Playback Only)</span>
                      <p className="text-xs text-text-muted">Authentic emulation, display-only patterns.</p>
                    </div>
                  </label>
                  {/* Subsong input for native-fallback-to-UADE formats (no pre-scan available) */}
                  <div className="flex items-center gap-3 pt-1">
                    <label className="text-xs text-text-muted whitespace-nowrap">Subsong:</label>
                    <input
                      type="number"
                      min={1}
                      value={selectedSubsong + 1}
                      onChange={(e) => setSelectedSubsong(Math.max(0, Number(e.target.value) - 1))}
                      className="w-16 text-xs bg-dark-bgSecondary border border-dark-border rounded px-2 py-1 text-text-primary"
                    />
                    <span className="text-xs text-text-muted">(1 = default)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Engine selector for pure UADE formats (no native parser) ── */}
          {moduleInfo && isUADE && (
            <div className="bg-dark-bg rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-text-primary">Import Engine</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="uadeMode"
                  checked={uadeMode === 'enhanced'}
                  onChange={() => setFormatEngine('uade', 'enhanced')}
                  className="mt-0.5 accent-accent-primary"
                />
                <div>
                  <span className="text-sm text-text-primary">Enhanced (Editable)</span>
                  <p className="text-xs text-text-muted">
                    Extracts real samples, detects effects. Fully editable patterns.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="uadeMode"
                  checked={uadeMode === 'classic'}
                  onChange={() => setFormatEngine('uade', 'classic')}
                  className="mt-0.5 accent-accent-primary"
                />
                <div>
                  <span className="text-sm text-text-primary">Classic (UADE Playback)</span>
                  <p className="text-xs text-text-muted">
                    Authentic emulation, display-only patterns.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* ── Playback options for standard tracker formats (MOD/XM/IT/S3M) ── */}
          {moduleInfo && !nativeFmt && !isUADE && (
            <div className="bg-dark-bg rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useLibopenmpt"
                  checked={useLibopenmpt}
                  onChange={(e) => setUseLibopenmpt(e.target.checked)}
                  className="w-4 h-4 rounded border-dark-border bg-dark-bgSecondary accent-accent-primary"
                />
                <label htmlFor="useLibopenmpt" className="text-sm text-text-primary cursor-pointer">
                  Use libopenmpt for sample-accurate playback
                </label>
              </div>
              <div className="flex items-start gap-2 text-xs text-text-muted">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                <span>
                  When enabled, uses libopenmpt WASM for authentic tracker effects (smooth vibrato, portamento).
                  Editing will use Tone.js approximation.
                </span>
              </div>
            </div>
          )}

          {/* Import note */}
          {moduleInfo && !nativeFmt && !isUADE && !useLibopenmpt && (
            <p className="text-xs text-text-muted">
              Note: Importing will create patterns and sampler instruments from this module.
              Complex effects may not translate perfectly.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!moduleInfo}>
            Import Module
          </Button>
        </div>
      </div>
    </div>
  );
};
