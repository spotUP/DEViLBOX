/**
 * A controller's buttons must not play the instrument.
 *
 * Reported 2026-09-23: with an X-Touch Compact attached, "i got a ringing beep
 * that i had to kill". The button's note-on at velocity 127 reached the
 * tracker's note path and struck the current instrument; the Hively player it
 * hit had already been torn down by a song load, so the note-off found nothing
 * to release. The dub panic that finally silenced it reported
 * `activeReleasers: 0` — the bus had never been involved.
 *
 * The first block proves the predicate. The second proves it is wired: the
 * X-Touch preset's own note table, fed through the same query the store uses,
 * must claim every one of its buttons and none of a keyboard's notes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { controllerOwnsNote } from '../controllerNoteOwnership';
import { getPresetById } from '../djControllerPresets';
import { getDJControllerMapper } from '../DJControllerMapper';

describe('controllerOwnsNote', () => {
  const owned = new Set(['0:16', '0:22', '1:11']);

  it('claims a note the preset maps as a button', () => {
    expect(controllerOwnsNote(owned, { channel: 0, note: 16 })).toBe(true);
  });

  it('claims it only on the channel the preset maps', () => {
    expect(controllerOwnsNote(owned, { channel: 1, note: 16 })).toBe(false);
    expect(controllerOwnsNote(owned, { channel: 1, note: 11 })).toBe(true);
  });

  it('leaves a note the preset does not map to the keyboard path', () => {
    expect(controllerOwnsNote(owned, { channel: 0, note: 60 })).toBe(false);
  });

  it('claims nothing when no preset is active', () => {
    expect(controllerOwnsNote(new Set(), { channel: 0, note: 16 })).toBe(false);
  });
});

describe('the X-Touch Compact preset, through the mapper', () => {
  const preset = getPresetById('behringer-xtouch-compact');

  it('exists', () => {
    expect(preset, 'the X-Touch preset is gone — the rest of this file is moot').toBeDefined();
  });

  it('claims every button it maps and no keyboard note', () => {
    // The singleton, because it is the object the store actually consults —
    // a fresh instance would prove the class and not the wiring.
    const mapper = getDJControllerMapper();
    mapper.setPreset(preset!);
    const owned = mapper.ownedNotes();

    for (const m of preset!.noteMappings) {
      expect(
        controllerOwnsNote(owned, { channel: m.channel, note: m.note }),
        `button note ${m.note} on channel ${m.channel} reached the instrument`,
      ).toBe(true);
    }
    // Middle C on the same channel: the exact note that rang on 2026-09-23.
    // A keyboard note the surface does not map stays a keyboard note.
    expect(controllerOwnsNote(owned, { channel: 0, note: 60 })).toBe(false);
  });

  it('releases every claim when the preset is cleared', () => {
    const mapper = getDJControllerMapper();
    mapper.setPreset(preset!);
    mapper.setPreset(null);
    expect(mapper.ownedNotes().size).toBe(0);
  });

  afterEach(() => {
    // Leave the singleton as this file found it.
    getDJControllerMapper().setPreset(null);
  });
});
