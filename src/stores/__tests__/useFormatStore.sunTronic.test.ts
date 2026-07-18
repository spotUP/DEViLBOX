// useFormatStore.sunTronic.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { SunTronicNativeData } from '@/lib/import/formats/sunNativeData';
import type { Pattern } from '@/types/tracker';

const nd: SunTronicNativeData = {
  blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
  positions: [{ blockIndex: [0, 0, 0, 0], transpose: [0, 0, 0, 0] }],
};

describe('setSunTronicPositionCell', () => {
  beforeEach(() => { useFormatStore.setState({ sunTronicNative: JSON.parse(JSON.stringify(nd)) }); });
  it('sets transpose and clamps to signed byte range', () => {
    useFormatStore.getState().setSunTronicPositionCell(0, 1, 'transpose', 200);
    expect(useFormatStore.getState().sunTronicNative!.positions[0].transpose[1]).toBe(127);
  });
  // blockIndex is display-only: changing it requires a full grid re-linearization
  // that reprojectSunGrid cannot perform. The action is a no-op for blockIndex so
  // the display grid never gets out of sync with the pool. This test FAILS ON REVERT
  // if blockIndex mutation is re-enabled without also wiring a grid-rebuild path.
  it('blockIndex edit is a no-op — column is display-only pending grid-rebuild', () => {
    const before = useFormatStore.getState().sunTronicNative!.positions[0].blockIndex[0];
    // Use a value different from the initial (0) — if the action mutates, it
    // would clamp to max-valid (0, since there is 1 block), but the assertion
    // below catches any write attempt with a two-block pool.
    const ndTwoBlocks: SunTronicNativeData = {
      blocks: [
        [{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }],
        [{ note: 50, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }],
      ],
      positions: [{ blockIndex: [0, 0, 0, 0], transpose: [0, 0, 0, 0] }],
    };
    useFormatStore.setState({ sunTronicNative: JSON.parse(JSON.stringify(ndTwoBlocks)) });
    useFormatStore.getState().setSunTronicPositionCell(0, 0, 'blockIndex', 1);
    // Must remain 0 (no-op); would be 1 if mutation were re-enabled.
    expect(useFormatStore.getState().sunTronicNative!.positions[0].blockIndex[0]).toBe(before);
  });
});

// ── Reprojection regression ──────────────────────────────────────────────────
// Asserts that setSunTronicPositionCell re-projects the display grid atomically:
// pool note 40 + new transpose 5 = 45 must appear in the tracker store patterns.
// This test FAILS before reprojectSunGrid is wired into the action (fails-on-revert).

describe('setSunTronicPositionCell re-projects display grid', () => {
  const makeChannel = (rows: Pattern['channels'][0]['rows']): Pattern['channels'][0] => ({
    id: 'ch0', name: 'CH0', muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: null, color: null, rows,
  });

  const makeDisplayPattern = (): Pattern => ({
    id: 'p0',
    name: 'test',
    length: 1,
    channels: [
      makeChannel([
        {
          // Display note = pool note 40 + transpose 0 (initial state)
          note: 40,
          instrument: 0,
          volume: -1,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
          sunBlockIndex: 0,
          sunRowInBlock: 0,
          sunPosition: 0,
        },
      ]),
      makeChannel([{ note: 0, instrument: 0, volume: -1, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]),
      makeChannel([{ note: 0, instrument: 0, volume: -1, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]),
      makeChannel([{ note: 0, instrument: 0, volume: -1, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]),
    ],
    importMetadata: undefined,
  });

  beforeEach(() => {
    useFormatStore.setState({ sunTronicNative: JSON.parse(JSON.stringify(nd)) });
    useTrackerStore.setState({ patterns: [makeDisplayPattern()] });
  });

  it('re-projects cell note after transpose edit (pool 40 + tr 5 = 45)', () => {
    useFormatStore.getState().setSunTronicPositionCell(0, 0, 'transpose', 5);

    // Transpose stored correctly
    expect(useFormatStore.getState().sunTronicNative!.positions[0].transpose[0]).toBe(5);
    // Display note re-projected: 40 + 5 = 45
    const note = useTrackerStore.getState().patterns[0].channels[0].rows[0].note;
    expect(note).toBe(45);
  });
});
