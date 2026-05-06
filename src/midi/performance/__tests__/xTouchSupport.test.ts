import { describe, expect, it } from 'vitest';
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
