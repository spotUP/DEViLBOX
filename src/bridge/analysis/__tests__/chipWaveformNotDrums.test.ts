/**
 * A single-cycle chip waveform is pitched, never a drum.
 *
 * micro15.mod (goto80, a death metal chip song - owner test file 2026-09-29):
 * guitars on three channels, the kit (one-shot kick and snare samples 2, 10,
 * 11) on channel 3. Every channel came back percussion ("Snare 1",
 * "Snare 2", "Drums", "Snare 3"): its instruments are 32- and 128-frame
 * looped waveforms, and the sample spectrum analysed the stored few cycles
 * instead of the loop repeating as it plays - a snare at 0.8, which lifts
 * any channel to percussion. A single cycle's register was also read from
 * its spectrum (lead guitars as bass); the note decides it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMODFile } from '@/lib/import/formats/MODParser';
import { classifyInstrument, classifySongRoles } from '../ChannelNaming';
import type { InstrumentConfig } from '@typedefs/instrument';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../__tests__/fixtures/micro15-goto80.mod');

async function loadSong() {
  const b = readFileSync(FIXTURE);
  return parseMODFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'micro15.mod');
}

describe('chip waveforms are not drums', () => {
  it('the looped single-cycle instruments of micro15.mod are not percussion', async () => {
    const song = await loadSong();
    const cycles = song.instruments.filter((i) => {
      const s = (i as InstrumentConfig).sample;
      return s?.loop && (s.loopEnd ?? 0) - (s.loopStart ?? 0) <= 128;
    });
    expect(cycles.length).toBeGreaterThan(5);
    for (const inst of cycles) {
      expect(classifyInstrument(inst as InstrumentConfig).role, `${inst.id} ${inst.name}`).not.toBe('percussion');
    }
  });

  it('only channel 3, the kit, is percussion', async () => {
    const song = await loadSong();
    const lookup = new Map(song.instruments.map((i) => [i.id, i as InstrumentConfig]));
    const roles = classifySongRoles(song.patterns, lookup);
    expect(roles[2]).toBe('percussion');
    expect([roles[0], roles[1], roles[3]]).not.toContain('percussion');
    expect([roles[0], roles[3]]).not.toContain('bass');
  });
});
