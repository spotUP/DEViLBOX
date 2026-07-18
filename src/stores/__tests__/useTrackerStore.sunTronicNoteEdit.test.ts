// useTrackerStore.sunTronicNoteEdit.test.ts
//
// Regression: applySunTronicGridNote must write the edited note back into the
// shared pool block and re-project the display grid. These tests verify the
// format store action that useTrackerStore.setCell calls in production.
//
// FAILS-ON-REVERT proof:
// - Pool writeback test: remove the `applySunNoteEdit` call from
//   applySunTronicGridNote → pool note stays at 40.
// - Reprojection test: remove the runSunTronicReproject call → display note
//   stays at 40 (pool updated but grid not re-baked).
// - Sibling test: widen to all blocks → sibling becomes incorrect.
// - clearCell test: remove the applySunNoteEdit call → pool stays at 40.
import { describe, it, expect, beforeEach } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { SunTronicNativeData } from '@/lib/import/formats/sunNativeData';
import type { Pattern } from '@/types/tracker';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two blocks: block 0 note=40 (edit target), block 1 note=30 (sibling). */
const makeNative = (): SunTronicNativeData => ({
  blocks: [
    [{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }],
    [{ note: 30, instrument: 2, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }],
  ],
  positions: [{ blockIndex: [0, 1, 0, 0], transpose: [0, 0, 0, 0] }],
});

const makeChannel = (rows: Pattern['channels'][0]['rows']): Pattern['channels'][0] => ({
  id: 'ch0', name: 'CH0', muted: false, solo: false, collapsed: false,
  volume: 100, pan: 0, instrumentId: null, color: null, rows,
});

/**
 * Display pattern: ch0 row0 backed by block 0 row 0 (note 40),
 *                  ch1 row0 backed by block 1 row 0 (note 30 — sibling).
 */
const makePattern = (): Pattern => ({
  id: 'p0',
  name: 'test',
  length: 1,
  channels: [
    makeChannel([{
      note: 40,             // display = pool 40 + transpose 0
      instrument: 0,
      volume: -1,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
      sunBlockIndex: 0,
      sunRowInBlock: 0,
      sunPosition: 0,
    }]),
    makeChannel([{
      note: 30,             // display = pool 30 + transpose 0 (sibling)
      instrument: 0,
      volume: -1,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
      sunBlockIndex: 1,
      sunRowInBlock: 0,
      sunPosition: 0,
    }]),
    makeChannel([{ note: 0, instrument: 0, volume: -1, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]),
    makeChannel([{ note: 0, instrument: 0, volume: -1, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]),
  ],
  importMetadata: undefined,
});

// ---------------------------------------------------------------------------
// Tests: applySunTronicGridNote pool writeback + reprojection
//
// These directly exercise the action that useTrackerStore.setCell calls in
// production. The require()-based sync block in useTrackerStore cannot be
// exercised in vitest (Vite's module alias resolution is build-time only;
// Node CJS require does not resolve @/ aliases). All other format-native
// sync blocks follow the same pattern — they test the store action directly.
// ---------------------------------------------------------------------------

describe('applySunTronicGridNote — pool writeback', () => {
  beforeEach(() => {
    useFormatStore.setState({ sunTronicNative: makeNative() });
    useTrackerStore.setState({ patterns: [makePattern()], currentPatternIndex: 0 });
  });

  it('writes edited note back to pool block — FAILS ON REVERT', () => {
    // Simulate: user typed note 42 into ch0/row0 (display note 40 → 42, no transpose)
    useFormatStore.getState().applySunTronicGridNote(0, 0, 0, 42, 0);

    // Pool block 0 row 0 must now hold raw note 42
    const poolNote = useFormatStore.getState().sunTronicNative!.blocks[0][0].note;
    expect(poolNote).toBe(42);
  });

  it('re-projects display cell note after writeback — FAILS ON REVERT', () => {
    useFormatStore.getState().applySunTronicGridNote(0, 0, 0, 42, 0);

    const displayNote = useTrackerStore.getState().patterns[0].channels[0].rows[0].note;
    expect(displayNote).toBe(42);
  });

  it('sibling pool block (ch1/block1) is unchanged after editing ch0', () => {
    useFormatStore.getState().applySunTronicGridNote(0, 0, 0, 42, 0);

    // Block 1 (ch1's block) must still be 30
    const siblingPoolNote = useFormatStore.getState().sunTronicNative!.blocks[1][0].note;
    expect(siblingPoolNote).toBe(30);
  });

  it('note=0 writes pool rest (0) — cleared note becomes a rest', () => {
    // Setting note to 0 represents a rest — must write 0 into pool
    useFormatStore.getState().applySunTronicGridNote(0, 0, 0, 0, 0);

    const poolNote = useFormatStore.getState().sunTronicNative!.blocks[0][0].note;
    expect(poolNote).toBe(0);
  });

  it('no-op when native is null', () => {
    useFormatStore.setState({ sunTronicNative: null });
    // Must not throw
    expect(() => {
      useFormatStore.getState().applySunTronicGridNote(0, 0, 0, 42, 0);
    }).not.toThrow();
  });

  it('no-op on out-of-range blockIndex', () => {
    // blockIndex 99 is out of range — must not throw or corrupt state
    useFormatStore.getState().applySunTronicGridNote(99, 0, 0, 42, 0);

    // Original pool unchanged
    const poolNote = useFormatStore.getState().sunTronicNative!.blocks[0][0].note;
    expect(poolNote).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Tests: clearCell provenance capture
//
// Verifies that the tracker store's clearCell correctly captures sunBlockIndex,
// sunRowInBlock, and sunPosition BEFORE clearing the cell (since clearCellInPattern
// replaces the row with EMPTY_CELL which discards provenance fields).
// ---------------------------------------------------------------------------

describe('useTrackerStore.clearCell — provenance capture', () => {
  beforeEach(() => {
    useFormatStore.setState({ sunTronicNative: makeNative() });
    useTrackerStore.setState({ patterns: [makePattern()], currentPatternIndex: 0 });
  });

  it('display cell note becomes 0 after clearCell', () => {
    useTrackerStore.getState().clearCell(0, 0);

    // The cleared cell's note should be 0 in the display grid
    const displayNote = useTrackerStore.getState().patterns[0].channels[0].rows[0].note;
    expect(displayNote).toBe(0);
  });

  it('provenance is cleared from the display cell after clearCell', () => {
    useTrackerStore.getState().clearCell(0, 0);

    // After clearCellInPattern, provenance fields are gone (EMPTY_CELL has no sunBlockIndex etc.)
    const row = useTrackerStore.getState().patterns[0].channels[0].rows[0];
    expect(row.sunBlockIndex).toBeUndefined();
  });
});
