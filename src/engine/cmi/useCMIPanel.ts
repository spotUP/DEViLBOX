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
import { getDevilboxAudioContext } from '@utils/audio-context';
import type { CMISynth } from './CMISynth';
import { CMI_PRESETS, type CMIPreset } from '@/constants/cmiPresets';
import {
  NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES,
  generateFromHarmonics, getBuiltinHarmonics, getBuiltinWaveform,
  cutoffToHz, filterResponseDb, formatCutoffHz, generateEnvelopeCurve,
  floatToUint8PCM,
} from './cmi-dsp-utils';

// ── Fairlight CMI Sample Library manifest types & loader ───────────────────

interface CMIManifestSample { name: string; file: string; }
interface CMIManifestCategory { name: string; count: number; samples: CMIManifestSample[]; }
interface CMIManifest {
  id: string; name: string; sampleCount: number;
  categories: CMIManifestCategory[];
}

const CMI_SAMPLES_BASE = 'data/samples/packs/fairlight-cmi';
let _manifestCache: CMIManifest | null = null;
let _manifestLoading = false;
const _manifestListeners: Array<(m: CMIManifest) => void> = [];

async function loadManifest(): Promise<CMIManifest> {
  if (_manifestCache) return _manifestCache;
  if (_manifestLoading) {
    return new Promise((resolve) => { _manifestListeners.push(resolve); });
  }
  _manifestLoading = true;
  try {
    const resp = await fetch(`/${CMI_SAMPLES_BASE}/manifest.json`);
    _manifestCache = await resp.json() as CMIManifest;
    _manifestListeners.forEach((cb) => cb(_manifestCache!));
    _manifestListeners.length = 0;
    return _manifestCache;
  } finally {
    _manifestLoading = false;
  }
}

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

export type CMITab = 'harmonic' | 'wave' | 'control' | 'filter' | 'envelope' | 'crt';

export const CMI_TAB_DEFS: { id: CMITab; label: string; pageNum: string }[] = [
  { id: 'harmonic', label: 'HARMONIC', pageNum: '7' },
  { id: 'wave',     label: 'WAVE',     pageNum: '5' },
  { id: 'control',  label: 'CONTROL',  pageNum: '6' },
  { id: 'filter',   label: 'FILTER',   pageNum: 'F' },
  { id: 'envelope', label: 'ENVELOPE', pageNum: 'E' },
  { id: 'crt',      label: 'CRT',      pageNum: 'M' },
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

  // Library browser
  libraryCategories: string[];
  libraryCategoryIndex: number;
  librarySamples: CMIManifestSample[];
  librarySampleIndex: number;
  libraryLoading: boolean;
  setLibraryCategoryIndex: (index: number) => void;
  loadLibrarySample: (sampleIndex: number) => void;
  prevLibrarySample: () => void;
  nextLibrarySample: () => void;

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

  // Voice status (16 voices: [active, note, env, releasing] × 16)
  voiceStatus: Int32Array;

  // Presets
  presets: CMIPreset[];
  loadPreset: (index: number) => void;

  // Preview/audition
  previewing: boolean;
  previewLibrarySample: (sampleIndex?: number) => void;
  stopPreview: () => void;
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

  // ── Library browser state ────────────────────────────────────────────────

  const [manifest, setManifest] = useState<CMIManifest | null>(_manifestCache);
  const [libraryCategoryIndex, setLibraryCategoryIndex] = useState(0);
  const [librarySampleIndex, setLibrarySampleIndex] = useState(-1);
  const [libraryLoading, setLibraryLoading] = useState(false);

  useEffect(() => {
    loadManifest().then(setManifest);
  }, []);

  const libraryCategories = useMemo(
    () => manifest?.categories.map((c) => c.name) ?? [],
    [manifest]
  );

  const librarySamples = useMemo(
    () => manifest?.categories[libraryCategoryIndex]?.samples ?? [],
    [manifest, libraryCategoryIndex]
  );

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

  // ── Load sample from Fairlight library (fetch URL → raw 8-bit PCM) ───────

  const loadLibrarySample = useCallback((sampleIndex: number) => {
    if (!manifest) return;
    const cat = manifest.categories[libraryCategoryIndex];
    if (!cat) return;
    const sample = cat.samples[sampleIndex];
    if (!sample) return;

    setLibrarySampleIndex(sampleIndex);
    setLibraryLoading(true);

    const url = `/${CMI_SAMPLES_BASE}/${cat.name}/${sample.file}`;
    fetch(url)
      .then((resp) => resp.arrayBuffer())
      .then((buf) => {
        // These are 8-bit unsigned PCM WAVs — extract raw PCM from WAV
        const view = new DataView(buf);
        let dataOffset = 44; // standard WAV header
        let dataSize = buf.byteLength - 44;

        // Parse WAV to find actual data chunk (some have extra headers)
        if (view.getUint32(0, false) === 0x52494646) { // "RIFF"
          let off = 12;
          while (off < buf.byteLength - 8) {
            const chunkId = view.getUint32(off, false);
            const chunkSize = view.getUint32(off + 4, true);
            if (chunkId === 0x64617461) { // "data"
              dataOffset = off + 8;
              dataSize = chunkSize;
              break;
            }
            off += 8 + chunkSize;
            if (chunkSize % 2 !== 0) off++; // padding byte
          }
        }

        // Raw 8-bit unsigned PCM — direct to wave RAM (no conversion needed!)
        const rawPCM = new Uint8Array(buf, dataOffset, Math.min(dataSize, 16384));

        // Load into engine
        const synth = getCMISynthInstance(targetInstrument?.id);
        if (synth) synth.loadSampleAll(rawPCM);

        // Create float waveform for display
        const display = new Float32Array(rawPCM.length);
        for (let i = 0; i < rawPCM.length; i++) {
          display[i] = (rawPCM[i] - 128) / 127;
        }

        setSampleName(sample.name);
        setSampleLoaded(true);
        setSampleWaveform(display);
        setLibraryLoading(false);
        console.log(`[CMI] Loaded "${sample.name}" from library — ${rawPCM.length} bytes → all voices`);
      })
      .catch((err) => {
        console.error('[CMI] Library sample load error:', err);
        setLibraryLoading(false);
      });
  }, [manifest, libraryCategoryIndex, targetInstrument]);

  const prevLibrarySample = useCallback(() => {
    const idx = librarySampleIndex <= 0 ? librarySamples.length - 1 : librarySampleIndex - 1;
    loadLibrarySample(idx);
  }, [librarySampleIndex, librarySamples.length, loadLibrarySample]);

  const nextLibrarySample = useCallback(() => {
    const idx = librarySampleIndex >= librarySamples.length - 1 ? 0 : librarySampleIndex + 1;
    loadLibrarySample(idx);
  }, [librarySampleIndex, librarySamples.length, loadLibrarySample]);

  // ── Preview/audition sample (one-shot playback without loading into synth) ─

  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const previewLibrarySample = useCallback(async (sampleIndex?: number) => {
    const idx = sampleIndex ?? librarySampleIndex;
    if (!manifest) return;
    const cat = manifest.categories[libraryCategoryIndex];
    if (!cat) return;
    const sample = cat.samples[idx];
    if (!sample) return;

    // Stop any current preview
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* already stopped */ }
      previewSourceRef.current = null;
    }

    const url = `/${CMI_SAMPLES_BASE}/${cat.name}/${encodeURIComponent(sample.file)}`;
    setPreviewing(true);
    try {
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const ctx = getDevilboxAudioContext();
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        previewSourceRef.current = null;
        setPreviewing(false);
      };
      source.start(0);
      previewSourceRef.current = source;
    } catch (err) {
      console.error('[CMI] Preview error:', err);
      setPreviewing(false);
    }
  }, [manifest, libraryCategoryIndex, librarySampleIndex]);

  const stopPreview = useCallback(() => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch { /* ok */ }
      previewSourceRef.current = null;
    }
    setPreviewing(false);
  }, []);

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

  // ── Voice status polling ────────────────────────────────────────────────

  const [voiceStatus, setVoiceStatus] = useState<Int32Array>(() => new Int32Array(64));

  useEffect(() => {
    const instId = targetInstrument?.id;
    if (instId == null) return;
    const synth = getCMISynthInstance(instId) as CMISynth | null;
    if (!synth || typeof synth.onVoiceStatus !== 'function') return;
    const unsub = synth.onVoiceStatus((status) => setVoiceStatus(new Int32Array(status)));
    return unsub;
  }, [targetInstrument?.id]);

  // ── Preset loading ──────────────────────────────────────────────────────

  const loadPreset = useCallback((index: number) => {
    const preset = CMI_PRESETS[index];
    if (!preset) return;
    for (const [key, value] of Object.entries(preset.params)) {
      handleParamChange(key, value);
    }
  }, [handleParamChange]);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    found: !!targetInstrument,
    instrumentName: targetInstrument?.name ?? '',
    chLabel,
    instrumentId: targetInstrument?.id,

    volume, waveSelect, waveBank, cutoff, filterTrack, attackTime, releaseTime, envRate,

    harmonics, customWaveform, builtinWaveform, envelopeCurve,

    sampleLoaded, sampleName, sampleWaveform,

    libraryCategories, libraryCategoryIndex, librarySamples, librarySampleIndex,
    libraryLoading, setLibraryCategoryIndex, loadLibrarySample,
    prevLibrarySample, nextLibrarySample,

    activeTab, setActiveTab,
    collapsed: cmiCollapsed,
    toggleCollapsed: toggleCMICollapsed,

    handleParamChange, selectWavePreset, loadSampleFromFile, syncHarmonicsToEngine,
    harmonicDragActive, updateHarmonicAt, startHarmonicDrag, endHarmonicDrag,

    voiceStatus,
    presets: CMI_PRESETS,
    loadPreset,

    previewing,
    previewLibrarySample,
    stopPreview,
  };
}
