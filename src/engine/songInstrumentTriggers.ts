/**
 * Which instruments the song triggers, row by row, reported to the playback
 * tracker - so the sample editor's playhead moves while a song plays and the
 * instrument lists can light up the instruments being played.
 *
 * Read from the pattern cells at the play row, the same way DubEffectScanner
 * reads effect commands: every engine that moves the transport's play row
 * (the tracker replayer, libopenmpt, the native replayers) reports its
 * instruments this one way, with no per-engine hook.
 *
 * The transport's row updates are throttled, so a fast song can skip rows;
 * the rows between the last one seen and this one, in the same pattern, are
 * read too. A note without an instrument plays the channel's last one, as
 * in a tracker. A tone portamento (3xx / 5xx) slides the playing note
 * instead of starting one, so it is not an attack.
 */
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { notifyInstrumentAttack, notifyInstrumentRelease } from './instrumentPlaybackTracker';
import { samplePlaybackRate } from './samplePlaybackRate';
import type { TrackerCell } from '@typedefs/tracker';

const NOTE_OFF = 97;
const TONE_PORTA = 3, TONE_PORTA_VOLSLIDE = 5;
/** Rows read at most per update: a skip longer than this is a jump, not a throttle. */
const MAX_CATCH_UP = 16;

let lastPattern = -1;
let lastRow = -1;
let channelInstrument: number[] = [];
/** The song the position belongs to: another song starts from nothing. */
let lastPatterns: unknown = null;

function readCell(cell: TrackerCell | undefined, ch: number, time: number): void {
  if (!cell) return;
  if (cell.instrument > 0) channelInstrument[ch] = cell.instrument;
  const id = channelInstrument[ch];
  if (!id) return;
  if (cell.note === NOTE_OFF) { notifyInstrumentRelease(id); return; }
  if (!(cell.note >= 1 && cell.note <= 96)) return;
  if (cell.effTyp === TONE_PORTA || cell.effTyp === TONE_PORTA_VOLSLIDE) return;
  const inst = useInstrumentStore.getState().instruments.find((i) => i.id === id);
  notifyInstrumentAttack(id, time, samplePlaybackRate(inst, cell.note, cell.period));
}

/** Report the instruments triggered up to and including `row` of the playing pattern. */
export function reportRowTriggers(row: number): void {
  const tracker = useTrackerStore.getState();
  const patIdx = tracker.currentPatternIndex ?? 0;
  const pattern = tracker.patterns[patIdx];
  if (!pattern?.channels) return;
  if (tracker.patterns !== lastPatterns) { resetRowTriggers(); lastPatterns = tracker.patterns; }
  const from = patIdx === lastPattern && row > lastRow && row - lastRow <= MAX_CATCH_UP ? lastRow + 1 : row;
  if (patIdx === lastPattern && row === lastRow) return;
  lastPattern = patIdx;
  lastRow = row;
  if (channelInstrument.length !== pattern.channels.length) channelInstrument = new Array(pattern.channels.length).fill(0);
  let time: number;
  try { time = getDevilboxAudioContext().currentTime; } catch { return; } // no audio engine yet: nothing is sounding
  for (let r = from; r <= row; r++) {
    for (let ch = 0; ch < pattern.channels.length; ch++) readCell(pattern.channels[ch].rows[r], ch, time);
  }
}

/** Forget the play position and the channels' instruments (a new song, a stop). */
export function resetRowTriggers(): void {
  lastPatterns = null;
  lastPattern = -1;
  lastRow = -1;
  channelInstrument = [];
}

import { registerRowHook } from '@/lib/dev/rowTickHooks';
registerRowHook('instrumentTriggers', (row) => reportRowTriggers(row));
