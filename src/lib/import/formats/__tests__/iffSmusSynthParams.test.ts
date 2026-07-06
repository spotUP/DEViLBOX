/**
 * Regression: a loaded SMUS song's synth instruments carry their REAL params at load time,
 * not placeholder defaults.
 *
 * Previously synth .instr companions were seeded with getDefaultSonixParams and only got real
 * values from the WASM→store bridge after the song played once (the "editor empty until
 * played" gotcha). Now parseSonixSynthInstr fills them during parse. Verified against the
 * committed ACE II fixtures + the gen-presets.c oracle values.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseIffSmusFile } from '../IffSmusParser';

const SONG_DIR = join(process.cwd(), 'public/data/songs/sonix-smus/ACE II');
const INSTR_DIR = join(SONG_DIR, 'Instruments');

function companionMap(): Map<string, ArrayBuffer> {
  const m = new Map<string, ArrayBuffer>();
  for (const name of readdirSync(INSTR_DIR)) {
    if (!/\.(instr|ss)$/i.test(name)) continue;
    const b = readFileSync(join(INSTR_DIR, name));
    m.set(name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return m;
}

describe('IFF SMUS synth instrument params at load', () => {
  it('seeds real Sonix synth params (not defaults) for synth .instr companions', async () => {
    const songBuf = readFileSync(join(SONG_DIR, 'ACE II.smus'));
    const song = await parseIffSmusFile(
      songBuf.buffer.slice(songBuf.byteOffset, songBuf.byteOffset + songBuf.byteLength),
      'ACE II.smus',
      companionMap(),
    );
    const instruments = song.instruments ?? [];
    const ace2leed = instruments.find((i) => (i.name || '').toLowerCase().includes('ace2leed'));
    expect(ace2leed).toBeTruthy();
    expect(ace2leed?.synthType).toBe('SonixSynth');
    const sonix = (ace2leed?.parameters as { sonix?: { baseVol: number; c2: number; envScanRate: number } }).sonix;
    expect(sonix).toBeTruthy();
    // Oracle values for Ace2leed (gen-presets.c), NOT the getDefaultSonixParams defaults
    // (baseVol 128, c2 0, envScanRate 0).
    expect(sonix?.baseVol).toBe(255);
    expect(sonix?.c2).toBe(255);
    expect(sonix?.envScanRate).toBe(208);
  });
});
