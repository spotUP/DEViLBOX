/**
 * The Up Rough drum voices as SoftsynthVoice objects: each one is the matching function of
 * tools/drummachine.py (ported in src/engine/dj/scratch/demoDrums.ts, sample-exact) behind the ParameterDef
 * knobs of its Python keyword arguments, with the Python defaults (drummachine.VOICE_PARAMS).
 *
 * Note handling, the same for all: `tune` that is semitones (kick, snare, tom, conga) moves by (midi - 60);
 * `tune` that is a frequency ratio (hat, cowbell) is multiplied by 2^((midi - 60) / 12); velocity scales the
 * output; durSec is ignored (a drum's length is its own decay parameter). The render `seed` goes to the
 * Python `seed` argument where one exists (hat, rim, ride); the other voices' noise seeds are fixed in the
 * Python and stay fixed.
 */

import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import {
  CLAP808_PARAMS, CLAP909_PARAMS, DEMO_VOICE_PARAMS, KICK909_PARAMS,
  clap, conga, cowbell, hat, kick808, ride, rim, snare808, snare909, tom,
  type ClapParams, type DrumMachine, type HatParams, type KickParams, type SnareParams, type TomParams,
} from '@/engine/dj/scratch/demoDrums';
import { pexp2 } from '@/engine/dj/scratch/portableMath';
import type { SoftsynthNote, SoftsynthVoice } from '../softsynthVoice';
import { humanizeDraw, humanizeSeed, varyHit } from '../humanize';

/** Hi-hats have their own variation path in the Python (vary_hat_hit); the humanize knob is for the other drums. */
const NOT_HUMANIZED = new Set(['hatClosed', 'hatOpen', 'hatPedal']);
export const HUMANIZE_PARAM: ParameterDef = {
  key: 'humanize', label: 'Humanize', group: 'Humanize', type: 'knob', min: 0, max: 2, default: 0,
};

const knob = (key: string, label: string, def: number, min: number, max: number, group?: string): ParameterDef =>
  ({ key, label, group, type: 'knob', min, max, default: def });
const machineSelect = (def: DrumMachine): ParameterDef => ({
  key: 'machine', label: 'Machine', group: 'Character', type: 'select', default: Number(def),
  options: [{ value: 808, label: 'TR-808' }, { value: 909, label: 'TR-909' }],
});

const semitones = (note: SoftsynthNote): number => note.midi - 60;
const ratio = (note: SoftsynthNote): number => pexp2(semitones(note) / 12);
const machineOf = (v: number): DrumMachine => (Math.round(v) === 808 ? '808' : '909');
const scaled = (x: Float64Array, velocity: number): Float64Array => {
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * velocity;
  return x;
};

/** Build a voice; `get` reads a param with the declared default as fallback. */
function voice(
  id: string, label: string, params: readonly ParameterDef[],
  run: (get: (key: string) => number, note: SoftsynthNote, rate: number, seed: number) => Float64Array,
): SoftsynthVoice {
  const humanized = !NOT_HUMANIZED.has(id);
  const all = humanized ? [...params, HUMANIZE_PARAM] : params;
  const defaults = new Map(all.map((p) => [p.key, p.default]));
  return {
    id, label, params: all,
    render: (given, note, rate, seed) => {
      const get = (key: string): number => given[key] ?? defaults.get(key)!;
      let hit = run(get, note, rate, seed);
      // humanize 0 = off (bit-exact). `hit` (the instrument's trigger counter, not a ParameterDef) picks this trigger's variation.
      if (humanized && get('humanize') > 0) hit = varyHit(hit, humanizeDraw(humanizeSeed(seed, given.hit ?? 0)), get('humanize'), rate);
      return scaled(hit, note.velocity);
    },
  };
}

const kickKnobs = (d: KickParams): ParameterDef[] => [
  knob('tune', 'Tune', d.tune, -12, 36, 'Pitch'),
  knob('pitch_start', 'Pitch Drop', d.pitch_start, 0, 48, 'Pitch'),
  knob('pitch_decay', 'Pitch Drop Time', d.pitch_decay, 5, 200, 'Pitch'),
  knob('pitch_tail_ms', 'Pitch Tail Time', d.pitch_tail_ms, 20, 800, 'Pitch'),
  knob('pitch_tail_amt', 'Pitch Tail Amount', d.pitch_tail_amt, 0, 1, 'Pitch'),
  knob('amp_decay', 'Decay', d.amp_decay, 60, 1200, 'Amplitude'),
  knob('amp_punch', 'Punch', d.amp_punch, 0, 4, 'Amplitude'),
  knob('amp_punch_ms', 'Punch Time', d.amp_punch_ms, 1, 40, 'Amplitude'),
  knob('body_h3', 'Body Harmonics', d.body_h3, 0, 0.5, 'Amplitude'),
  knob('drive', 'Drive', d.drive, 0, 6, 'Amplitude'),
  knob('click', 'Click', d.click, 0, 1, 'Beater'),
  knob('click_ms', 'Click Decay', d.click_ms, 0.5, 20, 'Beater'),
  knob('click_len_ms', 'Click Length', d.click_len_ms, 1, 30, 'Beater'),
  knob('click_hp', 'Click High Pass', d.click_hp, 0, 4000, 'Beater'),
];
const KICK_KEYS = Object.keys(KICK909_PARAMS) as (keyof KickParams)[];

/** kick808; `tune` + (midi - 60) semitones; the Python has no seed (click noise seed 1). */
export const kickVoice: SoftsynthVoice = voice('kick', 'Kick', kickKnobs(DEMO_VOICE_PARAMS.kick808), (get, note, rate) => {
  const o: Partial<KickParams> = {};
  for (const k of KICK_KEYS) o[k] = get(k);
  o.tune = get('tune') + semitones(note);
  return kick808(o, rate);
});

const snareKnobs = (d: SnareParams): ParameterDef[] => [
  knob('tune', 'Tune', d.tune, 0, 48, 'Pitch'),
  knob('body_decay', 'Body Decay', d.body_decay, 20, 400, 'Amplitude'),
  knob('noise_amt', 'Noise Amount', d.noise_amt, 0, 1, 'Noise'),
  knob('noise_decay', 'Noise Decay', d.noise_decay, 20, 400, 'Noise'),
  knob('drive', 'Drive', d.drive, 0, 4, 'Amplitude'),
];
const snareRun = (fn: typeof snare808) => (get: (k: string) => number, note: SoftsynthNote, rate: number): Float64Array =>
  fn({ tune: get('tune') + semitones(note), noise_amt: get('noise_amt'), body_decay: get('body_decay'), noise_decay: get('noise_decay'), drive: get('drive') }, rate);

/** snare808 / snare909: `tune` + (midi - 60) semitones; fixed noise seeds 2 and 7. */
export const snare808Voice: SoftsynthVoice = voice('snare808', 'Snare 808', snareKnobs(DEMO_VOICE_PARAMS.snare808), snareRun(snare808));
export const snare909Voice: SoftsynthVoice = voice('snare909', 'Snare 909', snareKnobs(DEMO_VOICE_PARAMS.snare909), snareRun((o, r) => snare909(o, r)));

const CLAP_NUMERIC: ReadonlyArray<Exclude<keyof ClapParams, 'taps' | 'room_kind'>> =
  ['bright', 'tap_ms', 'tap_decay_ms', 'tail_decay_ms', 'tail_level', 'band_lo', 'band_hi', 'lp_stages', 'hp_stages', 'room_wet', 'room_decay', 'room_tail_ms', 'drive', 'body'];

/**
 * clap (default clap909 set). The tap onsets and the room kind are lists / names, not numbers: they come from
 * the Machine select (808: taps 0,10,20 and room; 909: taps 0,10,20,31 and hall); every numeric keyword is a knob
 * whose default is the 909 set. No pitch, so the note does not change the sound.
 */
export const clapVoice: SoftsynthVoice = voice('clap', 'Clap', [
  machineSelect('909'),
  knob('bright', 'Brightness', CLAP909_PARAMS.bright, 0.5, 2, 'Tone'),
  knob('band_lo', 'Band Low', CLAP909_PARAMS.band_lo, 200, 3000, 'Tone'),
  knob('band_hi', 'Band High', CLAP909_PARAMS.band_hi, 800, 6000, 'Tone'),
  knob('hp_stages', 'High Pass Stages', CLAP909_PARAMS.hp_stages, 0, 4, 'Tone'),
  knob('lp_stages', 'Low Pass Stages', CLAP909_PARAMS.lp_stages, 0, 4, 'Tone'),
  knob('tap_ms', 'Tap Length', CLAP909_PARAMS.tap_ms, 1, 12, 'Taps'),
  knob('tap_decay_ms', 'Tap Decay', CLAP909_PARAMS.tap_decay_ms, 0.5, 10, 'Taps'),
  knob('tail_decay_ms', 'Tail Decay', CLAP909_PARAMS.tail_decay_ms, 10, 200, 'Tail'),
  knob('tail_level', 'Tail Level', CLAP909_PARAMS.tail_level, 0, 1, 'Tail'),
  knob('body', 'Body', CLAP909_PARAMS.body, 0, 1, 'Tail'),
  knob('room_wet', 'Room Mix', CLAP909_PARAMS.room_wet, 0, 1, 'Room'),
  knob('room_decay', 'Room Decay', CLAP909_PARAMS.room_decay, 0.1, 1.5, 'Room'),
  knob('room_tail_ms', 'Room Tail', CLAP909_PARAMS.room_tail_ms, 0, 600, 'Room'),
  knob('drive', 'Drive', CLAP909_PARAMS.drive, 0, 4, 'Room'),
], (get, _note, rate) => {
  const base = machineOf(get('machine')) === '808' ? CLAP808_PARAMS : CLAP909_PARAMS;
  const o: Partial<ClapParams> = { taps: base.taps, room_kind: base.room_kind };
  for (const k of CLAP_NUMERIC) o[k] = get(k);
  return clap(o, rate, base);
});

const hatKnobs = (decay: number): ParameterDef[] => [
  machineSelect('909'),
  knob('tune', 'Tune', 1.0, 0.5, 2, 'Tone'),
  knob('noise', 'Noise', 1.0, 0, 2, 'Tone'),
  knob('decay', 'Decay', decay, 10, 900, 'Amplitude'),
  knob('start_ms', 'Start Offset', 0, 0, 40, 'Amplitude'),
  knob('lp', 'Low Pass Override', 0, 0, 16000, 'Filter'),
  knob('hp', 'High Pass Override', 0, 0, 12000, 'Filter'),
  knob('pcm_bits', 'Sample Bits Override', -1, -1, 16, 'Character'),
  knob('dirt', 'Dirt', 0, 0, 4, 'Character'),
];
const hatRun = (open: boolean) => (get: (k: string) => number, note: SoftsynthNote, rate: number, seed: number): Float64Array => {
  const o: Partial<HatParams> = {
    open_hat: open, machine: machineOf(get('machine')), tune: get('tune') * ratio(note), noise: get('noise'),
    decay: get('decay'), start_ms: get('start_ms'), lp: get('lp'), hp: get('hp'), dirt: get('dirt'), seed,
    pcm_bits: get('pcm_bits') < 0 ? undefined : get('pcm_bits'),
  };
  return hat(o, rate);
};

/** hat(open_hat=False): `decay` default is the 909's 70 ms (the 808's is 55; the knob replaces the machine default). */
export const hatClosedVoice: SoftsynthVoice = voice('hatClosed', 'Closed Hat', hatKnobs(70), hatRun(false));
/** hat(open_hat=True): `decay` default is the 909's 420 ms (the 808's is 380). */
export const hatOpenVoice: SoftsynthVoice = voice('hatOpen', 'Open Hat', hatKnobs(420), hatRun(true));
/**
 * The Python has no pedal hat. This is a TS-side preset, not a twin: hat(open_hat=False) with a 35 ms decay,
 * shorter than the closed hat, exact to the same Python function at that decay.
 */
export const hatPedalVoice: SoftsynthVoice = voice('hatPedal', 'Pedal Hat', hatKnobs(35), hatRun(false));

/** tom: `tune` + (midi - 60) semitones; no seed. */
export const tomVoice: SoftsynthVoice = voice('tom', 'Tom', [
  machineSelect('909'),
  knob('tune', 'Tune', 20, -12, 48, 'Pitch'),
  knob('pitch_drop', 'Pitch Drop', 8, 0, 24, 'Pitch'),
  knob('decay', 'Decay', 250, 60, 800, 'Amplitude'),
  knob('drive', 'Drive', 0.1, 0, 4, 'Amplitude'),
], (get, note, rate) => {
  const o: Partial<TomParams> = { machine: machineOf(get('machine')), tune: get('tune') + semitones(note), pitch_drop: get('pitch_drop'), decay: get('decay'), drive: get('drive') };
  return tom(o, rate);
});

/** rim: only the Machine select exists in the Python (plus `seed`, passed through); no pitch. */
export const rimVoice: SoftsynthVoice = voice('rim', 'Rim', [machineSelect('909')],
  (get, _note, rate, seed) => rim({ machine: machineOf(get('machine')), seed }, rate));

/** cowbell: `tune` is a ratio, multiplied by 2^((midi - 60) / 12); no seed. */
export const cowbellVoice: SoftsynthVoice = voice('cowbell', 'Cowbell', [
  knob('tune', 'Tune', 1.0, 0.5, 2, 'Tone'),
  knob('dirt', 'Dirt', 0, 0, 4, 'Character'),
], (get, note, rate) => cowbell({ tune: get('tune') * ratio(note), dirt: get('dirt') }, rate));

/** conga: `tune` + (midi - 60) semitones; no seed. */
export const congaVoice: SoftsynthVoice = voice('conga', 'Conga', [
  knob('tune', 'Tune', 32, 0, 60, 'Pitch'),
  knob('decay', 'Decay', 140, 40, 600, 'Amplitude'),
  knob('dirt', 'Dirt', 0, 0, 4, 'Character'),
], (get, note, rate) => conga({ tune: get('tune') + semitones(note), decay: get('decay'), dirt: get('dirt') }, rate));

/** ride: no pitch; `seed` goes to the Python seed. `pcm_bits` -1 = the machine's own (909: 6 bits). */
export const rideVoice: SoftsynthVoice = voice('ride', 'Ride', [
  machineSelect('909'),
  knob('pcm_bits', 'Sample Bits Override', -1, -1, 16, 'Character'),
  knob('dirt', 'Dirt', 0, 0, 4, 'Character'),
], (get, _note, rate, seed) => ride({ machine: machineOf(get('machine')), seed, dirt: get('dirt'), pcm_bits: get('pcm_bits') < 0 ? undefined : get('pcm_bits') }, rate));

export const DRUM_VOICES: readonly SoftsynthVoice[] = [
  kickVoice, snare808Voice, snare909Voice, clapVoice, hatClosedVoice, hatOpenVoice, hatPedalVoice,
  tomVoice, rimVoice, cowbellVoice, congaVoice, rideVoice,
];
