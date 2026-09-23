import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectDJPreset } from '../../djControllerPresets';
import {
  buildXTouchFeedbackMessages,
  encodeXTouchPitchBend,
  type XTouchFeedbackState
} from '../../xTouchFeedback';

const FEEDBACK_STATE: XTouchFeedbackState = {
  crossfader: 0.5,
  masterVolume: 0.8,
  channelMutes: [false, true, false, false, false, false, false, false],
  channelSolos: [false, false, false, true, false, false, false, false],
  activeMoveNotes: new Set([16]),
  deckA: {
    volume: 0.75,
    eqHi: 0.6,
    eqMid: 0.55,
    eqLow: 0.45,
    filter: 0.25,
    filterQ: 0.7,
    pitch: 6,
    isPlaying: true,
    pfl: false,
    looping: true,
  },
  deckB: {
    volume: 0.65,
    eqHi: 0.4,
    eqMid: 0.5,
    eqLow: 0.35,
    filter: 0.8,
    filterQ: 0.3,
    pitch: -3,
    isPlaying: false,
    pfl: true,
    looping: false,
  },
  dub: {
    echoWet: 0.55,
    echoIntensity: 0.62,
    echoRateMs: 300,
    springWet: 0.4,
    returnGain: 0.85,
    hpfCutoff: 40,
    sidechainAmount: 0.15,
  },
};

describe('X-Touch support', () => {
  it('detects X-Touch Compact before the generic X-Touch preset', () => {
    expect(detectDJPreset('Behringer X-Touch Compact')?.id).toBe('behringer-xtouch-compact');
  });

  it('detects X-Touch One before the generic X-Touch preset', () => {
    expect(detectDJPreset('Behringer X-Touch One')?.id).toBe('behringer-xtouch-one');
  });

  it('encodes MCU motor faders as 14-bit pitch bend', () => {
    expect(encodeXTouchPitchBend(0, 0)).toEqual([0xe0, 0x00, 0x00]);
    expect(encodeXTouchPitchBend(0, 1)).toEqual([0xe0, 0x7f, 0x7f]);
    expect(encodeXTouchPitchBend(2, 0.5)).toEqual([0xe2, 0x00, 0x40]);
  });

  it('mirrors X-Touch Compact deck state as CC faders and global LEDs', () => {
    const preset = detectDJPreset('Behringer X-Touch Compact');
    const messages = buildXTouchFeedbackMessages(preset, FEEDBACK_STATE);

    expect(messages).toContainEqual([0xb1, 1, 95]);
    expect(messages).toContainEqual([0xb1, 9, 64]);
    expect(messages).toContainEqual([0x91, 16, 2]);
    expect(messages).toContainEqual([0x91, 22, 0]);
  });

  it('stops driving a touched MCU motor fader until touch is released', () => {
    const preset = detectDJPreset('Behringer X-Touch');
    const messages = buildXTouchFeedbackMessages(preset, FEEDBACK_STATE, { 'pitchbend:0': true });

    expect(messages).not.toContainEqual(encodeXTouchPitchBend(0, FEEDBACK_STATE.deckA.volume));
    expect(messages).toContainEqual(encodeXTouchPitchBend(8, FEEDBACK_STATE.crossfader));
  });

  it('uses the X-Touch One button layout instead of full-size MCU channel buttons', () => {
    const preset = detectDJPreset('Behringer X-Touch One');
    const messages = buildXTouchFeedbackMessages(preset, FEEDBACK_STATE);

    expect(messages).toContainEqual([0x90, 94, 127]);
    expect(messages).toContainEqual([0x90, 95, 0]);
    expect(messages).not.toContainEqual([0x90, 0, 127]);
  });
});

/**
 * A fresh boot with an empty song must leave the motor faders at rest.
 *
 * The X-Touch preset maps its faders to `dub.channelSend.chN` — every one of
 * them, unconditionally. But the FEEDBACK used to be gated on the dub bus
 * being enabled, and when it was off it fell back to the DJ deck's volumes and
 * EQs, which rest at unity and centre rather than at zero. So starting
 * DEViLBOX with nothing loaded drove the motors to a mix that did not exist:
 * "the controller faders knobs are not at zero when i start devilbox with an
 * empty song" (2026-09-23).
 *
 * The surface must show the parameter it controls.
 */
describe('an empty song leaves the faders down', () => {
  const emptySong: XTouchFeedbackState = {
    ...FEEDBACK_STATE,
    // What a fresh boot actually looks like: no sends anywhere...
    dubChannelSends: [0, 0, 0, 0, 0, 0, 0, 0],
    // ...while the DJ decks sit at their own resting defaults.
    deckA: { ...FEEDBACK_STATE.deckA, volume: 1, eqHi: 0.5, eqMid: 0.5, eqLow: 0.5 },
    deckB: { ...FEEDBACK_STATE.deckB, volume: 1, eqHi: 0.5, eqMid: 0.5, eqLow: 0.5 },
  };

  const faderValue = (messages: number[][], cc: number): number | undefined =>
    messages.find((m) => (m[0] & 0xf0) === 0xb0 && m[1] === cc)?.[2];

  it('drives every channel fader to zero, not to a deck default', () => {
    const messages = buildXTouchFeedbackMessages(
      detectDJPreset('X-TOUCH COMPACT'), emptySong, {},
    );
    for (let cc = 1; cc <= 8; cc++) {
      expect(faderValue(messages, cc), `fader ${cc}`).toBe(0);
    }
  });

  it('does not quietly show the DJ mixer instead', () => {
    // 0.5 as a CC is 64 — the EQ centre these faders used to be driven to.
    const messages = buildXTouchFeedbackMessages(
      detectDJPreset('X-TOUCH COMPACT'), emptySong, {},
    );
    for (let cc = 2; cc <= 4; cc++) {
      expect(faderValue(messages, cc), `fader ${cc} shows an EQ centre`).not.toBe(64);
    }
  });
});

/**
 * And the fix itself, where it actually lived.
 *
 * The builder above was always correct when handed sends. The defect was one
 * gate in the hook — `dub.enabled ? sends : undefined` — which handed it
 * nothing, and `undefined` is precisely what selects the DJ fallback. A test
 * that only drives the builder would have passed throughout the bug.
 */
describe('the hook does not gate the faders on the bus being on', () => {
  const HOOK = readFileSync(
    resolve(process.cwd(), 'src/hooks/useXTouchFeedback.ts'), 'utf8',
  );

  it('never resolves the channel sends to undefined', () => {
    expect(HOOK, 'the dub.enabled gate is back').not.toMatch(
      /dubChannelSends\s*=\s*dub\.enabled/,
    );
    expect(HOOK).not.toMatch(/dubChannelSends[\s\S]{0,120}:\s*undefined/);
  });

  it('still prefers the live value, so an AutoDub ride moves the motor', () => {
    expect(HOOK).toContain('Math.max(ch?.dubSend ?? 0, liveSends[i] ?? 0)');
  });
});
