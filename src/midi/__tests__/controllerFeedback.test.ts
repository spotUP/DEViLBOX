import { describe, it, expect } from 'vitest';
import {
  lampFor,
  lampDiff,
  lampMessage,
  allLampsOff,
  LAMP_VELOCITY,
  type DeckLampState,
  type MappedButton,
  type LampState,
} from '../controllerFeedback';

/**
 * The X-Touch Compact has no RGB LEDs (confirmed against the device,
 * 2026-09-23), so a button cannot show WHICH move it carries. It can show
 * whether the move is ON, which is the half that changes while you play.
 */
const base: DeckLampState = {
  toggled: new Set(),
  held: new Set(),
  activeRatePreset: null,
  mutedChannels: new Set(),
  armed: false,
};
const withState = (p: Partial<DeckLampState>): DeckLampState => ({ ...base, ...p });

describe('lampFor', () => {
  it('lights a latched toggle steadily', () => {
    expect(lampFor('dub.ringMod', withState({ toggled: new Set(['ringMod']) }))).toBe('on');
    expect(lampFor('dub.ringMod', base)).toBe('off');
  });

  it('BLINKS a held move, so the hand can tell a hold from a latch', () => {
    // A toggle stays down when you let go; a hold does not. Showing both the
    // same way is showing neither.
    expect(lampFor('dub.filterDrop', withState({ held: new Set(['filterDrop:g']) }))).toBe('blink');
  });

  it('lights the one active rate preset and no other', () => {
    const s = withState({ activeRatePreset: 'delayPresetQuarter' });
    expect(lampFor('dub.delayPresetQuarter', s)).toBe('on');
    expect(lampFor('dub.delayPresetDotted', s)).toBe('off');
  });

  it('lights a channel mute for its own channel only', () => {
    const s = withState({ mutedChannels: new Set([2]) });
    expect(lampFor('dub.channelMute.ch2', s)).toBe('on');
    expect(lampFor('dub.channelMute.ch3', s)).toBe('off');
  });

  it('blinks a per-channel hold on the channel it is held for', () => {
    const s = withState({ held: new Set(['echoBuildUp:5']) });
    expect(lampFor('dub.echoBuildUp.ch5', s)).toBe('blink');
    expect(lampFor('dub.echoBuildUp.ch4', s)).toBe('off');
  });

  it('lights the record arm', () => {
    expect(lampFor('dub.armed', withState({ armed: true }))).toBe('on');
    expect(lampFor('dub.armed', base)).toBe('off');
  });

  it('leaves a target this deck does not own dark', () => {
    expect(lampFor('dj.crossfader', base)).toBe('off');
    expect(lampFor('channel_solo_1', base)).toBe('off');
  });
});

describe('lampDiff', () => {
  const buttons: MappedButton[] = [
    { channel: 0, note: 16, target: 'dub.ringMod' },
    { channel: 0, note: 17, target: 'dub.tapeWobble' },
  ];

  it('sends only what changed', () => {
    const first = lampDiff(buttons, withState({ toggled: new Set(['ringMod']) }), new Map());
    expect(first.commands).toHaveLength(2); // nothing known yet

    const again = lampDiff(buttons, withState({ toggled: new Set(['ringMod']) }), first.next);
    expect(again.commands, 'a surface refreshed every render is a MIDI flood').toHaveLength(0);
  });

  it('sends the one lamp that moved', () => {
    const before = lampDiff(buttons, base, new Map()).next;
    const after = lampDiff(buttons, withState({ toggled: new Set(['tapeWobble']) }), before);
    expect(after.commands).toEqual([{ channel: 0, note: 17, state: 'on' }]);
  });

  it('sends the turn-off too, not just the turn-on', () => {
    const lit = lampDiff(buttons, withState({ toggled: new Set(['ringMod']) }), new Map()).next;
    const dark = lampDiff(buttons, base, lit);
    expect(dark.commands).toEqual([{ channel: 0, note: 16, state: 'off' }]);
  });
});

describe('lampMessage', () => {
  it('is a note-on carrying the state as velocity', () => {
    // The convention every X-Touch-class surface follows: 0 dark, 1 flashing,
    // 127 lit.
    expect(Array.from(lampMessage({ channel: 0, note: 16, state: 'on' }))).toEqual([0x90, 16, 127]);
    expect(Array.from(lampMessage({ channel: 0, note: 16, state: 'off' }))).toEqual([0x90, 16, 0]);
    expect(Array.from(lampMessage({ channel: 0, note: 16, state: 'blink' }))).toEqual([0x90, 16, 1]);
  });

  it('puts the channel in the status byte', () => {
    expect(lampMessage({ channel: 3, note: 40, state: 'on' })[0]).toBe(0x93);
  });

  it('never emits a byte outside MIDI range', () => {
    for (const state of ['off', 'on', 'blink'] as LampState[]) {
      const msg = lampMessage({ channel: 15, note: 127, state });
      for (const byte of msg) expect(byte).toBeLessThanOrEqual(255);
      expect(LAMP_VELOCITY[state]).toBeLessThanOrEqual(127);
    }
  });
});

describe('allLampsOff', () => {
  it('darkens every button, so a disconnect leaves nothing lit', () => {
    const buttons: MappedButton[] = [
      { channel: 0, note: 16, target: 'dub.ringMod' },
      { channel: 0, note: 24, target: 'dub.filterDrop' },
    ];
    expect(allLampsOff(buttons).every((c) => c.state === 'off')).toBe(true);
    expect(allLampsOff(buttons)).toHaveLength(2);
  });
});
