/**
 * Harvest real wavetables from the .fur and .dmf songs under public/data/songs
 * into public/data/wavetables/corpus-waves.json for the Waveform Studio preset
 * browser. Dedupe and chip tagging live in corpusWaves.ts (tested there).
 *
 *   npx tsx tools/harvest-corpus-waves.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { DefleMaskParser, type DMFModule } from '../src/lib/import/formats/DefleMaskParser';
import { decompressFur } from '../src/lib/import/formats/furnace/FurnaceBinaryReader';
import {
  harvestSongWaves, WAVE_CHIPS_BY_SYSTEM_ID, type CorpusWave,
} from '../src/components/instruments/editors/wavetable/corpusWaves';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs');
const OUT = path.join(ROOT, 'public/data/wavetables/corpus-waves.json');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(fur|dmf)$/i.test(e.name)) out.push(p);
  }
  return out;
}

function toArrayBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function main(): Promise<void> {
  const files = walk(SONGS).sort();
  const bank: CorpusWave[] = [];
  const seen = new Map<string, CorpusWave>();
  let failed = 0;
  const failures: string[] = [];
  const log = console.log;
  for (const file of files) {
    const songName = path.basename(file);
    const raw = new Uint8Array(readFileSync(file));
    try {
      console.log = () => {}; // parsers log per section
      if (/\.fur$/i.test(file)) {
        const mod = await parseFurnaceSong(toArrayBuffer(raw));
        const ids = mod.systems.slice(0, mod.systemLen);
        harvestSongWaves(bank, seen, songName, ids, mod.wavetables.map((w) => ({ max: w.height, data: w.data })));
      } else {
        const dmf = DefleMaskParser.parse(toArrayBuffer(decompressFur(raw)), 'dmf') as DMFModule;
        const chip = WAVE_CHIPS_BY_SYSTEM_ID[dmf.system.id];
        if (chip && dmf.wavetables.length > 0) {
          harvestSongWaves(bank, seen, songName, [dmf.system.id],
            dmf.wavetables.map((data) => ({ max: chip.height - 1, data })));
        }
      }
    } catch (err) {
      failed++;
      failures.push(`${path.relative(SONGS, file)}: ${(err as Error).message}`);
    } finally {
      console.log = log;
    }
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bank));
  const perChip: Record<string, number> = {};
  for (const w of bank) for (const c of w.chips) perChip[c] = (perChip[c] ?? 0) + 1;
  console.log(`files ${files.length}, failed ${failed}, waves ${bank.length}, bytes ${statSync(OUT).size}`);
  console.log(JSON.stringify(perChip));
  for (const f of failures.slice(0, 5)) console.log(`failed: ${f}`);
}

void main();
