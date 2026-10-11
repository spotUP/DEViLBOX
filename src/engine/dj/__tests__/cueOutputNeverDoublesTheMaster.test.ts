/**
 * "Double kicks on one deck, claps have an echo too - some effect is active;
 * the same song in the tracker view sounds pure" (owner, 2026-10-11).
 *
 * The cue engine taps the DJ master (cue mix 0.5) into a MediaStream played
 * by an <audio> element. That element autoplayed on the default device - the
 * speakers the master already plays on - before any headphones were chosen,
 * so the whole mix sounded twice, the second copy late by the media element's
 * output latency. Measured live: the deck-to-Tone.Destination path is one
 * clean tap; the echo came from outside it.
 *
 * Invariant: the cue output sounds only on a device that is not the main output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ctxState = vi.hoisted(() => ({ sinkId: '' as string }));

vi.mock('tone', () => {
  class Gain {
    gain = { value: 1, rampTo: () => {} };
    constructor(v?: number) { this.gain.value = v ?? 1; }
    connect() { return this; }
    disconnect() { return this; }
    dispose() {}
  }
  return {
    Gain,
    getContext: () => ({
      rawContext: {
        get sinkId() { return ctxState.sinkId; },
        createMediaStreamDestination: () => ({ stream: {} }),
      },
    }),
  };
});

/** An <audio> element that records whether it is sounding and on which device. */
class FakeAudio {
  static made: FakeAudio[] = [];
  srcObject: unknown = null;
  autoplay = false;
  paused = true;
  sinkId = '';
  constructor() { FakeAudio.made.push(this); }
  async setSinkId(id: string) { this.sinkId = id; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  /** What a browser does with autoplay + a live stream. */
  get sounding() { return !this.paused || this.autoplay; }
}

const devices: Array<{ kind: string; deviceId: string; groupId: string }> = [
  { kind: 'audiooutput', deviceId: 'default', groupId: 'speakers' },
  { kind: 'audiooutput', deviceId: 'speakers-id', groupId: 'speakers' },
  { kind: 'audiooutput', deviceId: 'headphones-id', groupId: 'headphones' },
];

beforeEach(() => {
  FakeAudio.made = [];
  ctxState.sinkId = '';
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('HTMLAudioElement', FakeAudio);
  vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices: async () => devices } });
});

async function cueEngine() {
  const { DJCueEngine } = await import('../DJCueEngine');
  const cue = new DJCueEngine();
  expect(await cue.init()).toBe('multi-output');
  expect(FakeAudio.made).toHaveLength(1);
  return { cue, el: FakeAudio.made[0] };
}

describe('the cue output never plays the master a second time on the speakers', () => {
  it('is silent after init when no headphones are chosen', async () => {
    const { el } = await cueEngine();
    expect(el.sounding).toBe(false);
  });

  it('stays silent when the chosen cue device is the main output (alias, same id or same physical device)', async () => {
    const { cue, el } = await cueEngine();
    for (const id of ['default', 'speakers-id', null]) {
      await cue.setCueDevice(id);
      expect(el.sounding, String(id)).toBe(false);
    }
  });

  it('sounds on headphones, and goes silent again when the device is cleared', async () => {
    const { cue, el } = await cueEngine();
    await cue.setCueDevice('headphones-id');
    expect(el.sinkId).toBe('headphones-id');
    expect(el.sounding).toBe(true);
    expect(cue.isCueOutputPlaying()).toBe(true);
    await cue.setCueDevice(null);
    expect(el.sounding).toBe(false);
  });

  it('a master routed to the headphones device makes the headphones the main output', async () => {
    ctxState.sinkId = 'headphones-id';
    const { cue, el } = await cueEngine();
    await cue.setCueDevice('headphones-id');
    expect(el.sounding).toBe(false);
  });
});
