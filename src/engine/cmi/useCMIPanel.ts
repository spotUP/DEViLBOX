/**
 * useCMIPanel — Shared hook for the Fairlight CMI control panel.
 *
 * Single source of truth for ALL CMI panel state, computed data,
 * and callbacks. Both the DOM and Pixi renderers import this hook —
 * zero duplicated logic.
 *
 * Provides:
 *  - Instrument lookup (from store or explicit props)
 *  - Parameter values with fallbacks
 *  - Harmonic editing state + pointer handlers (renderer-agnostic)
 *  - Pre-computed waveforms, envelope curves, filter data (from cmi-dsp-utils)
 *  - Parameter change callbacks (stale-proof via getState())
 *  - Tab state
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useInstrumentStore, useUIStore } from '@stores';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useShallow } from 'zustand/react/shallow';
import { getToneEngine } from '@engine/ToneEngine';
import {
  NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES,
  generateFromHarmonics, getBuiltinHarmonics, getBuiltinWaveform,
  cutoffToHz, filterResponseDb, formatCutoffHz, generateEnvelopeCurve,
  floatToUint8PCM,
} from './cmi-dsp-utils';

// ── Helper to get the live CMISynth instance from ToneEngine ───────────────

function getCMISynthInstance(instrumentId: number | undefined): any | null {
  if (instrumentId == null) return null;
  try {
    const engine = getToneEngine();
    // MAME synths use shared key: (id << 16) | 0xFFFF
    const key = (instrumentId << 16) | 0xFFFF;
    const synth = engine.instruments.get(key);
    if (synth && typeof (synth as any).loadSampleAll === 'function') return synth;
    return null;
  } catch { return null; }
}

// ── Re-export constants so renderers don't import cmi-dsp-utils directly ───
export { NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES, cutoffToHz, filterResponseDb, formatCutoffHz };

// ── Types ──────────────────────────────────────────────────────────────────

export type CMITab = 'harmonic' | 'wave' | 'control' | 'filter' | 'envelope';

export const CMI_TAB_DEFS: { id: CMITab; label: string; pageNum: string }[] = [
  { id: 'harmonic', label: 'HARMONIC', pageNum: '7' },
  { id: 'wave',     label: 'WAVE',     pageNum: '5' },
  { id: 'control',  label: 'CONTROL',  pageNum: '6' },
  { id: 'filter',   label: 'FILTER',   pageNum: 'F' },
  { id: 'envelope', label: 'ENVELOPE', pageNum: 'E' },
];

// ── Heights (shared between both renderers) ────────────────────────────────

export const CMI_COLLAPSED_H = 40;
export const CMI_HEADER_H = 36;
export const CMI_TAB_BAR_H = 28;
export const CMI_CONTENT_H = 260;
export const CMI_EXPANDED_H = CMI_HEADER_H + CMI_TAB_BAR_H + CMI_CONTENT_H + 2;

// ── Format helpers ─────────────────────────────────────────────────────────

export const fmtInt = (v: number) => `${Math.round(v)}`;
export const fmtWave = (v: number) => WAVE_NAMES[Math.round(v)] ?? `${Math.round(v)}`;
export const fmtCutoff = (v: number) => formatCutoffHz(v);
export const fmtTrack = (v: number) => `${Math.round((v / 255) * 100)}%`;

// ── Props for explicit param passing (DOM mode from SynthControlsRouter) ───

interface UseCMIPanelProps {
  /** If provided, used instead of reading from store */
  externalParams?: Record<string, number | string>;
  /** If provided, called instead of writing to store */
  externalOnChange?: (key: string, value: number) => void;
  /** Explicit instrument ID (DOM mode) */
  instrumentId?: number;
}

// ── Return type ────────────────────────────────────────────────────────────

export interface CMIPanelState {
  // Instrument
  found: boolean;
  instrumentName: string;
  chLabel: string;
  instrumentId: number | undefined;

  // Params
  volume: number;
  waveSelect: number;
  waveBank: number;
  cutoff: number;
  filterTrack: number;
  attackTime: number;
  releaseTime: number;
  envRate: number;

  // Computed data (from shared DSP utils)
  harmonics: number[];
  customWaveform: Float32Array;
  builtinWaveform: Float32Array;
  envelopeCurve: { x: number; y: number }[];

  // Sample state
  sampleLoaded: boolean;
  sampleName: string;
  sampleWaveform: Float32Array | null;

  // Tab
  activeTab: CMITab;
  setActiveTab: (tab: CMITab) => void;

  // Collapse
  collapsed: boolean;
  toggleCollapsed: () => void;

  // Callbacks
  handleParamChange: (key: string, value: number) => void;
  selectWavePreset: (bank: number) => void;
  loadSampleFromFile: (file: File) => Promise<void>;
  syncHarmonicsToEngine: () => void;

  // Harmonic editor (renderer-agnostic: takes x,y in 0..1 space)
  harmonicDragActive: React.MutableRefObject<boolean>;
  updateHarmonicAt: (normalizedX: number, normalizedY: number) => void;
  startHarmonicDrag: (normalizedX: number, normalizedY: number) => void;
  endHarmonicDrag: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useCMIPanel(props?: UseCMIPanelProps): CMIPanelState {
  const { externalParams, externalOnChange, instrumentId: extInstId } = props ?? {};

  // ── Store subscriptions ──────────────────────────────────────────────────

  const { cmiCollapsed, toggleCMICollapsed } = useUIStore(
    useShallow((s) => ({
      cmiCollapsed: s.cmiCollapsed ?? false,
      toggleCMICollapsed: s.toggleCMICollapsed,
    }))
  );

  const { instruments, updateInstrument } = useInstrumentStore(
    useShallow((s) => ({
      instruments: s.instruments,
      updateInstrument: s.updateInstrument,
    }))
  );

  const { controlledInstrumentId } = useMIDIStore();

  // ── Find instrument ──────────────────────────────────────────────────────

  const targetInstrument = extInstId
    ? instruments.find((i) => i.id === extInstId)
    : controlledInstrumentId
      ? instruments.find((i) => i.id === controlledInstrumentId && i.synthType === 'MAMECMI')
      : instruments.find((i) => i.synthType === 'MAMECMI');

  // ── Params (external props override store) ───────────────────────────────

  const params = externalParams ?? (targetInstrument?.parameters as Record<string, number | string>) ?? {};
  const p = (key: string, fallback: number) => {
    const v = params[key];
    return typeof v === 'number' ? v : fallback;
  };

  const volume = p('volume', 200);
  const waveSelect = p('wave_select', 0);
  const cutoff = p('filter_cutoff', 200);
  const filterTrack = p('filter_track', 128);
  const attackTime = p('attack_time', 10);
  const releaseTime = p('release_time', 80);
  const envRate = p('envelope_rate', 200);
  const waveBank = Math.round(waveSelect);

  // ── Local state ──────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<CMITab>('harmonic');
  const [harmonics, setHarmonics] = useState<number[]>(() => getBuiltinHarmonics(0));
  const harmonicDragActive = useRef(false);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [sampleName, setSampleName] = useState('');
  const [sampleWaveform, setSampleWaveform] = useState<Float32Array | null>(null);

  // ── Computed data (all from shared cmi-dsp-utils) ────────────────────────

  const customWaveform = useMemo(() => generateFromHarmonics(harmonics), [harmonics]);
  const builtinWaveform = useMemo(() => getBuiltinWaveform(waveBank), [waveBank]);
  const envelopeCurve = useMemo(
    () => generateEnvelopeCurve(attackTime, releaseTime, envRate, 100),
    [attackTime, releaseTime, envRate]
  );

  // ── Instrument info ──────────────────────────────────────────────────────

  const chIndex = targetInstrument ? instruments.indexOf(targetInstrument) : -1;
  const chLabel = chIndex >= 0 ? `CH${String(chIndex + 1).padStart(2, '0')}` : 'CH--';

  // ── Parameter change (stale-proof) ───────────────────────────────────────

  const handleParamChange = useCallback(
    (key: string, value: number) => {
      const rounded = Math.round(value);
      if (externalOnChange) {
        externalOnChange(key, rounded);
        return;
      }
      if (!targetInstrument) return;
      const latest = useInstrumentStore
        .getState()
        .instruments.find((i) => i.id === targetInstrument.id);
      if (!latest) return;
      updateInstrument(targetInstrument.id, {
        parameters: { ...latest.parameters, [key]: rounded },
      });
    },
    [targetInstrument, updateInstrument, externalOnChange]
  );

  // ── Wave preset selection ────────────────────────────────────────────────

  const selectWavePreset = useCallback(
    (bank: number) => {
      setHarmonics(getBuiltinHarmonics(bank));
      handleParamChange('wave_select', bank);
      // Sync built-in waveform to engine
      const synth = getCMISynthInstance(targetInstrument?.id);
      if (synth) {
        const wf = getBuiltinWaveform(bank);
        synth.loadSampleAll(floatToUint8PCM(wf));
      }
    },
    [handleParamChange, targetInstrument]
  );

  // ── Sync harmonic editor waveform → WASM engine ─────────────────────────

  const syncHarmonicsToEngine = useCallback(() => {
    const synth = getCMISynthInstance(targetInstrument?.id);
    if (!synth) return;
    const wf = generateFromHarmonics(harmonics);
    synth.loadSampleAll(floatToUint8PCM(wf));
    setSampleName('Harmonic');
    setSampleLoaded(true);
    setSampleWaveform(wf);
  }, [harmonics, targetInstrument]);

  // Auto-sync harmonics to engine when drag ends
  const prevHarmonicsRef = useRef(harmonics);
  useEffect(() => {
    if (prevHarmonicsRef.current !== harmonics && !harmonicDragActive.current) {
      syncHarmonicsToEngine();
    }
    prevHarmonicsRef.current = harmonics;
  }, [harmonics, syncHarmonicsToEngine]);

  // ── Sample import from file (WAV/AIFF → 8-bit PCM → all voices) ─────────

  const loadSampleFromFile = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      // Take mono channel, resample to 16KB max
      const src = decoded.getChannelData(0);
      const maxSamples = 16384;
      const outLen = Math.min(src.length, maxSamples);
      const ratio = src.length / outLen;
      const floatSamples = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        floatSamples[i] = src[Math.min(Math.floor(i * ratio), src.length - 1)];
      }

      // Normalize peak to ±1
      let peak = 0;
      for (let i = 0; i < floatSamples.length; i++) peak = Math.max(peak, Math.abs(floatSamples[i]));
      if (peak > 0) for (let i = 0; i < floatSamples.length; i++) floatSamples[i] /= peak;

      // Load into engine
      const synth = getCMISynthInstance(targetInstrument?.id);
      if (synth) synth.loadSampleAll(floatToUint8PCM(floatSamples));

      setSampleName(file.name.replace(/\.[^.]+$/, ''));
      setSampleLoaded(true);
      setSampleWaveform(floatSamples);

      console.log(`[CMI] Loaded "${file.name}" — ${outLen} samples → 8-bit PCM → all voices`);
    } catch (err) {
      console.error('[CMI] Sample load error:', err);
    }
  }, [targetInstrument]);

  // ── Harmonic editor (renderer-agnostic: normalized 0..1 coords) ──────────

  const updateHarmonicAt = useCallback((normalizedX: number, normalizedY: number) => {
    const barIndex = Math.floor(normalizedX * NUM_HARMONICS);
    if (barIndex < 0 || barIndex >= NUM_HARMONICS) return;
    const amplitude = Math.max(0, Math.min(1, 1 - normalizedY));
    setHarmonics((prev) => {
      const next = [...prev];
      next[barIndex] = amplitude;
      return next;
    });
  }, []);

  const startHarmonicDrag = useCallback((normalizedX: number, normalizedY: number) => {
    harmonicDragActive.current = true;
    updateHarmonicAt(normalizedX, normalizedY);
  }, [updateHarmonicAt]);

  const endHarmonicDrag = useCallback(() => {
    harmonicDragActive.current = false;
  }, []);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    found: !!targetInstrument,
    instrumentName: targetInstrument?.name ?? '',
    chLabel,
    instrumentId: targetInstrument?.id,

    volume, waveSelect, waveBank, cutoff, filterTrack, attackTime, releaseTime, envRate,

    harmonics, customWaveform, builtinWaveform, envelopeCurve,

    sampleLoaded, sampleName, sampleWaveform,

    activeTab, setActiveTab,
    collapsed: cmiCollapsed,
    toggleCollapsed: toggleCMICollapsed,

    handleParamChange, selectWavePreset, loadSampleFromFile, syncHarmonicsToEngine,
    harmonicDragActive, updateHarmonicAt, startHarmonicDrag, endHarmonicDrag,
  };
}
