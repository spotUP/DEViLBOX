/**
 * ZXAY AMAD (Amadeus: FXM song data for the Fuxoft AY Language player) plays.
 *
 * `aztec theme.amad` was refused: its song data is not Z80 code, so aylet's
 * Z80 had nothing to run. The FXM player (third-party/fxm/FXM.c, Dovgalyuk /
 * Wothke) is compiled into the aylet wasm and replaces the Z80 for this
 * payload; its AY registers go to aylet's own AY emulation. Real worklet,
 * real WASM, real file; and the file reaches that engine through
 * parseModuleToSong (the product's import entry).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, stereoOutputs, ROOT } from './workletHarness';
import { installAyletNodeFetch } from '../../lib/import/__tests__/helpers/ayletNodeFetch';
import { playingEngineFor } from '../replayer/NativeEngineRouting';

const AMAD = resolve(ROOT, 'public/data/songs/ay-amadeus/aztec theme.amad');

describe('aztec theme.amad', { timeout: 120_000 }, () => {
  let restore: () => void;
  beforeAll(() => { restore = installAyletNodeFetch(); });
  afterAll(() => restore());

  it('renders audible audio on the aylet worklet', async () => {
    const bytes = readFileSync(AMAD);
    const { proc, send, posted } = await startWorklet('aylet', 'Aylet');
    await send({ type: 'loadModule', moduleData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), track: -1 });
    expect(posted.find((m) => m.type === 'error'), 'the engine accepts the file').toBeUndefined();
    await send({ type: 'play' });
    const outs = stereoOutputs(1);
    let energy = 0; let n = 0;
    for (let b = 0; b < (48000 * 6) / 128; b++) {
      proc.process([], outs);
      for (const ch of outs[0]) for (const v of ch) { energy += v * v; n++; }
    }
    expect(Math.sqrt(energy / n)).toBeGreaterThan(0.005);
  });

  it('parseModuleToSong routes it to the Aylet engine with a grid that shows the playing AY', async () => {
    const { parseModuleToSong } = await import('../../lib/import/parseModuleToSong');
    const bytes = readFileSync(AMAD);
    const song = await parseModuleToSong(new File([bytes], 'aztec theme.amad'));
    expect(song.format).toBe('AY');
    expect(song.ayFileData?.byteLength).toBe(bytes.length);
    expect(song.name).toContain('Aztec Theme');
    // The grid is the first 300 frames; this tune opens with a noise drum
    // (volume moves, no tone note yet - its melody starts at frame 660).
    const volumes = song.patterns[0].channels.reduce((n, c) => n + c.rows.filter((r) => r.volume > 0).length, 0);
    expect(volumes).toBeGreaterThan(0);
    expect(playingEngineFor(song)).toBe('Aylet');
  });
});
