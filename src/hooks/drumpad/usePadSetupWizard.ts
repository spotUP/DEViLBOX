/**
 * usePadSetupWizard — Shared logic for the drum pad setup wizard.
 *
 * Guides users through pad configuration in 2-3 clicks:
 *   Step 1 → Choose source type (Sample, Synth, DJ FX, One Shot, Scratch, Clipboard)
 *   Step 2 → Choose sound (varies by source type)
 *   Step 3 → Quick config (name, color, play mode, mute group) — optional
 *
 * Both DOM and Pixi renderers consume this hook.
 */

import { useState, useCallback, useMemo } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { PAD_INSTRUMENT_BASE } from '@/types/drumpad';
import type { DrumType, DrumMachineType } from '@/types/instrument/drums';
import type { DjFxActionId } from '@/engine/drumpad/DjFxActions';
import type { ScratchActionId } from '@/types/drumpad';
import { DJ_FX_CATEGORY_COLORS, ONE_SHOT_CATEGORY_COLORS } from '@/constants/djPadModeDefaults';
import { DJ_ONE_SHOT_PRESETS } from '@/constants/djOneShotPresets';
import { colorToHex } from '@/pixi/colors';
import { SYNTH_QUICK_PRESETS, type SynthQuickPreset } from './useDJQuickAssignData';
import { SAMPLE_CATEGORY_LABELS, type SampleCategory } from '@/types/samplePack';
import type { SampleData } from '@/types/drumpad';
import { SAMPLE_PACKS } from '@/constants/samplePacks';
import { normalizeUrl } from '@/utils/urlUtils';
import { getAudioContext } from '@/audio/AudioContextSingleton';

// ── Types ───────────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3;

export type SourceType = 'sample' | 'synth' | 'djfx' | 'oneshot' | 'scratch' | 'clipboard';

export interface SourceTypeOption {
  type: SourceType;
  label: string;
  description: string;
  available: boolean;
}

// ── Sample categories for the quick grid ────────────────────────────────────

const DRUM_SAMPLE_CATEGORIES: SampleCategory[] = [
  'kicks', 'snares', 'hihats', 'claps', 'percussion', 'fx', 'bass', 'other',
];

export interface SampleCategoryOption {
  category: SampleCategory;
  label: string;
}

export const SAMPLE_CATEGORY_OPTIONS: SampleCategoryOption[] =
  DRUM_SAMPLE_CATEGORIES.map((cat) => ({
    category: cat,
    label: SAMPLE_CATEGORY_LABELS[cat],
  }));

// ── DJ FX quick options ─────────────────────────────────────────────────────

export interface DjFxOption {
  id: DjFxActionId;
  label: string;
  category: string;
  color: string;
}

export interface OneShotOption {
  presetIndex: number;
  label: string;
  category: string;
  color: string;
}

export interface ScratchOption {
  id: ScratchActionId;
  label: string;
  category: string;
  color: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePadSetupWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [padId, setPadId] = useState<number | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);

  // Step 3 — quick config
  const [padName, setPadName] = useState('');
  const [padColor, setPadColor] = useState<string | undefined>(undefined);
  const [playMode, setPlayMode] = useState<'oneshot' | 'sustain'>('oneshot');
  const [muteGroup, setMuteGroup] = useState(0);

  const clipboardPad = useDrumPadStore((s) => s.clipboardPad);
  const hasClipboard = clipboardPad !== null;

  // ── Source type options ──────────────────────────────────────────────────

  const sourceTypeOptions: SourceTypeOption[] = useMemo(() => [
    { type: 'sample',    label: 'Sample',        description: 'Pick a sample category', available: true },
    { type: 'synth',     label: 'Synth',          description: '808/909 drum voices',    available: true },
    { type: 'djfx',      label: 'DJ FX',          description: 'Momentary effects',      available: true },
    { type: 'oneshot',   label: 'One Shot',       description: 'Sound effects',           available: true },
    { type: 'scratch',   label: 'Scratch',        description: 'DJ scratch patterns',    available: true },
    { type: 'clipboard', label: 'From Clipboard', description: 'Paste copied pad',       available: hasClipboard },
  ], [hasClipboard]);

  // ── Open / Close ────────────────────────────────────────────────────────

  const open = useCallback((id: number) => {
    setPadId(id);
    setStep(1);
    setSourceType(null);
    setPadName('');
    setPadColor(undefined);
    setPlayMode('oneshot');
    setMuteGroup(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPadId(null);
    setStep(1);
    setSourceType(null);
  }, []);

  // ── Step 1: Select source type ──────────────────────────────────────────

  const selectSourceType = useCallback((type: SourceType) => {
    if (padId === null) return;
    setSourceType(type);

    if (type === 'clipboard') {
      // Instant paste — done in 1 click
      useDrumPadStore.getState().pastePad(padId);
      close();
      return;
    }

    setStep(2);
  }, [padId, close]);

  // ── Step 2: Select sound ────────────────────────────────────────────────

  const selectSampleCategory = useCallback(async (category: SampleCategory) => {
    if (padId === null) return;

    // Find first sample from any pack that has this category
    let sampleUrl: string | null = null;
    let sampleName = SAMPLE_CATEGORY_LABELS[category];
    for (const pack of SAMPLE_PACKS) {
      const samples = pack.samples[category];
      if (samples && samples.length > 0) {
        sampleUrl = samples[0].url;
        sampleName = samples[0].name;
        break;
      }
    }

    if (sampleUrl) {
      try {
        const resp = await fetch(normalizeUrl(sampleUrl));
        const arrayBuffer = await resp.arrayBuffer();
        const audioContext = getAudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const sampleData: SampleData = {
          id: `wiz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: sampleName,
          audioBuffer,
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          sourceUrl: sampleUrl,
        };
        await useDrumPadStore.getState().loadSampleToPad(padId, sampleData);
      } catch (err) {
        console.error('[PadSetupWizard] Failed to load sample:', err);
        // Fallback: just set the name
        useDrumPadStore.getState().updatePad(padId, { name: sampleName });
      }
    }

    setPadName(sampleName);
    setStep(3);
  }, [padId]);

  const selectSynthPreset = useCallback((preset: SynthQuickPreset) => {
    if (padId === null) return;
    setPadName(preset.label);
    // Apply synth immediately
    const synthType = preset.machine === '808' ? 'TR808' : 'TR909';
    const paramKey = preset.machine === '808' ? 'io808Type' : 'tr909Type';
    useDrumPadStore.getState().updatePad(padId, {
      name: preset.label,
      synthConfig: {
        id: PAD_INSTRUMENT_BASE + padId,
        name: preset.label,
        type: 'synth',
        synthType,
        drumMachine: {
          drumType: preset.drumType as DrumType,
          machineType: preset.machine as DrumMachineType,
          noteMode: 'pitch',
        },
        effects: [],
        volume: 0,
        pan: 0,
        parameters: { [paramKey]: preset.subType },
      },
      instrumentNote: preset.note,
    });
    setStep(3);
  }, [padId]);

  const selectDjFx = useCallback((actionId: DjFxActionId, name: string, category: string) => {
    if (padId === null) return;
    const catColor = DJ_FX_CATEGORY_COLORS[category] ?? 0x666666;
    useDrumPadStore.getState().updatePad(padId, {
      name,
      color: colorToHex(catColor),
      djFxAction: actionId,
      scratchAction: undefined,
      synthConfig: undefined,
      playMode: 'sustain',
    });
    close(); // 2 clicks — no Step 3 for DJ FX
  }, [padId, close]);

  const selectOneShot = useCallback((presetIndex: number, name: string, category: string) => {
    if (padId === null) return;
    const catColor = ONE_SHOT_CATEGORY_COLORS[category] ?? 0x666666;
    const preset = DJ_ONE_SHOT_PRESETS[presetIndex];
    
    if (!preset) {
      console.error('[PadSetupWizard] Invalid preset index:', presetIndex);
      return;
    }
    
    useDrumPadStore.getState().updatePad(padId, {
      name,
      color: colorToHex(catColor),
      synthConfig: {
        id: PAD_INSTRUMENT_BASE + padId,
        name: preset.name ?? name,
        type: preset.type ?? 'synth',
        synthType: preset.synthType ?? 'Synth',
        effects: preset.effects ?? [],
        volume: preset.volume ?? 0,
        pan: preset.pan ?? 0,
        ...preset, // Spread full preset config after defaults
      } as import('@/types/instrument/defaults').InstrumentConfig, // Preset is DeepPartial, cast to full type
      instrumentNote: 'C4',
      djFxAction: undefined,
      scratchAction: undefined,
      playMode: 'oneshot',
    });
    close(); // 2 clicks
  }, [padId, close]);

  const selectScratch = useCallback((actionId: ScratchActionId, name: string, color: string) => {
    if (padId === null) return;
    useDrumPadStore.getState().updatePad(padId, {
      name,
      color,
      scratchAction: actionId,
      djFxAction: undefined,
      synthConfig: undefined,
      playMode: 'oneshot',
    });
    close(); // 2 clicks
  }, [padId, close]);

  // ── Step 3: Finish (apply config) ───────────────────────────────────────

  const finish = useCallback(() => {
    if (padId === null) return;
    const updates: Record<string, unknown> = {};
    if (padName) updates.name = padName;
    if (padColor) updates.color = padColor;
    updates.playMode = playMode;
    updates.muteGroup = muteGroup;
    useDrumPadStore.getState().updatePad(padId, updates);
    close();
  }, [padId, padName, padColor, playMode, muteGroup, close]);

  const skip = useCallback(() => {
    // Skip Step 3 — apply only what was set in Step 2
    close();
  }, [close]);

  // ── Navigation ──────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (step === 3) setStep(2);
    else if (step === 2) { setStep(1); setSourceType(null); }
  }, [step]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const stepCount = sourceType === 'djfx' || sourceType === 'oneshot' || sourceType === 'scratch'
    ? 2  // These skip Step 3
    : 3;

  const synthPresetsByMachine = useMemo(() => {
    const map = new Map<string, SynthQuickPreset[]>();
    for (const p of SYNTH_QUICK_PRESETS) {
      const key = p.machine === '808' ? 'TR-808' : 'TR-909';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, []);

  return {
    isOpen,
    padId,
    step,
    sourceType,
    sourceTypeOptions,
    hasClipboard,

    // Step 3 config
    padName,
    setPadName,
    padColor,
    setPadColor,
    playMode,
    setPlayMode,
    muteGroup,
    setMuteGroup,

    // Data for step 2
    sampleCategories: SAMPLE_CATEGORY_OPTIONS,
    synthPresetsByMachine,

    // Actions
    open,
    close,
    selectSourceType,
    selectSampleCategory,
    selectSynthPreset,
    selectDjFx,
    selectOneShot,
    selectScratch,
    finish,
    skip,
    handleBack,
    stepCount,
  };
}
