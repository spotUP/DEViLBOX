/**
 * A modland Euphony (.eup) song imports, reaches the Eupmini engine, and
 * plays with the FM and PCM banks its header names.
 *
 * isEupFormat read bytes 32-47 as a channel map; they are the artist field
 * ("SCHUMAN" in Traumerei.eup), so real files were refused. The track map is
 * at 0x394 (eupmini_harness.cpp). And the harness never loaded the banks
 * eupplay loads: header 0x6E2 names `<name>.fmb`, 0x6EA `<name>.pmb`, kept
 * beside the song (modland: one folder per song). Without them every FM
 * voice was empty and no PCM played.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startWorklet } from './workletHarness';
import { resolveCompanions, listingFromRelativePaths } from '@lib/import/companionResolver';

const DIR = join(ROOT, 'public/data/songs/euphony');
const ab = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** The song and the companions the app's resolver picks for it, as the importer receives them. */
function withCompanions(folder: string, song: string): { file: File; companions: Map<string, ArrayBuffer> } {
  const dir = join(DIR, folder);
  const res = resolveCompanions(song, listingFromRelativePaths(readdirSync(dir)));
  const companions = new Map(res.companions.map((c) => [c, ab(join(dir, res.sources[c] ?? c))] as const));
  return { file: new File([ab(join(dir, song))], song), companions };
}

type EupModule = { _malloc(n: number): number; _eupmini_render(buf: number, frames: number): number; HEAPF32: Float32Array };

describe('Euphony songs play with their banks', { timeout: 60000 }, () => {
  it.each([
    ['Mondschein', 'Mondschein.eup', 6152, 65122],
    ['Requiem', 'REQUIEM.eup', 6152, 68067],
    ['Schumann - Traumerei', 'Traumerei.eup', 6152, 65122],
  ])('%s imports with its FMB and PMB and starts Eupmini', async (folder, song, fmb, pmb) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const { file, companions } = withCompanions(folder, song);
    const parsed = await parseModuleToSong(file, 0, undefined, undefined, companions);
    expect(parsed.eupFmBankData?.byteLength).toBe(fmb);
    expect(parsed.eupPcmBankData?.byteLength).toBe(pmb);
    expect(playingEngineFor(parsed)).toBe('Eupmini');
  });

  it('the banks reach the player and change what it plays', async () => {
    const { companions } = withCompanions('Schumann - Traumerei', 'Traumerei.eup');
    const moduleData = ab(join(DIR, 'Schumann - Traumerei/Traumerei.eup'));
    const rms = async (banks: boolean) => {
      const { proc, send } = await startWorklet('eupmini', 'Eupmini');
      await send({ type: 'loadModule', moduleData, fmBank: banks ? companions.get('fmtone2.fmb') : undefined, pcmBank: banks ? companions.get('piano.pmb') : undefined });
      const m = proc.module as EupModule;
      const frames = 44100 * 10, buf = m._malloc(4410 * 8);
      let sum = 0;
      for (let f = 0; f < frames; f += 4410) {
        m._eupmini_render(buf, 4410);
        const block = m.HEAPF32.subarray(buf >> 2, (buf >> 2) + 8820);
        for (const x of block) sum += x * x;
      }
      return Math.sqrt(sum / (frames * 2));
    };
    const withBanks = await rms(true), without = await rms(false);
    expect(withBanks).toBeGreaterThan(0.005);
    // The FM bank replaces the default voice: measured 12 dB louder.
    expect(20 * Math.log10(withBanks / without)).toBeGreaterThan(6);
  });
});
