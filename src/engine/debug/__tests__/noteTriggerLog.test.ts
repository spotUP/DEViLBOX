/**
 * The note trigger log behind get_note_trigger_log: records, caps at 512, clear empties, and ToneEngine.triggerNote
 * (the real method) writes into it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordNoteTrigger, getNoteTriggerLog, clearNoteTriggerLog, NOTE_TRIGGER_LOG_CAP,
} from '../noteTriggerLog';
import { ToneEngine } from '../../ToneEngine';

beforeEach(() => {
  clearNoteTriggerLog();
  (globalThis as { __noteTriggerLogEnabled?: boolean }).__noteTriggerLogEnabled = false;
});

describe('noteTriggerLog', () => {
  it('records an entry with its fields', () => {
    recordNoteTrigger('triggerNote', 3, 'C-4', 2);
    const [e] = getNoteTriggerLog();
    expect(e).toMatchObject({ source: 'triggerNote', instrumentId: 3, note: 'C-4', channel: 2, caller: [] });
  });

  it('caps at 512, keeping the newest', () => {
    for (let i = 0; i < NOTE_TRIGGER_LOG_CAP + 10; i++) recordNoteTrigger('triggerNote', i, 'C-4');
    const log = getNoteTriggerLog();
    expect(log).toHaveLength(NOTE_TRIGGER_LOG_CAP);
    expect(log[log.length - 1].instrumentId).toBe(NOTE_TRIGGER_LOG_CAP + 9);
    expect(getNoteTriggerLog(5)).toHaveLength(5);
  });

  it('clear empties the buffer and enables stack capture', () => {
    recordNoteTrigger('triggerNote', 1, 'C-4');
    clearNoteTriggerLog();
    expect(getNoteTriggerLog()).toHaveLength(0);
    recordNoteTrigger('triggerNote', 1, 'C-4');
    expect(getNoteTriggerLog()[0].caller.length).toBeGreaterThan(0);
  });

  it('ToneEngine.triggerNote adds an entry (wired proof)', () => {
    const fake = { amigaPeriodSong: false, getSafeTime: () => null };
    const config = { synthType: 'Synth', metadata: {} } as never;
    (ToneEngine.prototype.triggerNote as (...a: unknown[]) => void).call(fake, 7, 'D-3', 0.1, 0, 1, config, false, false, 4);
    const log = getNoteTriggerLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ source: 'triggerNote', instrumentId: 7, note: 'D-3', channel: 4 });
  });
});
