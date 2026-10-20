/** Every voice the UpRoughSoftsynth instrument can play, by id, each with the insert-effect chain appended. */
import type { SoftsynthVoice } from './softsynthVoice';
import { bass808Voice } from './voices/bass808';
import { pianoVoice } from './voices/piano';
import { BASS_VOICE_SOFTSYNTHS } from './voices/bassVoices';
import { DRUM_VOICES, PERCUSSION_VOICES } from './voices/drums';
import { INSERT_PARAMS, applyInserts } from './effects/insertEffects';

/** Voice params + the 'Effects' group; the render runs the voice, then the enabled inserts (all off by default = bit-exact voice). */
function withInserts(voice: SoftsynthVoice): SoftsynthVoice {
  return {
    ...voice,
    params: [...voice.params, ...INSERT_PARAMS],
    render: (params, note, rate, seed) => applyInserts(voice.render(params, note, rate, seed), params, rate),
  };
}

export const SOFTSYNTH_VOICES: readonly SoftsynthVoice[] = [bass808Voice, pianoVoice, ...DRUM_VOICES, ...BASS_VOICE_SOFTSYNTHS, ...PERCUSSION_VOICES].map(withInserts);

export function getSoftsynthVoice(id: string): SoftsynthVoice | undefined {
  return SOFTSYNTH_VOICES.find((v) => v.id === id);
}
