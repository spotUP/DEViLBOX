/**
 * BLEED ("Ghost Bus") floors closed channels at the TAP, not on the faders.
 *
 * It used to be an effect inside the dub deck that wrote GHOST_SEND_FLOOR into
 * the mixer store: BLEED did nothing unless the deck was on screen, every
 * closed fader jumped to 1.5 % (and the master send read 2 %), and channels
 * that appeared after the toggle never bled. Measured 2026-09-27, with the
 * floor applied: all channels muted in the main mix, the master read RMS
 * 0.0013 against 0.00012 without it — about 35 dB under the song, audible.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as Tone from 'tone';
import { registerTrackerStore } from '@stores/storeAccess';
import { useDubStore } from '@stores/useDubStore';
import { ChannelRoutedEffectsManager } from '../ChannelRoutedEffects';
import { dubSendToGain } from '@/lib/dub/dubSendCurve';
import { GHOST_SEND_FLOOR, effectiveDubSend } from '@/lib/dub/sendAudibility';

function fakeGain() {
  const param = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((v: number) => { param.value = v; }),
  };
  return { gain: param };
}

beforeAll(() => {
  // A four-channel song.
  registerTrackerStore({ getState: () => ({ patterns: [{ channels: [{}, {}, {}, {}] }], currentPatternIndex: 0 }) });
});

describe('BLEED', () => {
  it('floors a closed send and leaves an open one alone', () => {
    expect(effectiveDubSend(0, true)).toBe(GHOST_SEND_FLOOR);
    expect(effectiveDubSend(0.5, true)).toBe(0.5);
    expect(effectiveDubSend(0, false)).toBe(0);
  });

  it('opens the song\'s closed channel taps at the floor, with the deck nowhere in sight', () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const gains = Array.from({ length: 6 }, fakeGain);
    const m = mgr as unknown as { channelDubGains: unknown[]; dubBusInput: unknown; channelDubSendValues: number[] };
    gains.forEach((g, i) => { m.channelDubGains[i] = g; });
    m.dubBusInput = { context: { currentTime: 0 } };
    m.channelDubSendValues[1] = 0.5;             // a performer's open send

    useDubStore.getState().setGhostBus(true);
    const floor = dubSendToGain(GHOST_SEND_FLOOR);
    expect(gains[0].gain.value).toBeCloseTo(floor, 6);
    expect(gains[3].gain.value).toBeCloseTo(floor, 6);
    expect(gains[4].gain.value).toBe(0);                       // not one of the song's channels
    expect(gains[1].gain.linearRampToValueAtTime).not.toHaveBeenCalled(); // open send untouched
    expect(m.channelDubSendValues[0]).toBe(0);                  // the fader stays where the user left it

    useDubStore.getState().setGhostBus(false);
    expect(gains[0].gain.value).toBe(0);
    void mgr.dispose();
  });
});
