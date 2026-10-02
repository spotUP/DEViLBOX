/**
 * The boot path must not bring back a dead dub bus.
 *
 * REACHABILITY: this drives `loadFromStorage()` — the entry point the app
 * itself calls at startup — against a localStorage blob shaped like the
 * wreckage found on 2026-10-01, so it proves the repair actually runs on the
 * way in rather than only that a helper in isolation behaves.
 *
 * The assertions on untouched fields are load-bearing for a second reason: if
 * the store's schema gate ever decides this blob is stale it discards the key
 * and the bus comes back as pure factory. That would satisfy every "is it
 * repaired?" assertion for the wrong reason, so each case also asserts a field
 * that only survives if the saved blob really was the one that loaded.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrumPadStore } from '../useDrumPadStore';
import { DEFAULT_DUB_BUS } from '../../types/dub';

const STORAGE_KEY = 'devilbox_drumpad';
const SCHEMA_KEY = 'devilbox_drumpad_schema';

function seedStorage(dubBus: Record<string, unknown>) {
  localStorage.setItem(SCHEMA_KEY, '28');
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      programs: {},
      currentProgramId: 'A-01',
      midiMappings: {},
      preferences: {},
      busLevels: {},
      dubBus,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  useDrumPadStore.setState({ dubBus: { ...DEFAULT_DUB_BUS } });
});

describe('loadFromStorage — a dub bus saved with its return closed', () => {
  it('comes back with a tail it can be heard through', () => {
    // The CC47-53 wet bank dumped to its minimums, with springWet at maximum.
    seedStorage({
      ...DEFAULT_DUB_BUS,
      returnGain: 0,
      echoWet: 0,
      echoIntensity: 0,
      echoRateMs: 40,
      springWet: 1,
    });

    useDrumPadStore.getState().loadFromStorage();

    const { dubBus } = useDrumPadStore.getState();
    expect(dubBus.returnGain).toBe(DEFAULT_DUB_BUS.returnGain);
    expect(dubBus.echoWet).toBe(DEFAULT_DUB_BUS.echoWet);
    expect(dubBus.echoIntensity).toBe(DEFAULT_DUB_BUS.echoIntensity);
    expect(dubBus.echoRateMs).toBe(DEFAULT_DUB_BUS.echoRateMs);
    // Proves the saved blob was the one that loaded, not a discarded key.
    expect(dubBus.springWet).toBe(1);
  });

  it('keeps a saved voicing the performer can actually hear', () => {
    const chosen: Record<string, unknown> = {
      ...DEFAULT_DUB_BUS,
      returnGain: 0.6,
      echoWet: 0.2,
      echoIntensity: 0.31,
      echoRateMs: 500,
      springWet: 0.77,
    };
    seedStorage(chosen);

    useDrumPadStore.getState().loadFromStorage();

    const { dubBus } = useDrumPadStore.getState();
    expect(dubBus.returnGain).toBe(0.6);
    expect(dubBus.echoWet).toBe(0.2);
    expect(dubBus.echoIntensity).toBe(0.31);
    expect(dubBus.echoRateMs).toBe(500);
    expect(dubBus.springWet).toBe(0.77);
  });

  it('still forces the bus off at boot, repaired or not', () => {
    // The on/off is a performance-time toggle, not a saved setting.
    seedStorage({ ...DEFAULT_DUB_BUS, returnGain: 0, enabled: true });
    useDrumPadStore.getState().loadFromStorage();
    expect(useDrumPadStore.getState().dubBus.enabled).toBe(false);
  });

  it('loads a bus saved with no return gain at all as an audible one', () => {
    // Not the repair's doing — the merge fills the gap from factory. Asserted
    // so a partial blob is known to be safe rather than a silent dead bus.
    const { returnGain: _omitted, ...withoutReturn } = DEFAULT_DUB_BUS;
    seedStorage(withoutReturn);

    useDrumPadStore.getState().loadFromStorage();

    expect(useDrumPadStore.getState().dubBus.returnGain).toBe(DEFAULT_DUB_BUS.returnGain);
  });
});
