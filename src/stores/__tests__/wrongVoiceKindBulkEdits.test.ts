/**
 * Owner decision 2026-11-11: a note whose instrument voice kind does not match
 * the chip channel is refused. The bulk edits below also write notes or
 * instruments into cells (swap with clipboard, apply macro, apply instrument,
 * remap instrument, swap channels); each must put back the offending cells,
 * warn once for the whole operation, and still write cells that fit.
 * Neo Geo layout: tracker channels 0-3 FM, 4-6 SSG, 7-12 ADPCM-A, 13 ADPCM-B.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
  peekTrackerReplayer: () => null,
}));
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import { useTrackerStore } from '../useTrackerStore';
import { useCursorStore } from '../useCursorStore';
import { useInstrumentStore } from '../useInstrumentStore';
import { useNotificationStore } from '../useNotificationStore';
import { resetStore } from './_harness';
import * as chipVoiceKinds from '@/engine/furnace-dispatch/chipVoiceKinds';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { BlockSelection } from '@typedefs/tracker';

const FM_ID = 1;
const OTHER_FM_ID = 4;
const PIANO_ID = 3;
const FM_CH = 0;
const ADPCM_CH = 8;

function current() {
  const st = useTrackerStore.getState();
  return st.patterns[st.currentPatternIndex];
}
const noteAt = (ch: number, row: number) => current().channels[ch].rows[row].note;
const instAt = (ch: number, row: number) => current().channels[ch].rows[row].instrument;
const warnings = () => useNotificationStore.getState().notifications.length;

function instrument(id: number, synthType: string, furnace?: Record<string, unknown>): InstrumentConfig {
  return { id, name: `i${id}`, type: 'synth', synthType, furnace } as unknown as InstrumentConfig;
}

function select(startChannel: number, endChannel: number, startRow: number, endRow: number) {
  const selection: BlockSelection = {
    startChannel, endChannel, startRow, endRow,
    startColumn: 'note', endColumn: 'note', columnTypes: ['note'],
  };
  useCursorStore.setState({
    cursor: { channelIndex: startChannel, rowIndex: startRow, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 },
    selection,
  });
}

describe('bulk edits refuse a note on a channel of the wrong voice kind', () => {
  let checkSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetStore(useTrackerStore);
    while (current().channels.length < 14) useTrackerStore.getState().addChannel();
    useInstrumentStore.setState({
      instruments: [
        instrument(FM_ID, 'FurnaceOPNB', { divInsType: 1 }),
        instrument(OTHER_FM_ID, 'FurnaceOPNB', { divInsType: 1 }),
        instrument(PIANO_ID, 'Synth'),
      ],
    });
    useNotificationStore.setState({ notifications: [] });
    checkSpy = vi.spyOn(chipVoiceKinds, 'checkNoteVoiceKind');
  });

  it('swap with clipboard does not put an FM note on an ADPCM channel', () => {
    useTrackerStore.getState().setCell(FM_CH, 0, { note: 49, instrument: FM_ID });
    select(FM_CH, FM_CH, 0, 0);
    useTrackerStore.getState().copySelection();
    select(ADPCM_CH, ADPCM_CH, 0, 0);
    const before = warnings();
    useTrackerStore.getState().swapSelection();
    expect(checkSpy).toHaveBeenCalled(); // sentinel
    expect(noteAt(ADPCM_CH, 0)).toBe(0);
    expect(warnings()).toBe(before + 1);

    select(1, 1, 0, 0);
    const clip = useTrackerStore.getState().clipboard;
    if (!clip) throw new Error('swap left no clipboard');
    useTrackerStore.getState().setClipboard(clip);
    useTrackerStore.getState().swapSelection();
    expect(noteAt(1, 0)).toBe(0); // swapped-in cell is the (empty) ADPCM copy: fits, written
  });

  it('apply macro does not put an FM note on an ADPCM channel; on an FM channel it is written', () => {
    useTrackerStore.getState().setCell(FM_CH, 0, { note: 49, instrument: FM_ID });
    useCursorStore.setState({ cursor: { channelIndex: FM_CH, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 } });
    useTrackerStore.getState().writeMacroSlot(0);

    useCursorStore.setState({ cursor: { channelIndex: ADPCM_CH, rowIndex: 2, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 } });
    const before = warnings();
    useTrackerStore.getState().readMacroSlot(0);
    expect(noteAt(ADPCM_CH, 2)).toBe(0);
    expect(instAt(ADPCM_CH, 2)).toBe(0);
    expect(warnings()).toBe(before + 1);

    useCursorStore.setState({ cursor: { channelIndex: 1, rowIndex: 2, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 } });
    useTrackerStore.getState().readMacroSlot(0);
    expect(noteAt(1, 2)).toBe(49);
  });

  it('apply instrument to selection leaves the ADPCM note on its old instrument and warns once', () => {
    useTrackerStore.getState().setCell(FM_CH, 0, { note: 49, instrument: PIANO_ID });
    useTrackerStore.getState().setCell(ADPCM_CH, 0, { note: 49, instrument: PIANO_ID });
    useTrackerStore.getState().setCell(ADPCM_CH, 1, { note: 51, instrument: PIANO_ID });
    select(FM_CH, ADPCM_CH, 0, 1);
    const before = warnings();
    useTrackerStore.getState().applyInstrumentToSelection(FM_ID);
    expect(instAt(FM_CH, 0)).toBe(FM_ID);
    expect(instAt(ADPCM_CH, 0)).toBe(PIANO_ID);
    expect(instAt(ADPCM_CH, 1)).toBe(PIANO_ID);
    expect(warnings()).toBe(before + 1);
  });

  it('remap instrument over the whole song does not move an ADPCM note to an FM voice, in any pattern', () => {
    const st = useTrackerStore.getState();
    st.setCell(FM_CH, 0, { note: 49, instrument: PIANO_ID });
    st.setCell(ADPCM_CH, 0, { note: 49, instrument: PIANO_ID });
    useTrackerStore.getState().addPattern();
    useTrackerStore.getState().setCurrentPattern(1);
    useTrackerStore.getState().setCell(ADPCM_CH, 3, { note: 49, instrument: PIANO_ID });
    useTrackerStore.getState().setCurrentPattern(0);
    const before = warnings();
    useTrackerStore.getState().remapInstrument(PIANO_ID, FM_ID, 'song');
    const p = useTrackerStore.getState().patterns;
    expect(p[0].channels[FM_CH].rows[0].instrument).toBe(FM_ID);
    expect(p[0].channels[ADPCM_CH].rows[0].instrument).toBe(PIANO_ID);
    expect(p[1].channels[ADPCM_CH].rows[3].instrument).toBe(PIANO_ID);
    expect(warnings()).toBe(before + 2); // one warning per pattern that held a refused note
  });

  it('swap channels keeps an FM note off an ADPCM channel and warns once', () => {
    useTrackerStore.getState().setCell(FM_CH, 0, { note: 49, instrument: FM_ID });
    useTrackerStore.getState().setCell(1, 0, { note: 51, instrument: FM_ID });
    const before = warnings();
    useTrackerStore.getState().swapChannels(FM_CH, ADPCM_CH);
    expect(noteAt(ADPCM_CH, 0)).toBe(0);
    expect(noteAt(FM_CH, 0)).toBe(49); // refused as a whole: the FM channel keeps its note
    expect(warnings()).toBe(before + 1);
    useTrackerStore.getState().swapChannels(FM_CH, 1);
    expect(noteAt(FM_CH, 0)).toBe(51);
    expect(noteAt(1, 0)).toBe(49);
  });

  it('remap instrument is one undo step', () => {
    useTrackerStore.getState().setCell(FM_CH, 0, { note: 49, instrument: PIANO_ID });
    useTrackerStore.getState().remapInstrument(PIANO_ID, OTHER_FM_ID, 'pattern');
    expect(instAt(FM_CH, 0)).toBe(OTHER_FM_ID);
    useTrackerStore.getState().undoEdit();
    expect(instAt(FM_CH, 0)).toBe(PIANO_ID);
  });

  it('bulk block edit refuses an FM note written onto an ADPCM channel; an FM channel takes it', () => {
    const before = warnings();
    useTrackerStore.getState().bulkBlockEdit('Test write', (pattern) => {
      pattern.channels[ADPCM_CH].rows[0].note = 49;
      pattern.channels[ADPCM_CH].rows[0].instrument = FM_ID;
      pattern.channels[1].rows[0].note = 49;
      pattern.channels[1].rows[0].instrument = FM_ID;
    });
    expect(noteAt(ADPCM_CH, 0)).toBe(0);
    expect(instAt(ADPCM_CH, 0)).toBe(0);
    expect(warnings()).toBe(before + 1);
    expect(noteAt(1, 0)).toBe(49);
  });

  it('multi pattern edit refuses an FM note on an ADPCM channel in every pattern it touches', () => {
    useTrackerStore.getState().addPattern();
    const before = warnings();
    useTrackerStore.getState().multiPatternEdit('Test write', (song) => {
      for (const p of [0, 1]) {
        song.patterns[p].channels[ADPCM_CH].rows[0].note = 49;
        song.patterns[p].channels[ADPCM_CH].rows[0].instrument = FM_ID;
        song.patterns[p].channels[1].rows[0].note = 49;
        song.patterns[p].channels[1].rows[0].instrument = FM_ID;
      }
    });
    const p = useTrackerStore.getState().patterns;
    for (const i of [0, 1]) {
      expect(p[i].channels[ADPCM_CH].rows[0].note).toBe(0);
      expect(p[i].channels[1].rows[0].note).toBe(49);
    }
    expect(warnings()).toBe(before + 2);
  });

  it('set channel rows refuses an FM note on an ADPCM channel; an FM channel takes it', () => {
    const rows = current().channels[0].rows.map((r, i) => (i === 0 ? { ...r, note: 49, instrument: FM_ID } : { ...r }));
    const before = warnings();
    useTrackerStore.getState().setChannelRows(ADPCM_CH, rows);
    expect(noteAt(ADPCM_CH, 0)).toBe(0);
    expect(warnings()).toBe(before + 1);
    useTrackerStore.getState().setChannelRows(1, rows);
    expect(noteAt(1, 0)).toBe(49);
  });
});
