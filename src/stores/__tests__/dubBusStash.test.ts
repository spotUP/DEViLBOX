/**
 * A/B compare stash (G11).
 *
 * Guards the hardware-desk compare behavior: loading a character preset
 * captures the PREVIOUS settings into a stash; `swapDubBusStash` flips
 * between them. The invariant that matters in practice:
 *
 *   setDubBus({ characterPreset: 'tubby' }) must stash the
 *   pre-tubby settings (not the post-tubby ones) so the user can flip
 *   back to what they had before.
 *
 * Plain field edits (`setDubBus({ echoWet: 0.5 })`) must NOT touch the
 * stash — otherwise dragging a knob would overwrite the A buffer once
 * per frame and the compare button would show the user's latest tweak
 * instead of the pre-preset baseline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrumPadStore } from '../useDrumPadStore';

function reset() {
  // Zustand's subscribe-based stores don't auto-reset between tests.
  // Reach into the raw setState and restore the defaults we care about.
  useDrumPadStore.setState({
    dubBus: { ...useDrumPadStore.getState().dubBus, characterPreset: 'custom', echoWet: 0.3 },
    dubBusStash: null,
  });
}

describe('useDrumPadStore — A/B dub-bus stash (G11)', () => {
  beforeEach(() => reset());

  it('stash starts null', () => {
    expect(useDrumPadStore.getState().dubBusStash).toBeNull();
  });

  it('swapDubBusStash is a no-op when stash is null', () => {
    const beforeDub = useDrumPadStore.getState().dubBus;
    useDrumPadStore.getState().swapDubBusStash();
    const afterDub = useDrumPadStore.getState().dubBus;
    expect(afterDub).toEqual(beforeDub);
    expect(useDrumPadStore.getState().dubBusStash).toBeNull();
  });

  it('loading a character preset captures the previous settings into the stash', () => {
    // Give the "before" state a recognisable marker so we can verify the
    // stash is the pre-preset snapshot, not the post-preset one.
    useDrumPadStore.setState(s => ({ dubBus: { ...s.dubBus, echoWet: 0.77 } }));
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    const stash = useDrumPadStore.getState().dubBusStash;
    expect(stash, 'stash should be populated after loading a preset').not.toBeNull();
    // Stash is the PREVIOUS state, which had characterPreset='custom' and echoWet=0.77
    expect(stash!.characterPreset).toBe('custom');
    expect(stash!.echoWet).toBe(0.77);
  });

  it('plain field edits (no characterPreset in the patch) do NOT overwrite the stash', () => {
    // Load a preset first to populate the stash.
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    const stashAfterPresetLoad = useDrumPadStore.getState().dubBusStash;
    expect(stashAfterPresetLoad).not.toBeNull();

    // Now tweak a plain field. Stash must not change.
    useDrumPadStore.getState().setDubBus({ echoWet: 0.111 });
    expect(useDrumPadStore.getState().dubBusStash).toBe(stashAfterPresetLoad);
  });

  it('setDubBus with characterPreset unchanged (same preset re-applied) does NOT restash', () => {
    // Initial: custom. Load tubby → stash = custom. Re-send tubby → stash
    // must still be the original custom snapshot, not tubby-applied-once.
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    const firstStash = useDrumPadStore.getState().dubBusStash;
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    expect(useDrumPadStore.getState().dubBusStash).toBe(firstStash);
  });

  it('swapDubBusStash swaps live and stash atomically', () => {
    useDrumPadStore.setState(s => ({ dubBus: { ...s.dubBus, echoWet: 0.42 } }));
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    // After loading tubby: live is tubby, stash is the pre-tubby custom snapshot (echoWet=0.42).
    const tubbyEchoWet = useDrumPadStore.getState().dubBus.echoWet;
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');

    // First swap: live becomes stashed (custom, echoWet=0.42), stash becomes tubby.
    useDrumPadStore.getState().swapDubBusStash();
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('custom');
    expect(useDrumPadStore.getState().dubBus.echoWet).toBe(0.42);
    expect(useDrumPadStore.getState().dubBusStash!.characterPreset).toBe('tubby');
    expect(useDrumPadStore.getState().dubBusStash!.echoWet).toBe(tubbyEchoWet);

    // Second swap: back to tubby live, custom in stash.
    useDrumPadStore.getState().swapDubBusStash();
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');
    expect(useDrumPadStore.getState().dubBus.echoWet).toBe(tubbyEchoWet);
    expect(useDrumPadStore.getState().dubBusStash!.characterPreset).toBe('custom');
    expect(useDrumPadStore.getState().dubBusStash!.echoWet).toBe(0.42);
  });

  it('switching between two different presets rebases the stash on every load', () => {
    useDrumPadStore.setState(s => ({ dubBus: { ...s.dubBus, echoWet: 0.1 } }));
    // custom(0.1) → tubby: stash = custom(0.1), live = tubby
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    const tubbyWet = useDrumPadStore.getState().dubBus.echoWet;
    expect(useDrumPadStore.getState().dubBusStash!.echoWet).toBe(0.1);
    // tubby → scientist: stash = tubby, live = scientist
    useDrumPadStore.getState().setDubBus({ characterPreset: 'scientist' });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('scientist');
    expect(useDrumPadStore.getState().dubBusStash!.characterPreset).toBe('tubby');
    expect(useDrumPadStore.getState().dubBusStash!.echoWet).toBe(tubbyWet);
  });
});
