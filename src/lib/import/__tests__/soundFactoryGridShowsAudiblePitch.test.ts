/**
 * Sound Factory (.psf) grid notes name the pitch the song SOUNDS at, and the
 * imported instruments play at the replayer's rate for that note.
 *
 * Before the fix the grid showed opcode + 13: 36 to 60 semitones above the
 * sound for goldrunner.psf, with 319 notes past the period table (silent on
 * the keyboard). The replayer period comes from the opcode, the voice
 * transpose and the instrument's octave (soundfactory.c sf_calc_period); a
 * looped wave of L bytes at period P sounds at 3546895 / (P * L) Hz.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@lib/import/formats/SoundFactoryParser', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@lib/import/formats/SoundFactoryParser')>();
  return { ...mod, parseSoundFactoryFile: vi.fn(mod.parseSoundFactoryFile) };
});

import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseSoundFactoryFile } from '@lib/import/formats/SoundFactoryParser';
import { noteToPeriod } from '@/lib/amiga/periodNotes';
import { xmNoteToMidi } from '@/lib/xmConversions';
import { freqToMidi } from '@/engine/mame/MAMEPitchUtils';
import { samplePlaybackRate } from '@/engine/samplePlaybackRate';
import { soundFactoryPeriod } from '@/lib/import/formats/soundFactoryPitch';

const PAL = 3546895;

describe('Sound Factory grid shows the audible pitch', () => {
  it('goldrunner.psf: notes in range, a known cell names its heard note, the instrument plays the replayer rate', async () => {
    const raw = new Uint8Array(readFileSync('public/data/songs/formats/goldrunner.psf'));
    vi.mocked(parseSoundFactoryFile).mockClear();
    const song = await parseModuleToSong(new File([raw], 'goldrunner.psf'));
    expect(vi.mocked(parseSoundFactoryFile)).toHaveBeenCalledTimes(1);

    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.map((r) => r.note))).filter((n) => n > 0);
    expect(notes.length).toBe(2078); // one pass of the song: the walk ends at the Goto loop point (was 4444 = loop body repeated up to the grid cap)
    expect(notes.every((n) => n >= 1 && n <= 96)).toBe(true);
    // Every note inside the period table plays; the old naming left 319 past it.
    // The 9 left are real pitches above B-5 (instrument 1's 8-byte wave at C-7)
    // and one clamp, beyond noteToPeriod's 72-note table.
    expect(notes.filter((n) => noteToPeriod(n) <= 0).length).toBe(8); // one pass of the song (was 12: loop-body notes repeated by the buggy walk)

    // Pattern 0, channel 2, row 5 (tick 30 on the 6-tick step; row 30 before the step grid): opcode 47 (B, octave 3) on instrument 1, an
    // 8-byte looped wave at sampling period 428, octave 6. The replayer period
    // is floor(428 * 17359 / 32768) * 8 = 1808, which sounds 3546895 / (1808 * 8)
    // = 245.2 Hz: B3 (MIDI 59), grid note 48. The old grid showed opcode + 13 = 60.
    const layout = song.uadePatternLayout!;
    const off = layout.getCellFileOffset!(0, 5, 1);
    const opcode = raw[off];
    const cell = song.patterns[0].channels[1].rows[5];
    const inst = song.instruments.find((i) => i.id === cell.instrument)!;
    const pitch = inst.metadata!.soundFactoryPitch!;
    expect({ opcode, instrument: cell.instrument }).toEqual({ opcode: 47, instrument: 1 });
    const period = soundFactoryPeriod(pitch, opcode);
    expect(period).toBe(1808);
    const heardHz = PAL / (period * pitch.sampleLength * 2);
    expect(cell.note).toBe(48);
    expect(Math.abs(xmNoteToMidi(cell.note)! - freqToMidi(heardHz))).toBeLessThan(0.5);

    // The Sampler at that grid note plays the replayer's byte rate (3546895 / 1808
    // = 1961.8 bytes/s) within table rounding.
    const productBytesPerSec = samplePlaybackRate(inst, cell.note) * (inst.sample?.sampleRate ?? 0);
    expect(Math.abs(productBytesPerSec / (PAL / period) - 1)).toBeLessThan(0.015);

    // decodeCell (chip RAM read-back) names the stored opcode the same way.
    expect(layout.decodeCell!(raw.slice(off, off + 3), off).note).toBe(48);
  });
});
