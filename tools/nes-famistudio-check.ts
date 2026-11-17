// Headless check, NES FamiStudio route: .fur -> furnaceToFamistudio -> buildFamistudioRom -> Mesen2 APU bus-write log.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/nes-famistudio-check.ts [--only <name>] [--failed] [--ticks N] [--out <dir>]
// Results: test-data/nes-famistudio-check.json (skips songs whose input hash matches a recorded verdict).
// FamiStudio is lossy against Furnace by design (plan "FamiStudio route"), so no register diff: the verdict is
//   pass = the ROM ran the requested NMI ticks (at least to every channel's first note + 1 s) and every 2A03 channel that has notes in the song sounded in some frame
//   (pulse/noise volume nibble > 0, triangle linear counter > 0, DPCM enable bit written to $4015).
// firstHz reports pulse 1's first sounding frequency next to the song's first pulse 1 note (macros can move it; not failed).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildFamistudioRom, furnaceToFamistudio, type FamistudioMeta } from '../src/lib/export/nes/famistudioSong';
import { mesen } from '../src/lib/export/__tests__/nesMesenHarness';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace/nes');
const RESULTS = path.join(ROOT, 'test-data/nes-famistudio-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/nes/famistudio/player.nes'));
const META: FamistudioMeta = JSON.parse(readFileSync(path.join(ROOT, 'public/nes/famistudio/player.json'), 'utf8'));
const CPU_NTSC = 1789773;
// Tick marker at NMI entry (vector at $FFFA), not META.tickAddr (after famistudio_update): the harness drops writes before
// the first marker, which would lose the first update (note attacks, the $4003 period-high write).
const NMI_ADDR = PLAYER[16 + 0x7ffa] | (PLAYER[16 + 0x7ffb] << 8);
// Frames run past the last channel's first note, so a channel that enters late is still heard.
const FIRST_NOTE_MARGIN = 60;

interface Verdict { inputHash: string; pass: boolean; ticks: number; got: number; sounding: number[]; hasNotes: boolean[]; firstHz?: number; wantHz?: number; romBytes?: number; songBytes?: number; dpcmBytes?: number; lossy?: string[]; error?: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const TICKS = args.includes('--ticks') ? Number(args[args.indexOf('--ticks') + 1]) : 900;

/** Frames per channel (pulse 1, pulse 2, triangle, noise, DPCM) where the channel sounds; pulse 1 first sounding Hz. */
function sounding(writes: Array<Array<[number, number]>>): { frames: number[]; firstHz?: number } {
  const reg = new Uint8Array(0x18);
  const frames = [0, 0, 0, 0, 0];
  let firstHz: number | undefined;
  for (const tick of writes) {
    for (const [a, v] of tick) reg[a - 0x4000] = v;
    // $4015 = $0F is written in famistudio_init, before the first logged tick: only the DPCM bit is read here.
    const on = [(reg[0] & 15) > 0, (reg[4] & 15) > 0, (reg[8] & 0x7f) > 0, (reg[0xc] & 15) > 0, (reg[0x15] & 16) > 0];
    on.forEach((x, i) => { if (x) frames[i]++; });
    if (on[0] && firstHz === undefined) firstHz = Math.round(CPU_NTSC / (16 * ((reg[2] | ((reg[3] & 7) << 8)) + 1)));
  }
  return { frames, firstHz };
}

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[n]?.pass === false);
const toolHash = createHash('sha1').update(PLAYER).update(readFileSync(import.meta.filename)).update(readFileSync(path.join(ROOT, 'src/lib/export/nes/famistudioSong.ts'))).digest('hex');
for (const name of names) {
  const fur = readFileSync(path.join(SONGS, `${name}.fur`));
  const inputHash = createHash('sha1').update(fur).update(toolHash).update(String(TICKS)).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToFamistudio(m, 0, META.dpcmCap);
    const rom = buildFamistudioRom(PLAYER, META, song);
    if (OUT) writeFileSync(path.join(OUT, `${name}.nes`), rom);
    const ticks = Math.max(TICKS, ...song.firstNoteFrames.map((f) => f + FIRST_NOTE_MARGIN));
    const run = mesen(rom, ticks, Math.ceil(ticks / 60) + 20, undefined, { tickAddress: NMI_ADDR, region: 'Ntsc' });
    const s = sounding(run.writes);
    const wantHz = song.firstNotes[0] >= 0 ? Math.round(440 * 2 ** ((song.firstNotes[0] - 57) / 12)) : undefined;
    v = { inputHash, pass: run.writes.length === ticks && song.channelsWithNotes.every((n, i) => !n || s.frames[i] > 0), ticks: run.writes.length, got: run.writes.flat().length, sounding: s.frames, hasNotes: song.channelsWithNotes, firstHz: s.firstHz, wantHz, romBytes: rom.length, songBytes: song.music.length, dpcmBytes: song.dpcm.length, lossy: song.lossy };
  } catch (e) {
    v = { inputHash, pass: false, ticks: 0, got: 0, sounding: [], hasNotes: [], error: e instanceof Error ? e.message : String(e) };
  }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} ticks=${v.ticks} sound=${v.sounding.join('/')} notes=${v.hasNotes.map((n) => (n ? 1 : 0)).join('')} hz=${v.firstHz ?? '-'}/${v.wantHz ?? '-'} song=${v.songBytes ?? '-'}B dpcm=${v.dpcmBytes ?? '-'}B lossy=${v.lossy?.length ?? '-'}${v.error ? ` error=${v.error}` : ''}`);
}
