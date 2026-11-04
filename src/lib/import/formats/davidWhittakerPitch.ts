/**
 * davidWhittakerPitch.ts - the one place a David Whittaker note byte and a grid note are converted.
 *
 * A DW note byte is not a pitch on its own. davidwhittaker.c plays it as
 *   period = (periods[index] * sample.fine_tune_period) >> 10            (read_track_commands :2036, do_frame_stuff :2076)
 * where `periods` is the player variant's table (periods2 / periods3: a per-octave-doubling scale, not 428-lineage) and
 * fine_tune_period = 3579545 / the sample's tuning word, so the same byte sounds at a different pitch per sample.
 * The index is the byte plus the transposes this player applies. On the ticks the note sounds (do_frame_stuff) that is
 *   byte + channel transpose (when enabled) + global transpose (when enabled),
 * with the sample transpose folded into the byte only when the player has no channel transpose (it then stores the
 * transposed byte as the note, :1983). The old player (periods1) plays periods1[byte % 12] unscaled, with sample
 * byte / 12 (:1964).
 *
 * The grid names a note by that period (owner decision: the audible pitch) through periodNotes.ts, ProTracker naming
 * (period 428 = C-2 = note 25). The reverse map picks the byte that plays the named note with the cell's sample, so
 * the byte the walk read maps back to itself.
 */
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';
import { DW_WALK, type DwWalk, type DwWalkEvent } from './DavidWhittakerWasmExtractor';

/** What the replayer uses to turn a note byte into a period (read off the loaded module by dw_layout). */
export interface DwPitch {
  /** The variant's period table, as the replayer indexes it. */
  periods: number[];
  oldPlayer: boolean;
  sampleTranspose: boolean;
  channelTranspose: boolean;
  globalTranspose: boolean;
  /** Per sample: fine_tune_period and transpose. */
  samples: Array<{ fineTunePeriod: number; transpose: number }>;
}

/** The channel and global transposes in force when a note runs (the walk's transpose commands; 0 until one runs). */
export interface DwTransposes { channel: number; global: number }

export const NO_TRANSPOSE: DwTransposes = { channel: 0, global: 0 };

/** The semitones the replayer adds to a note byte before the table lookup on the ticks the note sounds. */
function indexOffset(pitch: DwPitch, sample: number, t: DwTransposes): number {
  let off = 0;
  if (pitch.globalTranspose) off += t.global;
  if (pitch.channelTranspose) off += t.channel;
  else if (pitch.sampleTranspose) off += pitch.samples[sample]?.transpose ?? 0;
  return off;
}

/** The Paula period the replayer plays note byte `byte` at with sample `sample`; 0 when it plays none. */
export function dwBytePeriod(pitch: DwPitch, byte: number, sample: number, t: DwTransposes = NO_TRANSPOSE): number {
  const count = pitch.periods.length;
  if (count === 0) return 0;
  if (pitch.oldPlayer) return pitch.periods[byte % 12] ?? 0;
  const ftp = pitch.samples[sample]?.fineTunePeriod ?? 0;
  if (ftp <= 0) return 0;
  const idx = Math.max(0, Math.min(count - 1, byte + indexOffset(pitch, sample, t)));
  return (pitch.periods[idx] * ftp) >> 10;
}

/** The grid note (1..96, ProTracker naming) note byte `byte` plays with sample `sample`; 0 when outside the grid. */
export function dwByteToNote(pitch: DwPitch, byte: number, sample: number, t: DwTransposes = NO_TRANSPOSE): number {
  const period = dwBytePeriod(pitch, byte, sample, t);
  if (period <= 0) return 0;
  const n = periodToNote(period);
  return n >= 1 && n <= 96 ? n : 0;
}

/**
 * The note byte that plays grid note `note` with sample `sample` (the inverse of dwByteToNote): of the bytes that
 * map to `note`, the one whose period is closest to the note's own period; null when no byte plays it.
 */
export function dwNoteToByte(pitch: DwPitch, note: number, sample: number, t: DwTransposes = NO_TRANSPOSE): number | null {
  if (note < 1 || note > 96) return null;
  const target = noteToPeriod(note);
  const span = pitch.oldPlayer ? 12 : pitch.periods.length;
  const base = pitch.oldPlayer ? Math.max(0, sample) * 12 : 0;
  let best: number | null = null;
  let bestErr = Infinity;
  for (let i = 0; i < span; i++) {
    const byte = pitch.oldPlayer ? base + i : i - indexOffset(pitch, sample, t);
    if (byte < 0 || byte > 0x7f) continue;
    if (dwByteToNote(pitch, byte, sample, t) !== note) continue;
    const err = Math.abs(Math.log(dwBytePeriod(pitch, byte, sample, t) / target));
    if (err < bestErr) { bestErr = err; best = byte; }
  }
  return best;
}

/**
 * The transposes in force when each walk event runs, from the walk's own transpose commands (each voice's channel
 * transpose, the song's global one; both start at 0 as the replayer initialises them).
 */
export function dwWalkTransposes(walk: DwWalk): Map<DwWalkEvent, DwTransposes> {
  const channel = new Array<number>(Math.max(1, walk.channels)).fill(0);
  let global = 0;
  const out = new Map<DwWalkEvent, DwTransposes>();
  for (const e of walk.events) {
    if (e.kind === DW_WALK.channelTranspose && e.channel < channel.length) channel[e.channel] = e.a;
    else if (e.kind === DW_WALK.globalTranspose) global = e.a;
    out.set(e, { channel: channel[e.channel] ?? 0, global });
  }
  return out;
}
