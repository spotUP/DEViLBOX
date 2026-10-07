/**
 * S2: useMIDIStore and useInstrumentStore no longer touch each other while
 * their modules load. The knob auto-sync to the selected instrument is wired
 * at app init (src/midi/instrumentSelectionWiring.ts).
 */
import { describe, it, expect, vi } from 'vitest';

describe('useMIDIStore does not need the instrument store at module load', { timeout: 60000 }, () => {
  it('importing useMIDIStore subscribes to nothing and raises nothing; the subscription exists only after init', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtException', onUnhandled);
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const subscribe = vi.spyOn(useInstrumentStore, 'subscribe');
    const { useMIDIStore } = await import('@/stores/useMIDIStore');
    expect(typeof useMIDIStore.getState).toBe('function');
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', onUnhandled);
    process.off('uncaughtException', onUnhandled);
    expect(unhandled).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
    const { setupInstrumentSelectionSync } = await import('@/midi/instrumentSelectionWiring');
    setupInstrumentSelectionSync()();
    expect(subscribe).toHaveBeenCalledTimes(1);
    subscribe.mockRestore();
  });

  it('after init, selecting an instrument syncs the knob bank to its synth', async () => {
    const { setupInstrumentSelectionSync } = await import('@/midi/instrumentSelectionWiring');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { useMIDIStore } = await import('@/stores/useMIDIStore');
    const sync = vi.spyOn(useMIDIStore.getState(), 'syncKnobsToSynth');
    const stop = setupInstrumentSelectionSync();
    expect(setupInstrumentSelectionSync()).toBe(stop);
    const state = useInstrumentStore.getState();
    const id = state.createInstrument({ synthType: 'TB303' } as never);
    state.setCurrentInstrument(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(useMIDIStore.getState().nksActiveSynthType).toBe('TB303');
    stop();
    sync.mockRestore();
  });
});
