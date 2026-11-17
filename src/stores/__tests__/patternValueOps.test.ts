import { describe, it, expect, vi } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio'); },
  peekTrackerReplayer: () => null,
  syncFurnaceCellEdit: () => {},
}));

import { useTrackerStore } from '../useTrackerStore';
import { useCursorStore } from '../useCursorStore';
import {
  invertValuesHelper, scaleValuesHelper, transposeValuesHelper, randomizeValuesHelper,
} from '../tracker/patternEditActions';
import type { BlockSelection, Pattern } from '@typedefs';

const sel = (): BlockSelection => ({
  startChannel: 0, endChannel: 0, startRow: 0, endRow: 3,
  startColumn: 'volume', endColumn: 'volume', columnTypes: ['volume'],
});

function pat(): Pattern {
  useTrackerStore.getState().setCell(0, 0, { volume: 0x10 });
  useTrackerStore.getState().setCell(0, 1, { volume: 0x20 });
  useTrackerStore.getState().setCell(0, 3, { volume: 0x40 });
  const st = useTrackerStore.getState();
  return structuredClone(st.patterns[st.currentPatternIndex]);
}
const vols = (p: Pattern) => [0, 1, 2, 3].map((r) => p.channels[0].rows[r].volume);

describe('pattern value operations', () => {
  it('inverts as max minus value and leaves empty cells', () => {
    const p = pat();
    invertValuesHelper(p, sel(), 'volume');
    expect(vols(p)).toEqual([0xEF, 0xDF, 0, 0xBF]);
  });
  it('scales by percent and clamps', () => {
    const p = pat();
    scaleValuesHelper(p, sel(), 'volume', 50);
    expect(vols(p)).toEqual([8, 16, 0, 32]);
    scaleValuesHelper(p, sel(), 'volume', 10000);
    expect(vols(p)[3]).toBe(0xFF);
  });
  it('transposes values and nibble mode touches one nibble', () => {
    const p = pat();
    transposeValuesHelper(p, sel(), 'volume', 1, 'high');
    expect(vols(p)).toEqual([0x20, 0x30, 0, 0x50]);
    transposeValuesHelper(p, sel(), 'volume', -1, 'low');
    expect(vols(p)).toEqual([0x20, 0x30, 0, 0x50]);
    invertValuesHelper(p, sel(), 'volume', 'low');
    expect(vols(p)).toEqual([0x2F, 0x3F, 0, 0x5F]);
  });
  it('randomizes inside min..max with the injected rng', () => {
    const p = pat();
    randomizeValuesHelper(p, sel(), 'volume', 5, 9, 'both', () => 0.999);
    expect(vols(p)).toEqual([9, 9, 0, 9]);
  });
  it('transposes values down with clamp at zero', () => {
    const p = pat();
    transposeValuesHelper(p, sel(), 'volume', -20, 'both');
    expect(vols(p)).toEqual([0, 12, 0, 44]);
  });
  it('set effect writes the type and a random parameter, filling empty cells', () => {
    const p = pat();
    randomizeValuesHelper(p, sel(), 'effParam', 3, 3, 'both', () => 0, 0xC);
    expect(p.channels[0].rows[2].effTyp).toBe(0xC);
    expect(p.channels[0].rows[2].eff).toBe(3);
  });
  it('transposeSelection by free amount moves notes +7', () => {
    pat();
    useTrackerStore.getState().setCell(0, 0, { note: 49 });
    useCursorStore.setState({ selection: sel() });
    useTrackerStore.getState().transposeSelection(7);
    const st = useTrackerStore.getState();
    expect(st.patterns[st.currentPatternIndex].channels[0].rows[0].note).toBe(56);
  });
  it('effect parameter skips cells with no effect', () => {
    const p = pat();
    p.channels[0].rows[0].effTyp = 0xA; p.channels[0].rows[0].eff = 0x12;
    invertValuesHelper(p, sel(), 'effParam');
    expect(p.channels[0].rows[0].eff).toBe(0xED);
    expect(p.channels[0].rows[1].eff).toBe(0);
  });
  it('store action edits the selection column and minimize collapses every channel', () => {
    pat();
    useCursorStore.setState({ selection: sel() });
    useTrackerStore.getState().editSelectionValues({ kind: 'invert' }, 'volume');
    const st = useTrackerStore.getState();
    expect(st.patterns[st.currentPatternIndex].channels[0].rows[0].volume).toBe(0xEF);
    st.setAllChannelsCollapsed(true);
    expect(useTrackerStore.getState().patterns.every((q) => q.channels.every((c) => c.collapsed))).toBe(true);
    useTrackerStore.getState().setAllChannelsCollapsed(false);
    expect(useTrackerStore.getState().patterns.some((q) => q.channels.some((c) => c.collapsed))).toBe(false);
  });
});
