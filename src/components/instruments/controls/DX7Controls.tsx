/**
 * DX7Controls — DOM-based patch browser and voice selector for the DX7 synth.
 *
 * Provides bank/voice browsing from the patch manifest (35 banks × 32 voices),
 * built-in VCED preset selection, .SYX file loading, and volume control.
 * For full operator-level editing, use the Hardware UI (DexedHardwareUI).
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { DX7Synth, type DX7PatchManifest } from '../../../engine/dx7/DX7Synth';
import { getToneEngine } from '../../../engine/ToneEngine';

interface DX7ControlsProps {
  instrument: {
    id: number;
    synthType: string;
    dx7?: {
      volume?: number;
      bank?: number;
      program?: number;
      vcedPreset?: string;
    };
  };
  onChange: (updates: Record<string, unknown>) => void;
}

export const DX7Controls: React.FC<DX7ControlsProps> = ({ instrument, onChange }) => {
  const [manifest, setManifest] = useState<DX7PatchManifest | null>(null);
  const [selectedBank, setSelectedBank] = useState(instrument.dx7?.bank ?? 0);
  const [selectedVoice, setSelectedVoice] = useState(instrument.dx7?.program ?? 0);
  const [currentVoiceName, setCurrentVoiceName] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configRef = useRef(instrument.dx7);

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

  // Get synth instance
  const getSynth = useCallback((): any => {
    try {
      const engine = getToneEngine();
      const key = (instrument.id << 16) | 0xFFFF;
      return engine.instruments.get(key) as any;
    } catch { return null; }
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

  // Select voice within current bank
  const selectVoiceInBank = useCallback((voiceIndex: number) => {
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(currentBank?.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);

    const synth = getSynth();
    if (synth?.selectVoice) {
      synth.selectVoice(voiceIndex);
    }
    onChange({ dx7: { ...configRef.current, program: voiceIndex, vcedPreset: undefined } });
  }, [currentBank, getSynth, onChange]);

  // Load VCED preset
  const loadVcedPreset = useCallback((name: string) => {
    setCurrentVoiceName(name);
    onChange({ dx7: { ...configRef.current, vcedPreset: name, bank: undefined, program: undefined } });
  }, [onChange]);

  // File loading
  const handleFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const synth = getSynth();

    if ((data.length === 4104 || data.length === 4096) && synth?.loadSysex) {
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
    }
  }, [getSynth]);

  // VCED preset names (lazy loaded)
  const [vcedNames, setVcedNames] = useState<string[]>([]);
  useEffect(() => {
    import('../../../engine/dx7/dx7presets').then(({ DX7_VCED_PRESETS }) => {
      setVcedNames(DX7_VCED_PRESETS.map(p => p.name));
    });
  }, []);

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
