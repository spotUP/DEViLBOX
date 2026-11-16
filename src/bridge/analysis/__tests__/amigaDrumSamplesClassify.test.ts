/**
 * Channel 2 of nicktune1.bp (SoundMon) was labelled "pad"; it is the drum
 * channel (owner report 2026-09-29). Its kick and snare are ST-41 sample-disk
 * drums at 8287 Hz, and the spectrum path never recognised them:
 *   - the kick is 1514 frames, and the FFT window was rounded UP to 2048, so
 *     the analysis returned nothing for it (and for every Amiga drum sample
 *     shorter than 2048 frames);
 *   - a sampled kick is a tonal sub thump (flatness 0.28), but the only kick
 *     rule wanted noise;
 *   - the snare is near flat-topped (crest 2.6), under the snare rule's
 *     crest >= 3.
 * With no instrument classified above 0.6, the channel fell to note
 * statistics and a greeting-free "pad".
 * Since a3979dc62 the grid columns follow the Paula voice the replayer plays
 * each step entry on (pos*4 + 3 - voice), so that drum voice is now channel 3
 * (index 2); the owner's "channel 2" was the mirrored column.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSoundMonFile } from '@/lib/import/formats/SoundMonParser';
import { classifyInstrument, classifySongRoles } from '../ChannelNaming';
import type { InstrumentConfig } from '@typedefs/instrument';

async function loadSong() {
  const b = readFileSync(join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp'));
  return parseSoundMonFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'nicktune1.bp');
}

describe('Amiga drum samples classify as drums', () => {
  it('the ST-41 kick and snare of nicktune1.bp are kick and snare at channel-deciding confidence', async () => {
    const song = await loadSong();
    const byName = (re: RegExp) => song.instruments.find((i) => re.test(i.name ?? '')) as InstrumentConfig;
    const kick = classifyInstrument(byName(/FCBDDRUM/));
    const snare = classifyInstrument(byName(/FCSDDRUM/));
    expect(kick).toMatchObject({ role: 'percussion', subrole: 'kick' });
    expect(snare).toMatchObject({ role: 'percussion', subrole: 'snare' });
    expect(kick.confidence).toBeGreaterThanOrEqual(0.8);
    expect(snare.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('channel 3 (index 2, Paula voice 2) is the drum channel', async () => {
    const song = await loadSong();
    const lookup = new Map(song.instruments.map((i) => [i.id, i as InstrumentConfig]));
    const roles = classifySongRoles(song.patterns, lookup);
    expect(roles[2]).toBe('percussion');
  });
});
