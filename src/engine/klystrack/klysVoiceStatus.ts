/**
 * Where the playing voice of an instrument is, for the editor curves' live markers (CV-1.5).
 * Input is the worklet's voiceStatus report (klys_get_channel_voice); pure, no engine access.
 */
import type { KlysChannelVoice } from './KlysEngine';

export const KLYS_AUDITION_CHANNEL = 31;
export const KLYS_NO_INSTRUMENT = 0xff;

export type KlysEnvelopeStage = 'attack' | 'decay' | 'sustain' | 'release' | 'off';
const STAGES: readonly KlysEnvelopeStage[] = ['attack', 'decay', 'sustain', 'release', 'off'];

export interface KlysVoiceMarker {
  channel: number;
  stage: KlysEnvelopeStage;
  /** Seconds since the note was triggered (the envelope marker's x). */
  elapsedSeconds: number;
  /** Volume envelope level 0..1 (the envelope marker's y). */
  level: number;
  /** Effective filter cutoff in cyd units 0..2047 (the filter marker's x). */
  cutoff: number;
  resonance: number;
  pulseWidth: number;
}

/**
 * The voice to mark for `instrument`: among the channels playing it that have not finished, the one triggered most
 * recently (smallest elapsed time); the audition channel wins when it qualifies, because the editor's own preview
 * is what the owner is looking at. Null when nothing is sounding it.
 */
export function voiceMarkerFor(channels: readonly KlysChannelVoice[], instrument: number): KlysVoiceMarker | null {
  let best: KlysChannelVoice | null = null;
  for (const c of channels) {
    if (c.instrument !== instrument || !c.active || c.tickRate <= 0) continue;
    if (c.channel === KLYS_AUDITION_CHANNEL) { best = c; break; }
    if (best === null || c.elapsedTicks < best.elapsedTicks) best = c;
  }
  if (best === null) return null;
  return {
    channel: best.channel,
    stage: STAGES[best.stage] ?? 'off',
    elapsedSeconds: best.elapsedTicks / best.tickRate,
    level: best.level,
    cutoff: best.cutoff,
    resonance: best.resonance,
    pulseWidth: best.pulseWidth,
  };
}
