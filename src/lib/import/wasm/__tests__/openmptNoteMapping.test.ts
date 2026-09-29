/**
 * OpenMPT notes <-> DEViLBOX notes, both ways.
 *
 * OpenMPT's note is format-free (61 = a sample at its base speed). A MOD cell
 * is named in ProTracker naming (period 428 = note 25 = C-2) and an XM/IT/S3M
 * cell in FT2 naming (49 = C-4). The edit bridge and the exporter used to
 * write the DEViLBOX note back unchanged - MOD three octaves low, XM one.
 */
import { describe, it, expect } from 'vitest';
import { mapNote, mapNoteToOpenMPT } from '../OpenMPTConverter';

describe('OpenMPT note mapping', () => {
  it('a MOD read by OpenMPT uses ProTracker naming', () => {
    // OpenMPT's MOD loader puts period 428 at note 61 (table index 36 + 24 + 1).
    expect(mapNote(61, 'MOD')).toBe(25);
    expect(mapNote(49, 'MOD')).toBe(13);   // 856 = C-1
  });
  it('an XM read by OpenMPT uses FT2 naming', () => {
    expect(mapNote(61, 'XM')).toBe(49);
  });
  it('writing back is the exact inverse, by the cell\'s format', () => {
    for (const fmt of ['MOD', 'XM', 'IT', 'S3M'] as const) {
      for (let n = 1; n <= 72; n++) expect(mapNote(mapNoteToOpenMPT(n, fmt), fmt), `${fmt} ${n}`).toBe(n);
    }
    expect(mapNoteToOpenMPT(97, 'MOD')).toBe(255);
    expect(mapNoteToOpenMPT(0, 'MOD')).toBe(0);
  });
});
