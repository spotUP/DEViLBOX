/**
 * The non-808 Up Rough bass voices as softsynth voices (hiphop `bass_voice_note` for the style's bass_voice:
 * sampled, electric, warmsub, gfunk, electro, reese and the plain-sub "808"). One softsynth voice per name, so a
 * song-file instrument and a tracker note both pick one.
 *
 * Pitch: the host's bass cell is note_name(36 + semi) (tools/song_file.py export, the non-808 branch ~:259, and the
 * 808 branch ~:240), so `semi = midi - 36` in the host's numbering, the same as bass808.ts BASS808_C1_MIDI (the
 * voice gets the host midi, SoftsynthNote). render_bass_bar (tools/hiphop.py ~:3604 bass_voice_note) then plays
 * `semi - 12` itself.
 *
 * LIMIT: a per-trigger render is ONE bass_voice_note (the note's seed is the instrument seed; bcut 1.0; velocity is the
 * host's final `0.85 * vel` gain minus the 0.85). The groove offset, the glide from the previous note, the per-step
 * seed (song seed + step), mean removal, humanize, fades and the bar tail (tube / tape_sat) belong to the bar-level
 * side-table player (ledger O6, owner decision open), so tracker playback of these voices is NOT yet 1:1 with the host.
 */
import type { SoftsynthNote, SoftsynthVoice } from '../softsynthVoice';
import { renderBassVoiceNote, type BassVoice } from './bassSynth';
import { BASS808_C1_MIDI } from './bass808';

function bassVoice(id: string, label: string, voice: BassVoice): SoftsynthVoice {
  return {
    id,
    label,
    params: [],
    render(_params: Readonly<Record<string, number>>, note: SoftsynthNote, rate: number, seed: number): Float64Array {
      const raw = renderBassVoiceNote(voice, { semi: note.midi - BASS808_C1_MIDI, durS: note.durSec, glide: null, seed }, rate);
      return note.velocity === 1 ? raw : raw.map((x) => x * note.velocity);
    },
  };
}

export const BASS_VOICE_SOFTSYNTHS: readonly SoftsynthVoice[] = [
  bassVoice('bassSampled', 'Up Rough Sampled Bass', 'sampled'),
  bassVoice('bassElectric', 'Up Rough Electric Bass', 'electric'),
  bassVoice('bassWarmsub', 'Up Rough Warm Sub Bass', 'warmsub'),
  bassVoice('bassGfunk', 'Up Rough G-Funk Bass', 'gfunk'),
  bassVoice('bassElectro', 'Up Rough Electro Bass', 'electro'),
  bassVoice('bassReese', 'Up Rough Reese Bass', 'reese'),
  bassVoice('bassVoice808', 'Up Rough Plain Sub Bass', '808'),
];
