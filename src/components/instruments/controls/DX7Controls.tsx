/**
 * DX7Controls — DOM-based patch browser and controls for the DX7 synth.
 *
 * Provides bank/voice browsing from the patch manifest (35 banks × 32 voices),
 * built-in VCED preset selection, .SYX file loading, and volume/tuning controls.
 * For full operator-level editing, use the Hardware UI (DexedHardwareUI).
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { DX7Synth, type DX7PatchManifest } from '../../../engine/dx7/DX7Synth';
import { getToneEngine } from '../../../engine/ToneEngine';

interface DX7ControlsProps {
  instrument: {
    id: number;
    synthType: string;
    volume?: number;
    dx7?: {
      volume?: number;
      bank?: number;
      program?: number;
      vcedPreset?: string;
    };
  };
  onChange: (updates: Record<string, unknown>) => void;
}

/** Simple horizontal slider with label and value */
const ParamSlider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: string;
  onChange: (v: number) => void;
  accentColor?: string;
}> = ({ label, value, min = 0, max = 1, step = 0.01, displayValue, onChange, accentColor = '#d4a017' }) => (
  <div className="flex items-center gap-2">
    <span className="text-text-secondary text-[10px] w-20 shrink-0">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 h-1.5 appearance-none bg-dark-bgTertiary rounded cursor-pointer"
      style={{
        accentColor,
      }}
    />
    <span className="text-text-muted text-[10px] w-12 text-right font-mono">{displayValue ?? `${Math.round(value * 100)}%`}</span>
  </div>
);

export const DX7Controls: React.FC<DX7ControlsProps> = ({ instrument, onChange }) => {
  const [manifest, setManifest] = useState<DX7PatchManifest | null>(null);
  const [selectedBank, setSelectedBank] = useState(instrument.dx7?.bank ?? 0);
  const [selectedVoice, setSelectedVoice] = useState(instrument.dx7?.program ?? 0);
  const [currentVoiceName, setCurrentVoiceName] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef(instrument.dx7);
  const synthRef = useRef<DX7Synth | null>(null);

  useEffect(() => { configRef.current = instrument.dx7; }, [instrument.dx7]);

  // Load manifest on mount
  useEffect(() => {
    const cached = DX7Synth.getPatchManifest();
    if (cached) {
      setManifest(cached);
    } else {
      DX7Synth.fetchPatchManifest().then(m => { if (m) setManifest(m); });
    }
  }, []);

  // Eagerly create synth on mount and cache the reference
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = getToneEngine();
        // Pass the full instrument config (not a minimal stub) so getInstrument works correctly
        console.log('[DX7Controls] Ensuring synth ready for id:', instrument.id);
        await engine.ensureInstrumentReady(instrument as any);
        if (cancelled) return;
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = engine.instruments.get(key);
        console.log('[DX7Controls] After ensureReady: key=', key, 'synth=', synth, 'hasLoadSysex=', synth && 'loadSysex' in synth, 'mapSize=', engine.instruments.size);
        if (synth && 'loadSysex' in synth) {
          synthRef.current = synth as unknown as DX7Synth;
          console.log('[DX7Controls] Synth cached in ref, isReady=', (synth as any).isReady, '_ready=', (synth as any)._ready);
        } else {
          // Log all keys in the map for debugging
          const keys: string[] = [];
          engine.instruments.forEach((_v, k) => keys.push(`${k}(id=${k >>> 16})`));
          console.warn('[DX7Controls] Synth NOT found. Map keys:', keys.join(', '));
        }
      } catch (err) {
        console.warn('[DX7Controls] Failed to ensure synth ready:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [instrument.id]);

  // Get synth instance from ref or live lookup
  const getSynth = useCallback((): DX7Synth | null => {
    if (synthRef.current) return synthRef.current;
    try {
      const engine = getToneEngine();
      const key = engine.getInstrumentKey(instrument.id, -1);
      const synth = engine.instruments.get(key);
      if (synth && 'loadSysex' in synth) {
        synthRef.current = synth as unknown as DX7Synth;
        return synthRef.current;
      }
      // Fallback: scan instruments map for DX7Synth with matching id
      for (const [k, v] of engine.instruments) {
        if ((k >>> 16) === instrument.id && v && 'loadSysex' in v) {
          synthRef.current = v as unknown as DX7Synth;
          return synthRef.current;
        }
      }
    } catch { /* engine not ready */ }
    return null;
  }, [instrument.id]);

  // Bank names for display
  const bankNames = useMemo(() => {
    if (!manifest) return [];
    return manifest.banks.map((b, i) => {
      const firstName = b.voices[0] || 'Unknown';
      const name = b.file.replace('.syx', '').toUpperCase();
      return { index: i, file: b.file, label: `${name} — ${firstName}...`, voices: b.voices };
    });
  }, [manifest]);

  const currentBank = manifest?.banks[selectedBank];

  // Select a bank + voice
  const selectPatch = useCallback(async (bankIndex: number, voiceIndex: number) => {
    if (!manifest) return;
    const bank = manifest.banks[bankIndex];
    if (!bank) return;
    setLoading(true);
    setSelectedBank(bankIndex);
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(bank.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);

    const synth = getSynth();
    if (synth?.loadPatchBank) {
      await synth.loadPatchBank(bank.file, voiceIndex);
    }
    onChange({ dx7: { ...configRef.current, bank: bankIndex, program: voiceIndex, vcedPreset: undefined } });
    setLoading(false);
  }, [manifest, getSynth, onChange]);

  // Select voice within current bank — loads the bank if needed
  const selectVoiceInBank = useCallback(async (voiceIndex: number) => {
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(currentBank?.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);

    const synth = getSynth();
    if (synth && currentBank) {
      // Always load the bank sysex first — a VCED preset may have overwritten
      // the firmware's voice memory with a single-voice bulk dump.
      await synth.loadPatchBank(currentBank.file, voiceIndex);
    }
    onChange({ dx7: { ...configRef.current, bank: selectedBank, program: voiceIndex, vcedPreset: undefined } });
  }, [currentBank, selectedBank, getSynth, onChange]);

  // Load VCED preset — update state (store handles synth call)
  const loadVcedPreset = useCallback((name: string) => {
    setCurrentVoiceName(name);
    onChange({ dx7: { ...configRef.current, vcedPreset: name, bank: undefined, program: undefined } });
  }, [onChange]);

  // Volume change
  const handleVolumeChange = useCallback((v: number) => {
    onChange({ volume: v });
  }, [onChange]);

  // File loading
  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const synth = getSynth();
    console.log('[DX7Controls] handleFile:', file.name, 'size=', data.length, 'synth=', synth);

    if ((data.length === 4104 || data.length === 4096) && synth) {
      if (data.length === 4096) {
        const sysex = new Uint8Array(4104);
        sysex[0] = 0xF0; sysex[1] = 0x43; sysex[2] = 0x00;
        sysex[3] = 0x09; sysex[4] = 0x20; sysex[5] = 0x00;
        sysex.set(data, 6);
        let sum = 0;
        for (let i = 0; i < 4096; i++) sum += data[i];
        sysex[4102] = (-sum) & 0x7F;
        sysex[4103] = 0xF7;
        synth.loadSysex(sysex.buffer);
      } else {
        synth.loadSysex(buffer);
      }
      setCurrentVoiceName(`${file.name} (32 voices)`);
    } else if (data.length >= 155 && data.length <= 163 && synth) {
      // Single voice VCED
      const vcedStart = data[0] === 0xF0 ? 6 : 0;
      const vcedData = data.subarray(vcedStart, vcedStart + 155);
      (synth as any)._loadVcedData(new Uint8Array(vcedData));
      setCurrentVoiceName(`${file.name} (single voice)`);
    } else if (!synth) {
      console.warn('[DX7Controls] No synth available for file loading');
    }
  }, [getSynth]);

  // VCED preset names (lazy loaded)
  const [vcedNames, setVcedNames] = useState<string[]>([]);
  useEffect(() => {
    import('../../../engine/dx7/dx7presets').then(({ DX7_VCED_PRESETS }) => {
      setVcedNames(DX7_VCED_PRESETS.map(p => p.name));
    });
  }, []);

  const volume = instrument.volume ?? -6;

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Current Voice Display */}
      <div className="bg-black/60 border border-amber-500/40 rounded-lg p-3 font-mono">
        <div className="flex items-center justify-between mb-1">
          <span className="text-amber-500/60 text-[10px] uppercase tracking-wider">Current Voice</span>
          {loading && <span className="text-amber-300 animate-pulse text-[10px]">Loading...</span>}
        </div>
        <div className="text-amber-400 text-lg font-bold tracking-wide">
          {currentVoiceName || instrument.dx7?.vcedPreset || 'ROM Voice 1'}
        </div>
        <div className="text-amber-500/40 text-[10px] mt-1">
          {currentBank ? `Bank: ${currentBank.file.replace('.syx', '').toUpperCase()} • Voice ${selectedVoice + 1}/32` : 'Select a bank below'}
        </div>
      </div>

      {/* Master Controls */}
      <div className="border border-ft2-border rounded p-2">
        <div className="text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider">Master</div>
        <div className="space-y-2">
          <ParamSlider
            label="Volume"
            value={volume}
            min={-40}
            max={6}
            step={0.5}
            displayValue={`${volume > 0 ? '+' : ''}${volume.toFixed(1)} dB`}
            onChange={handleVolumeChange}
          />
        </div>
      </div>

      {/* Built-in Presets */}
      <div className="border border-ft2-border rounded p-2">
        <div className="text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider">Built-in Presets</div>
        <div className="grid grid-cols-3 gap-1">
          {vcedNames.map(name => (
            <button
              key={name}
              onClick={() => loadVcedPreset(name)}
              className={`px-2 py-1.5 text-[10px] rounded transition-all truncate ${
                instrument.dx7?.vcedPreset === name
                  ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50'
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgQuaternary hover:text-text-primary'
              }`}
              title={name}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Patch Bank Browser */}
      {manifest && (
        <div className="border border-ft2-border rounded p-2">
          <div className="text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider">
            Patch Banks ({manifest.banks.length} banks • {manifest.banks.length * 32} voices)
          </div>

          {/* Bank Selector */}
          <select
            value={selectedBank}
            onChange={(e) => selectPatch(Number(e.target.value), 0)}
            className="w-full bg-dark-bgSecondary text-text-primary border border-ft2-border rounded px-2 py-1.5 text-[11px] mb-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            {bankNames.map(b => (
              <option key={b.index} value={b.index}>{b.label}</option>
            ))}
          </select>

          {/* Voice Grid (4×8) */}
          {currentBank && (
            <div className="grid grid-cols-4 gap-1">
              {currentBank.voices.map((name, i) => (
                <button
                  key={i}
                  onClick={() => selectVoiceInBank(i)}
                  className={`px-1.5 py-1 text-[9px] rounded transition-all truncate text-left ${
                    selectedVoice === i && !instrument.dx7?.vcedPreset
                      ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50 font-bold'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgQuaternary hover:text-text-primary'
                  }`}
                  title={`${i + 1}. ${name}`}
                >
                  <span className="text-text-muted mr-1">{i + 1}.</span>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Loading */}
      <div
        className="border border-dashed border-ft2-border rounded p-3 text-center hover:border-amber-500/50 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-text-muted text-[10px]">
          Drop .SYX file here or click to browse
        </div>
        <div className="text-text-muted/50 text-[9px] mt-1">
          Supports 32-voice bulk dumps (4104 bytes)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".syx,.SYX"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default DX7Controls;
