/**
 * A key on an Amiga Sampler instrument plays the grid note's period, so it
 * sounds the same octave and pitch as the song (owner K4). Measured before the
 * fix on 23 corpus songs: the keyboard played 8287 Hz sample rates at C3 an
 * octave under the song at grid C-2 (kbd/song = 0.500), and formats storing
 * other rates (2072, 4144, 8363, 10000, 22050 Hz) were off by the rate ratio
 * (0.125 .. 1.33), because the song plays frames at 3546895 / period Hz whatever
 * rate the buffer was stored at.
 *
 * ONE wiring test: ToneEngine's two attack entry points call keyboardPeriod.
 * The behaviour is tested where it lives: keyboardPeriod against the period the
 * replayer reads for the same grid note (cellPeriod), across Sampler-based formats.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './workletHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { keyboardPeriod, gridNoteOfName } from '@/engine/keyboardPeriod';
import { cellPeriod } from '@/lib/amiga/periodNotes';
import { xmNoteToToneJS } from '@/lib/xmConversions';

// One song per Sampler-based format family and stored sample rate.
const SONGS = [
  '45.okta', 'a sleep so deep.mod', 'action_section.aon', 'african dreams.unic', 'analogue_vibes.jam',
  'anthrox.fc', 'anthrox_intro.dm2', 'astra_2.rk', 'avoid.amf', 'bounty hunter - outro (remixed).mmd3',
  'doxtro3.dss', 'dynablaster.ast', 'fantasi8.is', 'funky nightmare.mmd1', 'gettysburg.avp',
  'goldrunner.psf', 'harmonic disorder.ml', 'm31.far', 'north_sea_inferno.sc', 'parity_error.plm',
  'slideshow i.stm', 'the_day_after.digi', 'universal monsters - dracula.mmd0',
];

describe('keyboardPeriod', () => {
  it('names the grid note of a key (grid note n is MIDI n + 11)', () => {
    for (const n of [1, 13, 25, 37, 48, 61, 72]) expect(gridNoteOfName(xmNoteToToneJS(n)!), `note ${n}`).toBe(n);
  });

  it.each(SONGS)('%s: every period-playback Sampler plays the period of the grid note a key stands for', async (name) => {
    const f = readFileSync(resolve(ROOT, 'public/data/songs/formats', name));
    const song = await parseModuleToSong(new File([f], name) as never);
    const insts = song.instruments.filter((i) => i.synthType === 'Sampler' && i.metadata?.modPlayback?.usePeriodPlayback);
    expect(insts.length, 'the song has period-playback Samplers').toBeGreaterThan(0);
    for (const inst of insts) {
      for (const n of [13, 25, 37, 48]) {
        const got = keyboardPeriod(inst.metadata!.modPlayback, xmNoteToToneJS(n)!, true);
        expect(got, `${name} inst ${inst.id} note ${n}`).toBe(cellPeriod({ note: n }));
      }
    }
  });

  it('keeps the base note path for XM-style songs, a given period and non-period instruments', () => {
    expect(keyboardPeriod({ usePeriodPlayback: true }, 'C2', false)).toBeUndefined();
    expect(keyboardPeriod({ usePeriodPlayback: true }, 'C2', true, 321)).toBe(321);
    expect(keyboardPeriod({ usePeriodPlayback: false }, 'C2', true)).toBeUndefined();
    expect(keyboardPeriod(undefined, 'C2', true)).toBeUndefined();
  });

  it('C-2 is period 428 (8287 Hz), an octave above what base note C3 at 8287 Hz gave', () => {
    expect(keyboardPeriod({ usePeriodPlayback: true }, 'C2', true)).toBe(428);
  });

  it('ToneEngine takes the period at both attack entry points and TrackerReplayer tells it the song mode', () => {
    const te = readFileSync(resolve(ROOT, 'src/engine/ToneEngine.ts'), 'utf8');
    const calls = te.match(/period = keyboardPeriod\(config\.metadata\?\.modPlayback, note, this\.amigaPeriodSong, period\);/g) ?? [];
    expect(calls).toHaveLength(2);
    const tr = readFileSync(resolve(ROOT, 'src/engine/TrackerReplayer.ts'), 'utf8');
    expect(tr).toContain('getToneEngine().amigaPeriodSong = !this.useXMPeriods;');
  });
});
