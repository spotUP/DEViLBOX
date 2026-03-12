/**
 * Gearmulator instrument editor — ROM upload, status, and MIDI controls.
 * Requires user-provided firmware ROM (not distributed with DEViLBOX).
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { GearmulatorConfig } from '@typedefs/instrument';

// Synth type ID → display info
const SYNTH_NAMES: Record<number, { name: string; romHint: string }> = {
  0: { name: 'Access Virus A/B/C', romHint: 'Virus A/B/C firmware ROM (~512KB–1MB)' },
  1: { name: 'Access Virus TI', romHint: 'Virus TI firmware ROM (~2–4MB)' },
  2: { name: 'Waldorf microQ', romHint: 'microQ firmware ROM' },
  3: { name: 'Waldorf Microwave II/XT', romHint: 'Microwave XT firmware ROM' },
  4: { name: 'Nord Lead 2x', romHint: 'Nord Lead 2x firmware ROM' },
  5: { name: 'Roland JP-8000', romHint: 'JP-8000 firmware ROM' },
};

interface GearmulatorEditorProps {
  config: GearmulatorConfig;
  onChange: (config: GearmulatorConfig) => void;
}

export const GearmulatorEditor: React.FC<GearmulatorEditorProps> = ({ config, onChange }) => {
  const [romStatus, setRomStatus] = useState<'none' | 'loading' | 'loaded' | 'error'>('none');
  const [romError, setRomError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef(config);

  useEffect(() => { configRef.current = config; }, [config]);

  // Check if ROM is already stored
  useEffect(() => {
    if (config.romKey) {
      checkRomExists(config.romKey).then(exists => {
        setRomStatus(exists ? 'loaded' : 'none');
      });
    }
  }, [config.romKey]);

  const info = SYNTH_NAMES[config.synthType] ?? { name: 'Unknown', romHint: 'Firmware ROM' };

  const handleRomFile = useCallback(async (file: File) => {
    setRomStatus('loading');
    setRomError(null);
    try {
      const buffer = await file.arrayBuffer();
      const key = `gearmulator-${config.synthType}-${file.name}`;
      await storeRom(key, new Uint8Array(buffer));
      onChange({ ...configRef.current, romKey: key });
      setRomStatus('loaded');
    } catch (err) {
      setRomError(err instanceof Error ? err.message : 'Failed to load ROM');
      setRomStatus('error');
    }
  }, [config.synthType, onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleRomFile(file);
  }, [handleRomFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleRomFile(file);
  }, [handleRomFile]);

  const handleChannelChange = useCallback((ch: number) => {
    onChange({ ...configRef.current, channel: Math.max(0, Math.min(15, ch)) });
  }, [onChange]);

  const handleClockChange = useCallback((pct: number) => {
    onChange({ ...configRef.current, clockPercent: Math.max(25, Math.min(100, pct)) });
  }, [onChange]);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-900/50 flex items-center justify-center text-purple-300 text-lg font-bold">
          GM
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">{info.name}</h2>
          <p className="text-[10px] uppercase tracking-widest text-purple-400">
            Gearmulator DSP56300 Emulator
          </p>
        </div>
      </div>

      {/* ROM Upload Zone */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-purple-400 bg-purple-900/30' : 'border-dark-borderLight hover:border-purple-500'}
          ${romStatus === 'loaded' ? 'border-green-600 bg-green-900/20' : ''}
          ${romStatus === 'error' ? 'border-red-600 bg-red-900/20' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".bin,.rom,.syx"
        />
        {romStatus === 'none' && (
          <>
            <p className="text-text-secondary text-sm font-medium mb-1">Drop firmware ROM here</p>
            <p className="text-text-muted text-xs">{info.romHint}</p>
            <p className="text-text-muted text-[10px] mt-2">ROMs are stored locally and never uploaded</p>
          </>
        )}
        {romStatus === 'loading' && (
          <p className="text-purple-300 text-sm animate-pulse">Loading ROM...</p>
        )}
        {romStatus === 'loaded' && (
          <>
            <p className="text-green-300 text-sm font-medium">ROM loaded</p>
            <p className="text-green-500 text-xs">{config.romKey}</p>
            <p className="text-text-muted text-[10px] mt-1">Click to replace</p>
          </>
        )}
        {romStatus === 'error' && (
          <>
            <p className="text-red-300 text-sm font-medium">ROM Error</p>
            <p className="text-red-500 text-xs">{romError}</p>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        {/* MIDI Channel */}
        <div className="bg-[#1a1a2e] rounded-lg p-3">
          <label className="text-[10px] uppercase tracking-wider text-text-secondary block mb-1">
            MIDI Channel
          </label>
          <select
            className="w-full bg-[#0a0a1a] text-text-primary text-sm rounded px-2 py-1 border border-dark-borderLight"
            value={config.channel ?? 0}
            onChange={(e) => handleChannelChange(parseInt(e.target.value))}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i} value={i}>Ch {i + 1}</option>
            ))}
          </select>
        </div>

        {/* Clock Speed */}
        <div className="bg-[#1a1a2e] rounded-lg p-3">
          <label className="text-[10px] uppercase tracking-wider text-text-secondary block mb-1">
            DSP Clock
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={25}
              max={100}
              value={config.clockPercent ?? 100}
              onChange={(e) => handleClockChange(parseInt(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs text-text-secondary w-8 text-right">
              {config.clockPercent ?? 100}%
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-[#0a0a1a] rounded-lg p-3 text-xs text-text-muted space-y-1">
        <p>Gearmulator emulates the DSP56300 processor running original firmware.</p>
        <p>You must provide your own firmware ROM file (not included).</p>
        {romStatus === 'loaded' && (
          <p className="text-purple-400">
            Use MIDI CC messages from the tracker to control synth parameters.
          </p>
        )}
      </div>
    </div>
  );
};

// IndexedDB helpers for ROM storage
const DB_NAME = 'devilbox-gearmulator-roms';
const STORE_NAME = 'roms';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeRom(key: string, data: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function checkRomExists(key: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count(key);
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => resolve(false);
  });
}
