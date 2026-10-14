import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';
import { xmNoteToToneJS } from '@/lib/xmConversions';
import { unlockIOSAudio } from '@utils/ios-audio-unlock';
import type { Pattern, TrackerCell } from '@/types/tracker';

/** How long a previewed note sounds before its release (row preview and note-at-cursor preview). */
export const PREVIEW_HOLD_MS = 500;

/**
 * The instrument a note in `channel` at `row` plays: its own number, else the last one written above it in the
 * pattern (a tracker note without an instrument keeps the channel's instrument), else the selected instrument.
 */
export function previewInstrumentId(pattern: Pattern, channel: number, row: number): number {
  const rows = pattern.channels[channel]?.rows;
  if (rows) for (let r = row; r >= 0; r--) if (rows[r]?.instrument) return rows[r]!.instrument;
  return useInstrumentStore.getState().currentInstrumentId || 1;
}

/**
 * Sound one cell's note on its instrument for PREVIEW_HOLD_MS and flash channel `channelIndex`'s VU meter with it, as
 * playback does for each note it starts. The one note-preview path: the row preview (playRow) and the note-at-cursor
 * preview both come here. Returns false when the cell holds no playable note.
 */
export function previewCell(cell: TrackerCell | undefined, instrumentId: number, channelIndex: number): boolean {
  if (!cell || !cell.note) return false;
  const toneNote = xmNoteToToneJS(cell.note);
  if (!toneNote) return false;
  const inst = useInstrumentStore.getState().getInstrument(instrumentId);
  if (!inst) return false;
  const velocity = cell.volume ? Math.min(cell.volume / 64, 1) : 0.8;
  const engine = getToneEngine();
  void engine.ensureInstrumentReady(inst).then(() => {
    engine.triggerNoteAttack(inst.id, toneNote, 0, velocity, inst);
    engine.triggerChannelMeter(channelIndex, velocity);
    setTimeout(() => engine.triggerNoteRelease(inst.id, toneNote, 0, inst), PREVIEW_HOLD_MS);
  });
  return true;
}

/**
 * Play Row (Audition) - sound every note of the row under the cursor once, without starting playback.
 * A muted channel stays silent and its meter dark, as in playback (TrackerReplayer.triggerNote).
 *
 * Classic tracker command (Keypad Enter in Impulse Tracker, Enter step play in ProTracker).
 * Returns how many notes it sounded.
 */
export function playRow(): number {
  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  unlockIOSAudio();
  void Tone.start();
  const { cursor } = useCursorStore.getState();
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  if (!pattern) return 0;

  const engine = getToneEngine();
  let sounded = 0;
  pattern.channels.forEach((channel, chIdx) => {
    if (engine.isChannelMuted(chIdx)) return;
    const cell = channel.rows[cursor.rowIndex];
    if (previewCell(cell, previewInstrumentId(pattern, chIdx, cursor.rowIndex), chIdx)) sounded++;
  });
  return sounded;
}
