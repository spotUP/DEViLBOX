/**
 * Switching the dub bus on has to make it audible.
 *
 * The bus is fed only by the channels whose sends are open — channel
 * isolation is preferred and the whole-mix fallback is deliberately
 * silenced (src/types/dub.ts). `applySong` resets every send on each song
 * load, so a freshly loaded song arrives with the bus completely silent:
 * measured 2026-10-02 on a MOD, `channelTapGainMax` 0 and `inputRms` 0
 * while the master chain carried signal, and raising three sends took that
 * same bus to `channelTapGainMax` 0.68. Every wet control then read as dead
 * with nothing saying why, which is the report this fixes.
 *
 * The seed is deliberately narrow: only a switch off → on, and only when no
 * send is already audible. A send the performer opened is never touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useMixerStore } from '../../../stores/useMixerStore';
import { useDrumPadStore } from '../../../stores/useDrumPadStore';
import { DEFAULT_DUB_BUS } from '../../../types/dub';
import { sendSeedChannel, FLAT_SEED_SEND, ensureBusIsFed } from '../seedSendOnEnable';
import { GHOST_SEND_FLOOR, sendIsAudible } from '../sendAudibility';

const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;

/** The store batches sends onto a frame callback; run it inline. */
function runFramesInline(): void {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  }) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;
}

/** Every visible channel closed — the state a song load leaves behind. */
function allSendsClosed(count = 4): void {
  useMixerStore.setState({
    channels: Array.from({ length: count }, () => ({
      volume: 0.8,
      pan: 0,
      muted: false,
      dubSend: 0,
    })) as never,
  });
}

beforeEach(() => {
  runFramesInline();
  allSendsClosed();
  useDrumPadStore.setState({ dubBus: { ...DEFAULT_DUB_BUS, enabled: false } });
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
});

describe('sendSeedChannel', () => {
  it('opens the first channel when every send is closed', () => {
    expect(sendSeedChannel([0, 0, 0, 0])).toBe(0);
  });

  it('seeds nothing when the performer already has a send open', () => {
    expect(sendSeedChannel([0, 0.6, 0, 0])).toBeNull();
  });

  it('treats the bleed floor as not a send', () => {
    // BLEED floors a closed channel to 0.015. Counting it as a send would
    // leave the bus near-silent while looking fed.
    expect(sendSeedChannel([GHOST_SEND_FLOOR, 0, 0])).toBe(0);
  });

  it('skips a muted channel so the seed is on one that can be heard', () => {
    expect(sendSeedChannel([0, 0, 0], [true, false, false])).toBe(1);
  });

  it('falls back to channel 0 when every channel is muted', () => {
    expect(sendSeedChannel([0, 0], [true, true])).toBe(0);
  });

  it('seeds nothing when there are no channels', () => {
    expect(sendSeedChannel([])).toBeNull();
  });
});

describe('switching the bus on seeds a send', () => {
  it('opens a channel through the real enable entry point', () => {
    // The panel's checkbox, the bridge handler and the Sound System all land
    // here, so this drives the feature the same way the product does.
    const setChannelDubSend = useMixerStore.getState().setChannelDubSend;
    const spy = vi.spyOn(useMixerStore.getState(), 'setChannelDubSend');

    useDrumPadStore.getState().setDubBus({ enabled: true });

    expect(spy).toHaveBeenCalled();
    expect(useMixerStore.getState().channels[0].dubSend).toBe(FLAT_SEED_SEND);
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0);
    spy.mockRestore();
    expect(typeof setChannelDubSend).toBe('function');
  });

  it('leaves a send the performer opened alone', () => {
    useMixerStore.setState({
      channels: [
        { volume: 0.8, pan: 0, muted: false, dubSend: 0.8 },
        { volume: 0.8, pan: 0, muted: false, dubSend: 0 },
      ] as never,
    });
    const spy = vi.spyOn(useMixerStore.getState(), 'setChannelDubSend');

    useDrumPadStore.getState().setDubBus({ enabled: true });

    expect(spy).not.toHaveBeenCalled();
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.8);
    spy.mockRestore();
  });

  it('does not reseed while the bus is already on', () => {
    useDrumPadStore.getState().setDubBus({ enabled: true });
    const seeded = useMixerStore.getState().channels[0].dubSend;

    allSendsClosed();
    useDrumPadStore.getState().setDubBus({ springWet: 0.5 });

    expect(useMixerStore.getState().channels[0].dubSend).toBe(0);
    expect(seeded).toBe(FLAT_SEED_SEND);
  });

  it('reseeds on an explicit enable while the bus is already on', () => {
    // The desync case: the store says enabled but the engine was muted by a
    // panic and every send is closed. An edge-gated seed never ran here, so
    // the bus stayed starved however often enable was pressed.
    useDrumPadStore.getState().setDubBus({ enabled: true });
    allSendsClosed();

    useDrumPadStore.getState().setDubBus({ enabled: true });

    expect(useMixerStore.getState().channels[0].dubSend).toBe(FLAT_SEED_SEND);
  });
});

describe('an enabled bus must be fed', () => {
  it('does nothing while the bus is off', () => {
    expect(ensureBusIsFed(false)).toBeNull();
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0);
  });

  it('feeds the bus when it is on and every send is closed', () => {
    expect(ensureBusIsFed(true)).toBe(0);
    expect(useMixerStore.getState().channels[0].dubSend).toBe(FLAT_SEED_SEND);
  });

  it('leaves a fed bus alone', () => {
    useMixerStore.setState({
      channels: [
        { volume: 0.8, pan: 0, muted: false, dubSend: 0.7 },
        { volume: 0.8, pan: 0, muted: false, dubSend: 0 },
      ] as never,
    });
    expect(ensureBusIsFed(true)).toBeNull();
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0.7);
  });

  it('re-feeds a bus that a song load starved', () => {
    // The reported symptom: with the bus already on, `applySong` calls
    // `resetDubSends()`, which closes every send. The deck then gates every
    // `needsSend` move — Tape Stop, Sub Harmonic, Filter Drop, Master Drop,
    // Liquid, Starve — behind a toast, so holding them fires nothing at all.
    useDrumPadStore.getState().setDubBus({ enabled: true });
    expect(useMixerStore.getState().channels[0].dubSend).toBe(FLAT_SEED_SEND);

    useMixerStore.getState().resetDubSends();
    expect(useMixerStore.getState().channels[0].dubSend).toBe(0);

    expect(ensureBusIsFed(useDrumPadStore.getState().dubBus.enabled)).toBe(0);
    expect(useMixerStore.getState().channels[0].dubSend).toBe(FLAT_SEED_SEND);
  });

  it('is wired into applySong after the sends are closed, as the one seeding decision', () => {
    // `resetDubSends` closing the sends is deliberate (2026-09-22: a dub
    // producer starts with the sends down), so the feed has to follow it. It
    // is the else of Auto Dub's role seeding: run first, its flat 0.15 on
    // channel 0 made Auto Dub skip that channel's role level.
    const src = readFileSync(
      resolve(__dirname, '..', '..', 'song', 'applySong.ts'),
      'utf8',
    );
    const reset = src.indexOf('resetDubSends()');
    const feed = src.indexOf('ensureBusIsFed(');
    expect(reset).toBeGreaterThan(-1);
    expect(feed).toBeGreaterThan(reset);
    expect(src.match(/ensureBusIsFed\(/g)).toHaveLength(1);
    expect(src).toMatch(/if \(autoDubRunning\)[^\n]*seedAutoDubSends\(\);\s*else ensureBusIsFed\(/);
  });
});

describe('Auto Dub starting sends', () => {
  it('seeds a channel that only carries the BLEED floor, which is not a send', async () => {
    const { seedAutoDubSends } = await import('../seedAutoDubSends');
    useMixerStore.setState({
      channels: [
        { volume: 0.8, pan: 0, muted: false, dubSend: GHOST_SEND_FLOOR },
        { volume: 0.8, pan: 0, muted: false, dubSend: 0.6 },
      ] as never,
    });
    useDrumPadStore.setState({ dubBus: { ...DEFAULT_DUB_BUS, characterPreset: 'custom' } });
    seedAutoDubSends();
    // Role level or flat seed, depending on the persona: either way a send.
    expect(sendIsAudible(useMixerStore.getState().channels[0].dubSend)).toBe(true);
    // A send the performer opened is still theirs.
    expect(useMixerStore.getState().channels[1].dubSend).toBe(0.6);
  });
});
