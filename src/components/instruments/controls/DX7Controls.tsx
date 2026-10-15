/**
 * DX7Controls — DOM-based patch browser and controls for the DX7 synth.
 *
 * Provides bank/voice browsing from the patch manifest (35 banks × 32 voices),
 * built-in VCED preset selection, .SYX file loading, and volume/tuning controls.
 * For full operator-level editing, use the Hardware UI (DexedHardwareUI).
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { DX7Synth, type DX7PatchManifest } from '../../../engine/dx7/DX7Synth';
import { getToneEngine } from '../../../engine/ToneEngine';
import { inspectDX7Sysex } from '../../../engine/dx7/dx7sysex';
import {
  fetchDX7LibraryManifest, dx7LibrarySelectGroups, dx7LibraryValue, parseDX7LibraryValue,
  type DX7LibraryManifest,
} from '../../../engine/dx7/dx7Library';

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
      libraryBank?: string;
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
  const [library, setLibrary] = useState<DX7LibraryManifest | null>(null);
  const [importStatus, setImportStatus] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    fetchDX7LibraryManifest().then(m => { if (!cancelled && m) setLibrary(m); });
    return () => { cancelled = true; };
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
    onChange({ dx7: { ...configRef.current, bank: bankIndex, program: voiceIndex, vcedPreset: undefined, libraryBank: undefined } });
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
    onChange({ dx7: { ...configRef.current, bank: selectedBank, program: voiceIndex, vcedPreset: undefined, libraryBank: undefined } });
  }, [currentBank, selectedBank, getSynth, onChange]);

  // Load VCED preset — update state (store handles synth call)
  const loadVcedPreset = useCallback((name: string) => {
    setCurrentVoiceName(name);
    onChange({ dx7: { ...configRef.current, vcedPreset: name, bank: undefined, program: undefined, libraryBank: undefined } });
  }, [onChange]);

  // Curated library voice: the store loads the bank into the synth (loadLibraryBank)
  const selectLibraryVoice = useCallback((value: string) => {
    const pick = parseDX7LibraryValue(value);
    if (!pick) return;
    const bank = library?.banks.find(b => b.file === pick.file);
    setCurrentVoiceName(bank?.voices[pick.index] || `Voice ${pick.index + 1}`);
    setSelectedVoice(pick.index);
    onChange({ dx7: { ...configRef.current, libraryBank: pick.file, program: pick.index, bank: undefined, vcedPreset: undefined } });
  }, [library, onChange]);

  const libraryBank = library?.banks.find(b => b.file === instrument.dx7?.libraryBank);

  // Volume change
  const handleVolumeChange = useCallback((v: number) => {
    onChange({ volume: v });
  }, [onChange]);

  // File loading: one parser (inspectDX7Sysex) for bulk banks and single voices
  const handleFile = useCallback(async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const synth = getSynth();
    const found = inspectDX7Sysex(data);
    if (found.kind === 'unknown') {
      setImportStatus(`${file.name}: not a DX7 voice or 32-voice bank (${data.length} bytes)`);
      return;
    }
    if (!synth) {
      setImportStatus('Synth not ready yet, try again in a moment');
      return;
    }
    if (found.kind === 'bulk32' && found.bulkSysex) {
      synth.loadSysex(found.bulkSysex.slice().buffer);
      setCurrentVoiceName(`${file.name} (32 voices)`);
      const notes = [!found.checksumOk && 'checksum was wrong', found.repairs > 0 && `${found.repairs} out-of-range values clamped`].filter(Boolean);
      setImportStatus(notes.length ? `Loaded ${file.name} (${notes.join(', ')})` : `Loaded ${file.name}`);
    } else if (found.vced) {
      synth._loadVcedData(new Uint8Array(found.vced));
      setCurrentVoiceName(`${file.name} (single voice)`);
      setImportStatus(`Loaded ${file.name}`);
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
                  : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgTertiary hover:text-text-primary'
              }`}
              title={name}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Curated library, grouped by bank, with attribution */}
      {library && (
        <div className="border border-ft2-border rounded p-2">
          <div className="text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider">
            Library ({library.banks.length} banks, {library.banks.length * 32} voices)
          </div>
          <CustomSelect
            value={instrument.dx7?.libraryBank ? dx7LibraryValue(instrument.dx7.libraryBank, instrument.dx7.program ?? 0) : ''}
            onChange={selectLibraryVoice}
            options={dx7LibrarySelectGroups(library)}
            placeholder="Choose a library voice"
            className="w-full bg-dark-bgSecondary text-text-primary border border-ft2-border rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          {libraryBank && (
            <div className="mt-2 text-[9px] text-text-muted font-mono space-y-0.5">
              <div>{libraryBank.author}</div>
              <div>{libraryBank.licence}</div>
              <a href={libraryBank.source} target="_blank" rel="noreferrer" className="text-accent-primary underline break-all">{libraryBank.source}</a>
            </div>
          )}
        </div>
      )}

      {/* Patch Bank Browser */}
      {manifest && (
        <div className="border border-ft2-border rounded p-2">
          <div className="text-ft2-highlight text-[10px] font-bold uppercase mb-2 tracking-wider">
            Patch Banks ({manifest.banks.length} banks • {manifest.banks.length * 32} voices)
          </div>

          {/* Bank Selector */}
          <CustomSelect
            value={String(selectedBank)}
            onChange={(v) => selectPatch(Number(v), 0)}
            options={bankNames.map(b => ({ value: String(b.index), label: b.label }))}
            className="w-full bg-dark-bgSecondary text-text-primary border border-ft2-border rounded px-2 py-1.5 text-[11px] mb-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />

          {/* Voice Grid (4×8) */}
          {currentBank && (
            <div className="grid grid-cols-4 gap-1">
              {currentBank.voices.map((name, i) => (
                <button
                  key={i}
                  onClick={() => selectVoiceInBank(i)}
                  className={`px-1.5 py-1 text-[9px] rounded transition-all truncate text-left ${
                    selectedVoice === i && !instrument.dx7?.vcedPreset && !instrument.dx7?.libraryBank
                      ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50 font-bold'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgTertiary hover:text-text-primary'
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
          Load SysEx file... (drop a .syx file here or click)
        </div>
        <div className="text-text-muted/50 text-[9px] mt-1">
          {importStatus || 'Supports 32-voice bulk dumps and single-voice dumps'}
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
