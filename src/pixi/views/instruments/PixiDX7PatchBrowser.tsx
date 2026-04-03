/**
 * PixiDX7PatchBrowser — Pixi/GL patch browser for the DX7 synth.
 *
 * Provides bank/voice browsing (35 banks × 32 voices), VCED preset grid,
 * and volume control — mirrors the DOM DX7Controls component.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton } from '../../components/PixiButton';
import { PixiLabel } from '../../components/PixiLabel';
import { PixiSelect } from '../../components/PixiSelect';
import { PixiScrollView } from '../../components/PixiScrollView';
import { DX7Synth, type DX7PatchManifest } from '../../../engine/dx7/DX7Synth';
import { getToneEngine } from '../../../engine/ToneEngine';
import type { InstrumentConfig } from '../../../types/instrument';

interface PixiDX7PatchBrowserProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const PixiDX7PatchBrowser: React.FC<PixiDX7PatchBrowserProps> = ({ instrument, onChange }) => {
  const theme = usePixiTheme();
  const [manifest, setManifest] = useState<DX7PatchManifest | null>(null);
  const [selectedBank, setSelectedBank] = useState(instrument.dx7?.bank ?? 0);
  const [selectedVoice, setSelectedVoice] = useState(instrument.dx7?.program ?? 0);
  const [currentVoiceName, setCurrentVoiceName] = useState('');
  const [vcedNames, setVcedNames] = useState<string[]>([]);
  const configRef = useRef(instrument.dx7);
  const synthRef = useRef<DX7Synth | null>(null);

  useEffect(() => { configRef.current = instrument.dx7; }, [instrument.dx7]);

  // Load manifest
  useEffect(() => {
    const cached = DX7Synth.getPatchManifest();
    if (cached) { setManifest(cached); return; }
    DX7Synth.fetchPatchManifest().then(m => { if (m) setManifest(m); });
  }, []);

  // Load VCED preset names
  useEffect(() => {
    import('../../../engine/dx7/dx7presets').then(({ DX7_VCED_PRESETS }) => {
      setVcedNames(DX7_VCED_PRESETS.map(p => p.name));
    });
  }, []);

  // Cache synth reference
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = getToneEngine();
        await engine.ensureInstrumentReady(instrument);
        if (cancelled) return;
        const key = engine.getInstrumentKey(instrument.id, -1);
        const synth = engine.instruments.get(key);
        if (synth && 'loadSysex' in synth) {
          synthRef.current = synth as unknown as DX7Synth;
        }
      } catch { /* engine not ready */ }
    })();
    return () => { cancelled = true; };
  }, [instrument.id]);

  const getSynth = useCallback((): DX7Synth | null => {
    if (synthRef.current) return synthRef.current;
    try {
      const engine = getToneEngine();
      for (const [k, v] of engine.instruments) {
        if ((k >>> 16) === instrument.id && v && 'loadSysex' in v) {
          synthRef.current = v as unknown as DX7Synth;
          return synthRef.current;
        }
      }
    } catch { /* engine not ready */ }
    return null;
  }, [instrument.id]);

  // Bank selection options
  const bankOptions = useMemo(() => {
    if (!manifest) return [];
    return manifest.banks.map((b, i) => ({
      value: String(i),
      label: `${b.file.replace('.syx', '').toUpperCase()} — ${b.voices[0] || '?'}`,
    }));
  }, [manifest]);

  const currentBank = manifest?.banks[selectedBank];

  // Select bank + voice
  const selectPatch = useCallback(async (bankIndex: number, voiceIndex: number) => {
    if (!manifest) return;
    const bank = manifest.banks[bankIndex];
    if (!bank) return;
    setSelectedBank(bankIndex);
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(bank.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);
    const synth = getSynth();
    if (synth?.loadPatchBank) await synth.loadPatchBank(bank.file, voiceIndex);
    onChange({ dx7: { ...configRef.current, bank: bankIndex, program: voiceIndex, vcedPreset: undefined } });
  }, [manifest, getSynth, onChange]);

  // Select voice in bank
  const selectVoiceInBank = useCallback((voiceIndex: number) => {
    setSelectedVoice(voiceIndex);
    setCurrentVoiceName(currentBank?.voices[voiceIndex] || `Voice ${voiceIndex + 1}`);
    const synth = getSynth();
    if (synth) synth.selectVoice(voiceIndex);
    onChange({ dx7: { ...configRef.current, program: voiceIndex, vcedPreset: undefined } });
  }, [currentBank, getSynth, onChange]);

  // Load VCED preset
  const loadVcedPreset = useCallback((name: string) => {
    setCurrentVoiceName(name);
    onChange({ dx7: { ...configRef.current, vcedPreset: name, bank: undefined, program: undefined } });
  }, [onChange]);

  const amber = 0xd4a017;
  const amberDim = 0x8b6914;

  return (
    <pixiContainer layout={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {/* Current Voice Display */}
      <layoutContainer
        layout={{ display: 'flex', flexDirection: 'column', padding: 8, width: '100%' }}
        backgroundStyle={{ color: 0x000000, alpha: 0.6, borderRadius: 6, borderWidth: 1, borderColor: amber, borderAlpha: 0.4 }}
      >
        <PixiLabel text="CURRENT VOICE" size="xs" color="textMuted" weight="bold" />
        <pixiBitmapText
          text={currentVoiceName || instrument.dx7?.vcedPreset || 'ROM Voice 1'}
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fill: amber, fontSize: 14 }}
          layout={{ marginTop: 4 }}
        />
        <pixiBitmapText
          text={currentBank ? `Bank: ${currentBank.file.replace('.syx', '').toUpperCase()} • Voice ${selectedVoice + 1}/32` : 'Select a bank below'}
          style={{ fontFamily: PIXI_FONTS.MONO, fill: amberDim, fontSize: 9 }}
          layout={{ marginTop: 4 }}
        />
      </layoutContainer>

      {/* VCED Presets */}
      {vcedNames.length > 0 && (
        <layoutContainer
          layout={{ display: 'flex', flexDirection: 'column', padding: 6, width: '100%' }}
          backgroundStyle={{ color: theme.bgSecondary, alpha: 1, borderRadius: 4, borderWidth: 1, borderColor: theme.border }}
        >
          <PixiLabel text="BUILT-IN PRESETS" size="xs" color="textMuted" weight="bold" layout={{ marginBottom: 4 }} />
          <pixiContainer layout={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 3, width: '100%' }}>
            {vcedNames.map(name => (
              <PixiButton
                key={name}
                label={name}
                variant={instrument.dx7?.vcedPreset === name ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => loadVcedPreset(name)}
                width={90}
                height={22}
              />
            ))}
          </pixiContainer>
        </layoutContainer>
      )}

      {/* Patch Bank Browser */}
      {manifest && (
        <layoutContainer
          layout={{ display: 'flex', flexDirection: 'column', padding: 6, width: '100%' }}
          backgroundStyle={{ color: theme.bgSecondary, alpha: 1, borderRadius: 4, borderWidth: 1, borderColor: theme.border }}
        >
          <PixiLabel
            text={`PATCH BANKS (${manifest.banks.length} banks • ${manifest.banks.length * 32} voices)`}
            size="xs" color="textMuted" weight="bold"
            layout={{ marginBottom: 4 }}
          />

          {/* Bank Dropdown */}
          <PixiSelect
            options={bankOptions}
            value={String(selectedBank)}
            onChange={(val) => selectPatch(Number(val), 0)}
            width={280}
            layout={{ marginBottom: 6 }}
          />

          {/* Voice Grid (4×8) */}
          {currentBank && (
            <PixiScrollView width={280} height={220}>
              <pixiContainer layout={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 2, width: '100%' }}>
                {currentBank.voices.map((name, i) => (
                  <PixiButton
                    key={i}
                    label={`${i + 1}. ${name}`}
                    variant={selectedVoice === i && !instrument.dx7?.vcedPreset ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => selectVoiceInBank(i)}
                    width={110}
                    height={20}
                  />
                ))}
              </pixiContainer>
            </PixiScrollView>
          )}
        </layoutContainer>
      )}
    </pixiContainer>
  );
};
