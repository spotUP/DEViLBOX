import * as Tone from 'tone';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';
import { xmNoteToString } from '@/lib/xmConversions';
import { NOTE_OFF } from '@/types/tracker';

/**
 * Play Row (Audition) - Play only the current row
 *
 * Classic tracker command (Keypad Enter in Impulse Tracker).
 * Plays the current row once without starting full pattern playback.
 * Used for quick testing of notes/instruments/effects.
 *
 * Triggers all notes in the current row across all channels.
 *
 * @returns true (always plays row)
 */
export async function playRow(): Promise<boolean> {
  // CRITICAL for iOS: Tone.start() MUST be called synchronously within user gesture
  Tone.start();
  const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];

  if (!pattern) {
    console.warn('[playRow] No pattern at index', currentPatternIndex);
    return true;
  }

  const engine = getToneEngine();
  const { instruments } = useInstrumentStore.getState();

  // Collect notes to play
  const notesToPlay: Array<{ instrumentId: number; noteStr: string; chIdx: number; instrument: typeof instruments[0] }> = [];

  pattern.channels.forEach((channel, chIdx) => {
    const cell = channel.rows[cursor.rowIndex];

    // Skip if no note (0 = empty, NOTE_OFF.note = note off)
    if (!cell.note || cell.note === 0 || cell.note === NOTE_OFF.note) return;

    const noteStr = xmNoteToString(cell.note);
    const instrumentId = cell.instrument || 0;

    if (instrumentId === 0) return;

    const instrument = instruments.find(i => i.id === instrumentId);
    if (!instrument) return;

    notesToPlay.push({ instrumentId, noteStr, chIdx, instrument });
  });

  // Ensure all instruments are ready (for WASM synths)
  await Promise.all(notesToPlay.map(n => engine.ensureInstrumentReady(n.instrument)));

  // Now trigger all notes
  for (const { instrumentId, noteStr, chIdx, instrument } of notesToPlay) {
    engine.triggerNoteAttack(instrumentId, noteStr, chIdx, 1, instrument);
  }

  return true;
}
