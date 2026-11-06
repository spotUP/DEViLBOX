/**
 * Online StoneTracker loads need the SPS sample bank beside the SPM song. The
 * client finds companions by listing the Modland directory (/modland/list reads
 * modland_files), so the bank must be INDEXED. It was dropped because the
 * 'Stonetracker' folder was not in the whitelist and `.sps` is no song
 * extension: the live list showed hypnosphere.spm alone and the song loaded
 * without its bank (2026-11-06).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/database', () => ({ default: {} }));

import { parseAllmodsLine } from './modlandIndexer';
import { companionPathsIn } from './modlandCompanions';

describe('Modland index keeps a StoneTracker sample bank beside its song', () => {
  it('indexes both halves and flags only the bank as companion', () => {
    const lines = [
      '1\tStonetracker/Mytholog/hypnosphere.spm',
      '2\tStonetracker/Mytholog/hypnosphere.sps',
    ];
    const entries = lines.map((l) => parseAllmodsLine(l));
    expect(entries.map((e) => e?.filename)).toEqual(['hypnosphere.spm', 'hypnosphere.sps']);
    const companions = companionPathsIn(entries.map((e) => ({ format: e!.format, author: e!.author, filename: e!.filename })));
    expect([...companions]).toEqual(['pub/modules/Stonetracker/Mytholog/hypnosphere.sps']);
  });
});
