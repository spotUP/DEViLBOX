import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';
import { xmNoteToString } from '@/lib/xmConversions';

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
export function playRow(): boolean {
  const { cursor, patterns, currentPatternIndex } = useTrackerStore.getState();
  const pattern = patterns[currentPatternIndex];
  const engine = getToneEngine();
  const { instruments } = useInstrumentStore.getState();

  // Play all notes in the current row across all channels
  pattern.channels.forEach((channel, chIdx) => {
    const cell = channel.rows[cursor.rowIndex];

    // Skip if no note (0 = empty, 97 = note off)
    if (!cell.note || cell.note === 0 || cell.note === 97) return;

    const noteStr = xmNoteToString(cell.note);
    const instrumentId = cell.instrument || 0;

    if (instrumentId === 0) return;

    const instrument = instruments.find(i => i.id === instrumentId);
    if (!instrument) return;

    engine.triggerNoteAttack(instrumentId, noteStr, chIdx, 1, instrument);
  });

  return true;
}
