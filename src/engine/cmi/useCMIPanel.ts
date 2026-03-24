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

import { useState, useCallback, useMemo, useRef } from 'react';
import { useInstrumentStore, useUIStore } from '@stores';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useShallow } from 'zustand/react/shallow';
import {
  NUM_HARMONICS, WAVE_SAMPLES, WAVE_NAMES,
  generateFromHarmonics, getBuiltinHarmonics, getBuiltinWaveform,
  cutoffToHz, filterResponseDb, formatCutoffHz, generateEnvelopeCurve,
} from './cmi-dsp-utils';

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

  // Tab
  activeTab: CMITab;
  setActiveTab: (tab: CMITab) => void;

  // Collapse
  collapsed: boolean;
  toggleCollapsed: () => void;

  // Callbacks
  handleParamChange: (key: string, value: number) => void;
  selectWavePreset: (bank: number) => void;

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
    },
    [handleParamChange]
  );

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

    volume, waveSelect, waveBank, cutoff, filterTrack, attackTime, releaseTime, envRate,

    harmonics, customWaveform, builtinWaveform, envelopeCurve,

    activeTab, setActiveTab,
    collapsed: cmiCollapsed,
    toggleCollapsed: toggleCMICollapsed,

    handleParamChange, selectWavePreset,
    harmonicDragActive, updateHarmonicAt, startHarmonicDrag, endHarmonicDrag,
  };
}
