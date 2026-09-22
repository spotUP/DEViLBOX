import { describe, it, expect } from 'vitest';
import { riddimChannelToKeep, medianNoteOf, BASS_REGISTER_CEILING } from '../riddimKeep';

/**
 * "i only heard drums no bass" (2026-09-22), after firing riddimSection on
 * `world class dub.mod`.
 *
 * The move mutes every channel whose ROLE is melodic, which is right only
 * while the roles are. That song classifies as:
 *
 *     ["pad", "percussion", "pad", "percussion"]   names: Pad 1, Snare, Pad 2, Kick
 *
 * No channel is labelled `bass` at all, and channel 0 — pitch 34-39,
 * monophonic, 24 onsets at density 0.375 — IS the bassline. So the breakdown
 * muted the bottom out of the song and left the drums alone.
 *
 * A riddim is drums AND bass. The move now guarantees that itself rather than
 * trusting the labels.
 */
describe('a riddim keeps its bass', () => {
  it('spares the lowest-register candidate when nothing is labelled bass', () => {
    // world class dub.mod: both "pads" are mute candidates; ch0 medians at 37.
    const keep = riddimChannelToKeep(
      [
        { channelIndex: 0, medianNote: 37 },
        { channelIndex: 2, medianNote: 55 },
      ],
      false,
    );
    expect(keep, 'the bassline was muted — this is the report').toBe(0);
  });

  it('mutes everything when a real bass channel already survives', () => {
    // A channel labelled `bass` is never a candidate, so the pads all go.
    expect(riddimChannelToKeep(
      [
        { channelIndex: 0, medianNote: 37 },
        { channelIndex: 2, medianNote: 55 },
      ],
      true,
    )).toBeNull();
  });

  it('spares nothing when every candidate is out of bass register', () => {
    // Two leads high up: this is a breakdown, not a bass rescue.
    expect(riddimChannelToKeep(
      [
        { channelIndex: 1, medianNote: 64 },
        { channelIndex: 2, medianNote: 72 },
      ],
      false,
    )).toBeNull();
  });

  it('does not spare the only melodic part — that would make the move a no-op', () => {
    expect(riddimChannelToKeep([{ channelIndex: 0, medianNote: 30 }], false)).toBeNull();
  });

  it('ignores silent candidates', () => {
    expect(riddimChannelToKeep(
      [
        { channelIndex: 0, medianNote: null },
        { channelIndex: 1, medianNote: 40 },
      ],
      false,
    )).toBe(1);
  });

  it('ties go to the earlier channel, so the choice is stable', () => {
    expect(riddimChannelToKeep(
      [
        { channelIndex: 3, medianNote: 40 },
        { channelIndex: 1, medianNote: 40 },
      ],
      false,
    )).toBe(3);
  });

  it('the register ceiling excludes parts nobody would call the bass', () => {
    expect(riddimChannelToKeep([
      { channelIndex: 0, medianNote: BASS_REGISTER_CEILING },
      { channelIndex: 1, medianNote: BASS_REGISTER_CEILING + 1 },
    ], false)).toBe(0);
  });
});

describe('medianNoteOf', () => {
  it('ignores empty cells and note-off', () => {
    expect(medianNoteOf([0, 0, 37, 97, 39])).toBe(38);
  });

  it('is null for a silent channel', () => {
    expect(medianNoteOf([0, 0, 97])).toBeNull();
  });

  it('takes the middle of an odd count', () => {
    expect(medianNoteOf([34, 37, 39])).toBe(37);
  });
});
