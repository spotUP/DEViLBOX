/**
 * Factory sound cues (R2f): one short sound per real stage, rendered by the same voice builders the song uses, played
 * about 10 dB under the voices. Rendering is cached; playing needs a user gesture (the toggle is one).
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { SOFTSYNTH_RATE, voiceDefaults, type SoftsynthVoice } from '@/engine/uprough/softsynthVoice';
import { oneShotBuffer } from './voiceAudition';
import { cowbellVoice, hatClosedVoice, metalVoice, rimVoice, shakerVoice, tambVoice, tomVoice } from '@/engine/uprough/voices/drums';

export type Cue = 'pop' | 'attach' | 'tick' | 'stage' | 'stamp' | 'gear' | 'conveyor' | 'finish';

const CUES: Record<Cue, { voice: SoftsynthVoice; midi: number; dur: number }> = {
  pop: { voice: rimVoice, midi: 60, dur: 0.1 },
  attach: { voice: cowbellVoice, midi: 52, dur: 0.15 },
  tick: { voice: hatClosedVoice, midi: 60, dur: 0.03 },
  stage: { voice: hatClosedVoice, midi: 48, dur: 0.05 },
  stamp: { voice: tomVoice, midi: 40, dur: 0.2 },
  gear: { voice: shakerVoice, midi: 48, dur: 0.1 },
  conveyor: { voice: tambVoice, midi: 48, dur: 0.1 },
  finish: { voice: metalVoice, midi: 48, dur: 0.4 },
};

/** About -10 dB. */
export const CUE_GAIN = 0.316;

/** Semitones a cue rises per step (the stage cues climb with k, G16). */
export const CUE_STEP_SEMITONES = 2;

const cache = new Map<string, AudioBuffer>();

function bufferOf(ctx: BaseAudioContext, cue: Cue, step: number): AudioBuffer {
  const key = `${cue}:${step}`;
  let buf = cache.get(key);
  if (!buf) {
    const c = CUES[cue];
    const data = c.voice.render(voiceDefaults(c.voice), { midi: c.midi + step * CUE_STEP_SEMITONES, durSec: c.dur, velocity: 0.8 }, SOFTSYNTH_RATE, 7);
    buf = oneShotBuffer(ctx, data, SOFTSYNTH_RATE);
    cache.set(key, buf);
  }
  return buf;
}

/** Plays `cue`; `step` raises its pitch by CUE_STEP_SEMITONES per step (rising stage cues). */
export function playCue(cue: Cue, step = 0): void {
  try {
    const ctx = getDevilboxAudioContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = CUE_GAIN;
    src.buffer = bufferOf(ctx, cue, step);
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    // No audio device: the cue is a courtesy, the show goes on.
  }
}
