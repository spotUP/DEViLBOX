// Headless check, NES FamiStudio route: .fur -> furnaceToFamistudio -> buildFamistudioRom -> Mesen2 APU bus-write log.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/nes-famistudio-check.ts [--only <name>] [--failed] [--ticks N] [--out <dir>]
// Results: test-data/nes-famistudio-check.json (skips songs whose input hash matches a recorded verdict).
// FamiStudio is lossy against Furnace by design (plan "FamiStudio route"), so no register diff: the verdict is
//   pass = the ROM ran the requested NMI ticks (at least to every channel's first note + 1 s) and every 2A03 channel that has notes in the song sounded in some frame
//   (pulse/noise volume nibble > 0, triangle linear counter > 0, DPCM enable bit written to $4015),
//   and pitch holds: per channel, at most PITCH_FAIL_SHARE (5%) of the ticks where both sound may differ from the
//   furnace -vgmout reference by more than CENTS_TOL (35 cents), matching against reference ticks t-1..t+1 (TICK_TOL;
//   FamiTracker tempo rounds frames per row). A channel over the share fails the song unless the converter recorded a
//   pitch-class lossy entry (slide / vibrato / arp / pitch), which FamiStudio cannot express; it stays in pitchFail.
// firstHz reports pulse 1's first sounding frequency next to the song's first pulse 1 note (macros can move it; not failed).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildFamistudioRom, furnaceToFamistudio, type FamistudioMeta, type PitchLossySpan } from '../src/lib/export/nes/famistudioSong';
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

interface Verdict { inputHash: string; pass: boolean; ticks: number; got: number; sounding: number[]; hasNotes: boolean[]; firstHz?: number; wantHz?: number; romBytes?: number; songBytes?: number; dpcmBytes?: number; lossy?: string[]; pitch?: PitchDiff[]; pitchFail?: number[]; lag?: number; error?: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const TICKS = args.includes('--ticks') ? Number(args[args.indexOf('--ticks') + 1]) : 900;
// --dump a-b: print both sides' per-tick states for ticks a..b (debug).
const DUMP = args.includes('--dump') ? args[args.indexOf('--dump') + 1].split('-').map(Number) : undefined;

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

const FURNACE = '/Applications/Furnace.app/Contents/MacOS/furnace';

/** Furnace's own render of the song as per-tick 2A03 writes: furnace -vgmout, VGM B4 (NES APU) commands binned by tick. */
function furnaceTicks(furPath: string, _hz: number, ticks: number): Array<Array<[number, number]>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nesfs-'));
  try {
    execFileSync('nice', ['-n', '19', FURNACE, '-console', '-nostatus', '-nocontrols', '-noreport', '-loglevel', 'error', '-loops', '0', '-vgmout', path.join(dir, 'r.vgm'), furPath], { timeout: 120000, stdio: 'ignore' });
    const b = readFileSync(path.join(dir, 'r.vgm'));
    const out: Array<Array<[number, number]>> = Array.from({ length: ticks }, () => []);
    let i = 0x34 + b.readUInt32LE(0x34), sample = 0;
    const perTick = 44100 / 60; // bin by 60 Hz NES frame (the ROM's time base), not by Furnace tick: a 50/56 Hz song's ticks are not frames
    while (i < b.length) {
      const c = b[i];
      if (c === 0x66) break;
      if (c === 0xb4) { const t = Math.floor(sample / perTick + 0.5); if (t >= ticks) break; const a = b[i + 1]; if (a < 0x20) out[t].push([0x4000 + a, b[i + 2]]); i += 3; }
      else if (c === 0x61) { sample += b.readUInt16LE(i + 1); i += 3; }
      else if (c === 0x62) { sample += 735; i++; }
      else if (c === 0x63) { sample += 882; i++; }
      else if (c >= 0x70 && c <= 0x7f) { sample += (c & 15) + 1; i++; }
      else if (c === 0x67) i += 7 + b.readUInt32LE(i + 3);
      else if (c === 0x68) i += 12;
      else if (c >= 0x90 && c <= 0x95) i += [5, 5, 6, 11, 2, 5][c - 0x90]; // DAC stream control (DPCM): not compared
      else if (c >= 0x30 && c <= 0x3f) i += 2;
      else if ((c >= 0x40 && c <= 0x5f) || (c >= 0xa0 && c <= 0xbf)) i += 3;
      else if (c >= 0xc0 && c <= 0xdf) i += 4;
      else if (c >= 0xe0) i += 5;
      else throw new Error(`VGM command ${c.toString(16)} at ${i}`);
    }
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** 2A03 length counter load table (index = $4003 bits 3-7), in half frames. */
const LEN_TABLE = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
/** Per-frame audible state of pulse 1, pulse 2, triangle, noise: period (noise: index | mode<<4) and volume (triangle 15 when on), or null when silent.
 *  Emulates the APU envelope, length counter and triangle linear counter (4 quarter / 2 half frame clocks per 60 Hz frame), so
 *  songs that use Furnace 15xx/16xx/19xx (hardware decay) are measured by the volume the chip outputs, not the raw $4000 nibble. */
type ChState = { period: number; vol: number } | null;
function apuStates(writes: Array<Array<[number, number]>>): ChState[][] {
  const reg = new Uint8Array(0x18);
  reg[0x15] = 0x0f; // famistudio_init and Furnace's reset both enable the four tone channels before the first logged tick
  const len = [0, 0, 0, 0], start = [false, false, false, false], decay = [0, 0, 0, 0], div = [0, 0, 0, 0];
  let linear = 0, linReload = false;
  return writes.map((tick) => {
    for (const [a, v] of tick) {
      const r = a - 0x4000;
      reg[r] = v;
      if (r < 0x10 && (r & 3) === 3) { const k = r >> 2; start[k] = true; if (reg[0x15] & (1 << k)) len[k] = LEN_TABLE[v >> 3]; if (k === 2) linReload = true; }
      if (r === 0x15) for (let k = 0; k < 4; k++) if (!(v & (1 << k))) len[k] = 0;
    }
    for (let q = 0; q < 4; q++) {
      for (const k of [0, 1, 3]) {
        const per = reg[k * 4] & 15;
        if (start[k]) { start[k] = false; decay[k] = 15; div[k] = per; }
        else if (div[k] === 0) { div[k] = per; if (decay[k] > 0) decay[k]--; else if (reg[k * 4] & 0x20) decay[k] = 15; }
        else div[k]--;
      }
      if (linReload) linear = reg[8] & 0x7f; else if (linear > 0) linear--;
      if (!(reg[8] & 0x80)) linReload = false;
      if (q & 1) for (let k = 0; k < 4; k++) if (len[k] > 0 && !(reg[k === 2 ? 8 : k * 4] & (k === 2 ? 0x80 : 0x20))) len[k]--;
    }
    const en = (k: number): boolean => (reg[0x15] & (1 << k)) !== 0 && len[k] > 0;
    const vol = (k: number): number => (reg[k * 4] & 0x10 ? reg[k * 4] & 15 : decay[k]);
    const pulse = (k: number): ChState => { const v = vol(k), p = reg[k * 4 + 2] | ((reg[k * 4 + 3] & 7) << 8); return en(k) && v > 0 && p >= 8 ? { period: p, vol: v } : null; };
    const tp = reg[0xa] | ((reg[0xb] & 7) << 8);
    return [pulse(0), pulse(1), en(2) && linear > 0 && tp >= 2 ? { period: tp, vol: 15 } : null, en(3) && vol(3) > 0 ? { period: (reg[0xe] & 15) | ((reg[0xe] & 0x80) >> 3), vol: vol(3) } : null];
  });
}

/** Pitch tolerance: a tick whose period is off by more than this many cents counts as diverged. */
const CENTS_TOL = 35;
const TICK_TOL = 1;
/** A channel fails when more than this share of its both-sounding ticks diverge in pitch. */
const PITCH_FAIL_SHARE = 0.05;
interface PitchDiff { pitchBad: number; excused: number; both: number; volBad: number; onlyRef: number; onlyGot: number; first?: string }

/** Furnace 2A03 clock per chip flag clockSel (nes.cpp setFlags): NTSC, PAL, Dendy. The ROM always runs NTSC, so a PAL
 *  song's reference periods are compared as frequencies (a PAL period plays lower than the same NTSC period). */
const FURNACE_CLOCK = [CPU_NTSC, 4433618.75 * 3 / 8, 4433618.75 * 2 / 5];

/** Compare the ROM's states to Furnace's per channel, the ROM shifted by `lag` ticks; `refClock` = the reference's 2A03 clock. */
function pitchDiff(ref: ChState[][], got: ChState[][], lag: number, spans: PitchLossySpan[], refClock = CPU_NTSC): PitchDiff[] {
  return [0, 1, 2, 3].map((ch) => {
    const d: PitchDiff = { pitchBad: 0, excused: 0, both: 0, volBad: 0, onlyRef: 0, onlyGot: 0 };
    const cents = (a: NonNullable<ChState>, b: NonNullable<ChState>): number => ch === 3 ? (a.period === b.period ? 0 : 1200) : 1200 * Math.log2((b.period + 1) / ((a.period + 1) * CPU_NTSC / refClock));
    for (let t = 0; t < ref.length && t + lag < got.length; t++) {
      const a = ref[t][ch], b = got[t + lag]?.[ch];
      if (!a && !b) continue;
      // TICK_TOL: FamiTracker tempo rounds frames per row, so rows may land one frame off; any neighbour within it counts.
      const near = (k: number): ChState[] => Array.from({ length: 2 * TICK_TOL + 1 }, (_, i) => (k === 0 ? ref[t + i - TICK_TOL]?.[ch] : got[t + lag + i - TICK_TOL]?.[ch]) ?? null);
      if (!a || !b) { if (a ? !near(1).some(Boolean) : !near(0).some(Boolean)) { if (a) d.onlyRef++; else d.onlyGot++; } continue; }
      d.both++;
      const c = near(0).filter((x): x is NonNullable<ChState> => !!x).map((x) => cents(x, b)).reduce((m, v) => (Math.abs(v) < Math.abs(m) ? v : m), cents(a, b));
      if (Math.abs(c) > CENTS_TOL && spans.some((sp) => sp.ch === ch && t >= sp.from - TICK_TOL && t <= sp.to + TICK_TOL)) d.excused++;
      else if (Math.abs(c) > CENTS_TOL) { d.pitchBad++; d.first ??= `t${t} ref=${a.period} got=${b.period} (${Math.round(c)}c)`; }
      if (!near(0).some((x) => x && Math.abs(x.vol - b.vol) <= 1)) d.volBad++;
    }
    return d;
  });
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
    const rom = buildFamistudioRom(PLAYER, META, song, { title: m.name || name, author: m.author });
    if (OUT) writeFileSync(path.join(OUT, `${name}.nes`), rom);
    const ticks = Math.max(TICKS, ...song.firstNoteFrames.map((f) => f + FIRST_NOTE_MARGIN));
    const run = mesen(rom, ticks, Math.ceil(ticks / 60) + 20, undefined, { tickAddress: NMI_ADDR, region: 'Ntsc' });
    const s = sounding(run.writes);
    // Bin the reference in real-time 60 Hz frames like the ROM's NMI, whatever the song's tick rate (a 56 Hz song binned
    // per tick drifts against the ROM and turns one-frame arp steps into octave errors).
    const ref = apuStates(furnaceTicks(path.join(SONGS, `${name}.fur`), 60, ticks));
    // famistudio_init runs before the first NMI marker, so the harness drops its writes; replay the ones that set APU
    // state the frames depend on ($4015 = $0F, triangle $4008 = $80, noise length load $400F = 0; famistudio_ca65.s
    // famistudio_init). Without the $400F load the noise length counter reads 0 and the noise never counts as sounding.
    const got = apuStates([[[0x4015, 0x0f], [0x4008, 0x80], [0x400f, 0x00], ...(run.writes[0] ?? [])], ...run.writes.slice(1)]);
    const firstOn = (st: ChState[][]): number => st.findIndex((x) => x.some(Boolean));
    const lag = Math.max(0, firstOn(got) - firstOn(ref));
    const pitch = pitchDiff(ref, got, lag, song.pitchLossy, FURNACE_CLOCK[Number(/clockSel=(\d)/.exec(m.chipFlags?.[0] ?? '')?.[1] ?? 0)] ?? CPU_NTSC);
    if (DUMP) for (let t = DUMP[0]; t <= DUMP[1] && t < ref.length; t++) console.log(t, ref[t].map((x) => (x ? `${x.period}/${x.vol}` : '-').padStart(8)).join(' '), ' | ', (got[t + lag] ?? []).map((x) => (x ? `${x.period}/${x.vol}` : '-').padStart(8)).join(' '));
    const wantHz = song.firstNotes[0] >= 0 ? Math.round(440 * 2 ** ((song.firstNotes[0] - 57) / 12)) : undefined;
    const pitchFail = pitch.flatMap((d, i) => (d.both > 0 && d.pitchBad / d.both > PITCH_FAIL_SHARE ? [i] : []));
    v = { inputHash, pass: run.writes.length === ticks && song.channelsWithNotes.every((n, i) => !n || s.frames[i] > 0) && pitchFail.length === 0, pitchFail, ticks: run.writes.length, got: run.writes.flat().length, sounding: s.frames, hasNotes: song.channelsWithNotes, firstHz: s.firstHz, wantHz, romBytes: rom.length, songBytes: song.music.length, dpcmBytes: song.dpcm.length, lossy: song.lossy, pitch, lag };
  } catch (e) {
    v = { inputHash, pass: false, ticks: 0, got: 0, sounding: [], hasNotes: [], error: e instanceof Error ? e.message : String(e) };
  }
  results[name] = v;
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 1)}\n`);
  v.pitch?.forEach((d, i) => console.log(`  ch${i} both=${d.both} pitchBad=${d.pitchBad} excused=${d.excused} volBad=${d.volBad} onlyRef=${d.onlyRef} onlyGot=${d.onlyGot} ${d.first ?? ''}`));
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} ticks=${v.ticks} sound=${v.sounding.join('/')} notes=${v.hasNotes.map((n) => (n ? 1 : 0)).join('')} hz=${v.firstHz ?? '-'}/${v.wantHz ?? '-'} song=${v.songBytes ?? '-'}B dpcm=${v.dpcmBytes ?? '-'}B lossy=${v.lossy?.length ?? '-'} lag=${v.lag ?? '-'}${v.error ? ` error=${v.error}` : ''}`);
}
