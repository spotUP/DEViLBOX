/**
 * The scratch sits in the mix, not on top of it (owner 2026-10-12: "the scratches lie in front of
 * everything, they don't blend in"). The Up Rough Demo System level-matches its scratch bus to the
 * music (`device_session.render_session`: the Deck-C bus scaled to 0.60 x the beat bus RMS, the beat
 * at 0.72 in the master sum, the scratch ducked up to 25 % on the beat's transients). Measured from
 * that render (`tools/scratch-fixtures/gen_scratch_level_reference.py`, 22,050 Hz, 400 ms windows):
 * while a scratch sounds its short-term RMS sits at -0.55 dB of the programme (median of 197
 * windows; -2.15 dB over the whole session). DEViLBOX's record voice played every record at a fixed
 * level, whatever the music: here the voice's bus level follows the programme to that ratio.
 */

import { SCRATCH_BUS } from './scratchBus';
import type { ScratchGesture } from './scratchTypes';

/** Reference: scratch short-term RMS against the programme while the scratch sounds (dB). */
export const SCRATCH_TO_PROGRAMME_DB = -0.55;

/** The bus level never leaves this range (a near-silent programme must not mute or blow up a scratch). */
export const SCRATCH_LEVEL_RANGE = [0.05, 1.5] as const;

/** RMS of a record from its attack to the end of its safe range (all channels). */
export function recordRms(buffer: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>, fromSec = 0, toSec = buffer.length / buffer.sampleRate): number {
  const a = Math.max(0, Math.floor(fromSec * buffer.sampleRate)), b = Math.min(buffer.length, Math.ceil(toSec * buffer.sampleRate));
  let sum = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = a; i < b; i++) { sum += d[i]! * d[i]!; n++; }
  }
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * The bus level that puts a record of `recordRmsValue` at the reference ratio against a programme of
 * `programmeRms`: the bus passes a record at its headroom and the small-signal drive slope.
 */
export function matchedBusLevel(programmeRms: number, recordRmsValue: number, gesture?: Pick<ScratchGesture, 'faderWindows'>): number {
  // a cut gesture is heard only while its fader is open: its RMS is the record's x sqrt(open share)
  const passed = recordRmsValue * SCRATCH_BUS.headroom * (1 + 3 * SCRATCH_BUS.drive) * Math.sqrt(openShare(gesture));
  if (!(programmeRms > 1e-4) || !(passed > 1e-6)) return 1;
  const level = Math.pow(10, SCRATCH_TO_PROGRAMME_DB / 20) * programmeRms / passed;
  return Math.max(SCRATCH_LEVEL_RANGE[0], Math.min(SCRATCH_LEVEL_RANGE[1], level));
}

/** Share of a gesture's cycle its fader is open (1 without windows: a throw, a fader-open stroke). */
export function openShare(gesture?: Pick<ScratchGesture, 'faderWindows'>): number {
  const w = gesture?.faderWindows ?? [];
  if (!w.length) return 1;
  const share = w.reduce((sum, x) => sum + Math.max(0, Math.min(1, x.open[1]) - Math.max(0, x.open[0])), 0);
  return Math.max(0.05, Math.min(1, share));
}

/**
 * The programme's RMS, followed over ~2 s from short reads (deck analysers, 100 ms apart):
 * an exponential average of the power, so one loud hit does not move the scratch.
 */
export class ProgrammeMeter {
  private power = 0;
  private primed = false;
  private readonly read: () => number | null;
  private readonly timeConstantSec: number;
  constructor(read: () => number | null, timeConstantSec = 2) {
    this.read = read;
    this.timeConstantSec = timeConstantSec;
  }

  /** One read `dtSec` after the last. */
  sample(dtSec: number): void {
    const v = this.read();
    if (v === null || !Number.isFinite(v)) return;
    const p = v * v;
    if (!this.primed) { this.power = p; this.primed = true; return; }
    const k = 1 - Math.exp(-dtSec / this.timeConstantSec);
    this.power += (p - this.power) * k;
  }

  get rms(): number | null { return this.primed ? Math.sqrt(this.power) : null; }
}
