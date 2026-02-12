/**
 * useChannelAutomationParams - Resolves automatable parameters for a channel's instrument
 *
 * Channel → instrumentId → synthType → getNKSParametersForSynth() → filter isAutomatable
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { NKSSection } from '@/midi/performance/types';
import type { NKSParameter } from '@/midi/performance/types';
import type { SynthType } from '@typedefs/instrument';

export interface AutomatableParamInfo {
  key: string;         // NKS param id — used as automation curve key
  name: string;        // Display name
  shortLabel: string;  // 3-char label for compact views
  section: string;     // NKSSection value
  color: string;       // CSS variable
  min: number;
  max: number;
}

export interface ParameterGroup {
  label: string;
  section: string;
  params: AutomatableParamInfo[];
}

/** Map NKSSection → CSS variable */
export function getSectionColor(section: string): string {
  switch (section) {
    case NKSSection.FILTER:
      return 'var(--color-synth-filter)';
    case NKSSection.ENVELOPE:
      return 'var(--color-synth-envelope)';
    case NKSSection.SYNTHESIS:
      return 'var(--color-synth-accent)';
    case NKSSection.LFO:
    case NKSSection.MODULATION:
      return 'var(--color-synth-pan)';
    case NKSSection.EFFECTS:
      return 'var(--color-synth-effects)';
    case NKSSection.OUTPUT:
    case NKSSection.MIXER:
      return 'var(--color-synth-volume)';
    case NKSSection.SEQUENCER:
    case NKSSection.ARP:
      return 'var(--color-synth-drive)';
    default:
      return 'var(--color-synth-filter)';
  }
}

/** Generate a 3-char short label from a parameter name */
function makeShortLabel(name: string): string {
  // Common abbreviations
  const abbrevs: Record<string, string> = {
    'Cutoff': 'Cut', 'Resonance': 'Res', 'Volume': 'Vol',
    'Feedback': 'Fb', 'Algorithm': 'Alg', 'Decay': 'Dec',
    'Attack': 'Atk', 'Release': 'Rel', 'Sustain': 'Sus',
    'Detune': 'Det', 'Level': 'Lvl', 'Env Mod': 'Env',
    'Accent': 'Acc', 'Tuning': 'Tun', 'Waveform': 'Wav',
    'Distortion': 'Dst', 'Portamento': 'Prt', 'Unison': 'Uni',
  };
  if (abbrevs[name]) return abbrevs[name];
  // Fall back to first 3 chars
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3);
}

/** Convert NKSParameter[] to AutomatableParamInfo[] */
function nksToAutomatable(params: NKSParameter[]): AutomatableParamInfo[] {
  return params
    .filter((p) => p.isAutomatable)
    .map((p) => ({
      key: p.id,
      name: p.name,
      shortLabel: makeShortLabel(p.name),
      section: p.section,
      color: getSectionColor(p.section),
      min: p.min,
      max: p.max,
    }));
}

/** Group flat param list by NKSSection */
export function groupParamsBySection(params: AutomatableParamInfo[]): ParameterGroup[] {
  const map = new Map<string, AutomatableParamInfo[]>();
  for (const p of params) {
    if (!map.has(p.section)) map.set(p.section, []);
    map.get(p.section)!.push(p);
  }
  return Array.from(map.entries()).map(([section, sectionParams]) => ({
    label: section,
    section,
    params: sectionParams,
  }));
}

/** Get automatable params for a channel (non-reactive, for engine use) */
export function getAutomatableParamsForChannel(
  channelIndex: number,
  patternIndex: number,
): AutomatableParamInfo[] {
  const { patterns } = useTrackerStore.getState();
  const pattern = patterns[patternIndex];
  if (!pattern) return [];

  const channel = pattern.channels[channelIndex];
  if (!channel || channel.instrumentId === null) return [];

  const instrument = useInstrumentStore.getState().getInstrument(channel.instrumentId);
  if (!instrument) return [];

  const nksParams = getNKSParametersForSynth(instrument.synthType as SynthType);
  return nksToAutomatable(nksParams);
}

/** React hook: subscribes to stores with targeted selectors, memoized */
export function useChannelAutomationParams(channelIndex: number): {
  params: AutomatableParamInfo[];
  groups: ParameterGroup[];
  synthType: string | null;
  instrumentName: string | null;
} {
  // Targeted selector — only re-renders when this channel's instrumentId changes
  const instrumentId = useTrackerStore(
    (s) => s.patterns[s.currentPatternIndex]?.channels[channelIndex]?.instrumentId ?? null
  );

  // Narrow selector — only re-renders when this specific instrument's synthType or name changes
  const instrumentInfo = useInstrumentStore(
    useShallow((s) => {
      if (instrumentId === null) return null;
      const inst = s.instruments.find((i) => i.id === instrumentId);
      return inst ? { synthType: inst.synthType, name: inst.name } : null;
    })
  );

  return useMemo(() => {
    if (!instrumentInfo)
      return { params: [], groups: [], synthType: null, instrumentName: null };

    const nksParams = getNKSParametersForSynth(instrumentInfo.synthType as SynthType);
    const params = nksToAutomatable(nksParams);
    const groups = groupParamsBySection(params);

    return {
      params,
      groups,
      synthType: instrumentInfo.synthType,
      instrumentName: instrumentInfo.name,
    };
  }, [instrumentInfo]);
}
