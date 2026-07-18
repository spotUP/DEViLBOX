import { describe, it, expect } from 'vitest';
import { applySunNoteEdit, reprojectSunGrid } from '../sunReproject';
import type { SunTronicNativeData } from '../sunNativeData';
import type { Pattern } from '../../../../types/tracker';

function fixture(): SunTronicNativeData {
  // block 0 shared by two positions at transpose +0 and +12
  return {
    blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, sunRaw: [1, 2, 3] }]],
    positions: [
      { blockIndex: [0, -1, -1, -1], transpose: [0, 0, 0, 0] },
      { blockIndex: [0, -1, -1, -1], transpose: [12, 0, 0, 0] },
    ],
  };
}

describe('applySunNoteEdit + reprojectSunGrid', () => {
  it('writes raw pitch = editedNote - transpose and invalidates sunRaw', () => {
    const nd = fixture();
    applySunNoteEdit(nd, 0, 0, 0, /*editedNote*/ 52, /*position*/ 1); // position 1 transpose +12
    expect(nd.blocks[0][0].note).toBe(40);            // 52 - 12 = 40 (unchanged raw)
    expect(nd.blocks[0][0].sunRaw).toBeUndefined();   // forces re-encode
  });

  it('editing at transpose +12 changes the raw note when the edit differs', () => {
    const nd = fixture();
    applySunNoteEdit(nd, 0, 0, 0, /*editedNote*/ 55, /*position*/ 1);
    expect(nd.blocks[0][0].note).toBe(43);            // 55 - 12
    expect(nd.blocks[0][0].sunRaw).toBeUndefined();
  });

  it('reprojectSunGrid applies pool note + transpose to each provenance cell', () => {
    const nd: SunTronicNativeData = {
      blocks: [[{ note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }]],
      positions: [
        { blockIndex: [0, -1, -1, -1], transpose: [0, 0, 0, 0] },
        { blockIndex: [0, -1, -1, -1], transpose: [12, 0, 0, 0] },
      ],
    };
    const patterns: Pattern[] = [
      {
        id: 'p0',
        name: 'Pattern 0',
        length: 1,
        channels: [
          {
            id: 'ch0',
            name: 'Channel 0',
            muted: false,
            solo: false,
            collapsed: false,
            volume: 100,
            pan: 0,
            instrumentId: null,
            color: null,
            rows: [
              {
                note: 99, // will be overwritten
                instrument: 5,
                volume: 0,
                effTyp: 7,
                eff: 0x55,
                effTyp2: 0,
                eff2: 0,
                sunBlockIndex: 0,
                sunRowInBlock: 0,
                sunPosition: 1,
              },
            ],
          },
        ],
      },
    ];
    reprojectSunGrid(patterns, nd);
    const cell = patterns[0].channels[0].rows[0];
    expect(cell.note).toBe(52);        // 40 + 12
    expect(cell.effTyp).toBe(7);       // FX untouched
    expect(cell.eff).toBe(0x55);       // FX untouched
    expect(cell.instrument).toBe(5);   // instrument untouched
    expect(cell.sunBlockIndex).toBe(0); // provenance untouched
    expect(cell.sunPosition).toBe(1);  // provenance untouched
  });
});
