/**
 * The Up Rough bass bar: tools/hiphop.py `render_bass_bar` for a plain event list (the legacy voice loop), i.e. the
 * per-note tail around `bass_voice_note` (mean removal, half-strength humanize resample, 4 ms fades, groove offset,
 * 0.85 * vel) and the bar tail (tube 1.4 / 0.12, tape_sat 1.2).
 *
 * NOT covered: the deep-trap delegation (`ev` a dict with "trap808" -> trap808 `render_808`); that renders through
 * bass808.ts. Style tables are not mirrored: the caller passes the style's `bass_voice`, `bass_cut` and the groove row
 * (the song file's `song.groove`, null -> no offset like the host's missing template).
 *
 * Float precision follows numpy: a humanize-resampled note is float32 (resample_ratio), so its gain multiply, fades
 * and the final 0.85 * vel multiply are float32 operations (python scalars are weak under NEP50); the mean is numpy's
 * pairwise sum. Parity fixture: tools/softsynth-fixtures/gen_bass_bar.py.
 */
import { npSum } from '@/engine/dj/scratch/refDsp';
import { pexp2 } from '@/engine/dj/scratch/portableMath';
import { tapeSat, tube } from '../effects/busEffects';
import { bassHumanizeSeed, humanizeDraw, linspaceAt, resampleRatio } from '../humanize';
import type { SongFileGroove } from '@/lib/uprough/songFile';
import { renderBassVoiceNote, type BassVoice } from './bassSynth';

/** One bass event: the host's (semi, step, dur_steps, glide[, vel]) tuple. */
export interface BassBarEvent { semi: number; step: number; durSteps: number; glide?: number | null; vel?: number }
export interface BassBarOptions { bpm: number; seed: number; bcut: number; groove: SongFileGroove | null }

/** hiphop._bass_groove_offset with the style's groove row passed in: odd 16ths swing, every note takes the kick push. */
export function bassGrooveOffset(groove: SongFileGroove | null, step: number, stepSamp: number, rate: number): number {
  if (!groove) return 0;
  let off = 0;
  if (Math.trunc(step) % 2 === 1) off += Math.trunc((groove.swing ?? 0.0) * stepSamp);
  off += Math.trunc((groove.micro?.kick ?? 0) * 1e-3 * rate);
  return off;
}

export function renderBassBar(voice: BassVoice, events: readonly BassBarEvent[], opts: BassBarOptions, rate: number): Float64Array {
  const stepSamp = Math.trunc(rate * 60.0 / (opts.bpm * 4));
  const barLen = stepSamp * 16;
  const buf = new Float64Array(barLen + Math.trunc(0.5 * rate));
  const fa = Math.trunc(0.004 * rate);
  for (const e of events) {
    const vel = e.vel ?? 1.0;
    const durS = e.durSteps * stepSamp / rate;
    const raw = renderBassVoiceNote(voice, { semi: e.semi, durS, glide: e.glide ?? null, seed: opts.seed + e.step, bcut: opts.bcut }, rate);
    // note - np.mean(note)
    const mean = npSum(raw, 0, raw.length) / raw.length;
    let note: Float64Array = raw.map((x) => x - mean);
    const h = humanizeDraw(bassHumanizeSeed(opts.seed, e.step));
    let f32 = false;
    if (Math.abs(h.cents) > 0.1) {
      note = resampleRatio(note, pexp2(h.cents * 0.5 / 1200.0));
      f32 = true;
    }
    const cast = f32 ? Math.fround : (x: number) => x;
    const g = cast(h.gain);
    note = note.map((x) => cast(x * g));
    if (note.length > 2 * fa) {
      for (let i = 0; i < fa; i++) note[i] = cast(note[i]! * linspaceAt(0, 1, fa, i));
      for (let i = 0; i < fa; i++) note[note.length - fa + i] = cast(note[note.length - fa + i]! * linspaceAt(1, 0, fa, i));
    }
    const o = Math.max(0, e.step * stepSamp + bassGrooveOffset(opts.groove, e.step, stepSamp, rate));
    const end = Math.min(buf.length, o + note.length);
    const c = cast(0.85 * vel);
    for (let i = o; i < end; i++) buf[i] = buf[i]! + cast(c * note[i - o]!);
  }
  return tapeSat(tube(buf.subarray(0, barLen), 1.4, 0.12), 1.2);
}
