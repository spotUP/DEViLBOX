/**
 * Factory sound cues (R2f): one short sound per real stage, rendered by the same voice builders the song uses, played
 * about 10 dB under the voices. Rendering is cached; playing needs a user gesture (the toggle is one).
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { SOFTSYNTH_RATE, voiceDefaults, type SoftsynthVoice } from '@/engine/uprough/softsynthVoice';
import { oneShotBuffer } from './voiceAudition';
import { cowbellVoice, hatClosedVoice, metalVoice, rimVoice, shakerVoice, tambVoice, tomVoice } from '@/engine/uprough/voices/drums';

export type Cue = 'pop' | 'attach' | 'stage' | 'stamp' | 'gear' | 'conveyor' | 'finish';

const CUES: Record<Cue, { voice: SoftsynthVoice; midi: number; dur: number }> = {
  pop: { voice: rimVoice, midi: 60, dur: 0.1 },
  attach: { voice: cowbellVoice, midi: 52, dur: 0.15 },
  stage: { voice: hatClosedVoice, midi: 48, dur: 0.05 },
  stamp: { voice: tomVoice, midi: 40, dur: 0.2 },
  gear: { voice: shakerVoice, midi: 48, dur: 0.1 },
  conveyor: { voice: tambVoice, midi: 48, dur: 0.1 },
  finish: { voice: metalVoice, midi: 48, dur: 0.4 },
};

/** About -10 dB. */
export const CUE_GAIN = 0.316;

const cache = new Map<Cue, AudioBuffer>();

function bufferOf(ctx: BaseAudioContext, cue: Cue): AudioBuffer {
  let buf = cache.get(cue);
  if (!buf) {
    const c = CUES[cue];
    const data = c.voice.render(voiceDefaults(c.voice), { midi: c.midi, durSec: c.dur, velocity: 0.8 }, SOFTSYNTH_RATE, 7);
    buf = oneShotBuffer(ctx, data, SOFTSYNTH_RATE);
    cache.set(cue, buf);
  }
  return buf;
}

export function playCue(cue: Cue): void {
  try {
    const ctx = getDevilboxAudioContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = CUE_GAIN;
    src.buffer = bufferOf(ctx, cue);
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    // No audio device: the cue is a courtesy, the show goes on.
  }
}
