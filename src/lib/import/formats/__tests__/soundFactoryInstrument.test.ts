/**
 * Sound Factory instrument preview (goldrunner.psf): the Sampler must hold the
 * file's own wave bytes (soundfactory.c copies sample_length*2 bytes verbatim and
 * loops [0, sample_length*2) unless the one-shot flag is set; no DASR here), and
 * a key must play the byte rate the replayer writes (AMIGA_CLOCK / period).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSoundFactoryWithEffects } from '../SoundFactoryParser';
import { soundFactoryPeriod, soundFactoryGridNote } from '../soundFactoryPitch';
import { noteToPeriod } from '@/lib/amiga/periodNotes';

const bytes = new Uint8Array(readFileSync('public/data/songs/formats/goldrunner.psf'));
// Header file offsets (sample_length, sampling_period 428 ...) found by scanning the file; data follows 34 header bytes.
const HEADERS = [280, 326, 396, 466, 3902, 3972, 4042, 4112];
const AMIGA_CLOCK = 3546895;

describe('Sound Factory goldrunner instruments', () => {
  const song = parseSoundFactoryWithEffects(bytes, 'goldrunner.psf')!.song;

  it('holds the file wave bytes, loop region and replayer byte rate per instrument', () => {
    expect(song.instruments.length).toBe(HEADERS.length);
    HEADERS.forEach((h, idx) => {
      const inst = song.instruments[idx] as any;
      const words = (bytes[h] << 8) | bytes[h + 1];
      const effect = bytes[h + 4];
      const oneShot = (effect & 1) !== 0;
      const n = words * 2;
      // WAV: 44-byte header, 16-bit frames, possibly upsampled/repeated; frame f*up holds byte f.
      const wav = new DataView(inst.sample.audioBuffer as ArrayBuffer);
      const up = wav.getUint32(24, true) / inst.sample.sampleRate;
      for (let f = 0; f < Math.min(n, 64); f++) {
        const want = ((bytes[h + 34 + f] << 24) >> 24) * 256;
        expect(wav.getInt16(44 + f * up * 2, true), `inst ${idx + 1} byte ${f}`).toBe(want);
      }
      // loop = whole wave unless one-shot (soundfactory.c:633-636)
      expect(inst.sample.loop).toBe(!oneShot);
      if (!oneShot) { expect(inst.sample.loopStart).toBe(0); expect(inst.sample.loopEnd).toBe(n); }
      // key at the grid note of opcode 48 plays the replayer's byte rate
      const pitch = inst.metadata.soundFactoryPitch;
      const period = soundFactoryPeriod(pitch, 48);
      const grid = soundFactoryGridNote(pitch, 48);
      const keyRate = inst.metadata.modPlayback.periodMultiplier / noteToPeriod(grid);
      expect(Math.abs(keyRate / (AMIGA_CLOCK / period) - 1)).toBeLessThan(0.03);
    });
  });
});
