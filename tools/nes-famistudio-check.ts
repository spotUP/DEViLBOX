// Headless check, NES FamiStudio route: .fur -> furnaceToFamistudio -> buildFamistudioRom -> Mesen2 APU bus-write log.
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/nes-famistudio-check.ts [--only <name>] [--failed] [--out <dir>]
// Results: test-data/nes-famistudio-check.json (skips songs whose input hash matches a recorded verdict).
// Lockstep: Furnace -vgmout vs Mesen2 APU writes, both binned per 60 Hz frame, whole song (to Furnace's song end), zero tolerance.
// Per frame and channel the emulated APU state must be identical: pulse period/volume/duty/sweep, triangle period/linear counter,
// noise period/mode/volume, DPCM start/rate/length/play. Frame 0 = first frame where any channel sounds (offset `lag` printed).
// Each failing channel reports its FIRST bad frame and is labelled "driver limit" (the exporter's lossy entries / pitch spans explain
// the field) or "converter bug". Lossy entries do not excuse a FAIL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { buildFamistudioRom, furnaceToFamistudio, type FamistudioMeta, type PitchLossySpan } from '../src/lib/export/nes/famistudioSong';
import { APU_RANGES, mesen } from '../src/lib/export/__tests__/nesMesenHarness';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/data/songs/furnace/nes');
const RESULTS = path.join(ROOT, 'test-data/nes-famistudio-check.json');
const PLAYER = readFileSync(path.join(ROOT, 'public/nes/famistudio/player.nes'));
const META: FamistudioMeta = JSON.parse(readFileSync(path.join(ROOT, 'public/nes/famistudio/player.json'), 'utf8'));
const PLAYER_VRC6 = readFileSync(path.join(ROOT, 'public/nes/famistudio/player-vrc6.nes'));
const META_VRC6: FamistudioMeta = JSON.parse(readFileSync(path.join(ROOT, 'public/nes/famistudio/player-vrc6.json'), 'utf8'));
const PLAYER_FME7 = readFileSync(path.join(ROOT, 'public/nes/famistudio/player-fme7.nes'));
const META_FME7: FamistudioMeta = JSON.parse(readFileSync(path.join(ROOT, 'public/nes/famistudio/player-fme7.json'), 'utf8'));
const CPU_NTSC = 1789773;
// Tick marker at NMI entry (vector at $FFFA), not META.tickAddr (after famistudio_update): the harness drops writes before
// the first marker, which would lose the first update (note attacks, the $4003 period-high write).
const nmiOf = (rom: Uint8Array, meta: FamistudioMeta): number => rom[meta.prgOffset + 0x7ffa] | (rom[meta.prgOffset + 0x7ffb] << 8);
// Frames run past the last channel's first note, so a channel that enters late is still heard.
const FIRST_NOTE_MARGIN = 60;

interface Verdict { inputHash: string; pass: boolean; ticks: number; got: number; sounding: number[]; hasNotes: boolean[]; firstHz?: number; wantHz?: number; romBytes?: number; songBytes?: number; dpcmBytes?: number; lossy?: string[]; channels?: ChannelVerdict[]; lag?: number; error?: string }

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
const failedOnly = args.includes('--failed');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const MAX_FRAMES = 60 * 1200; // Furnace render cap (20 min); the song end decides the real length
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
      else if (c >= 0x90 && c <= 0x95) {
        // DAC stream = Furnace PCM mode ($4011 sample stream, dpcmMode=false): start (93/95) and stop (94) binned as pseudo writes $4018/$4019.
        const t = Math.floor(sample / perTick + 0.5);
        if (t < ticks && (c === 0x93 || c === 0x95)) out[t].push([0x4018, 1]); else if (t < ticks && c === 0x94) out[t].push([0x4019, 0]);
        i += [5, 5, 6, 11, 2, 5][c - 0x90];
      }
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
type ChState = { period: number; vol: number; duty: number; sweep: number; lin: number; mode: number } | null;
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
    const pulse = (k: number): ChState => { const v = vol(k), p = reg[k * 4 + 2] | ((reg[k * 4 + 3] & 7) << 8); return en(k) && v > 0 && p >= 8 ? { period: p, vol: v, duty: reg[k * 4] >> 6, sweep: reg[k * 4 + 1], lin: 0, mode: 0 } : null; };
    const tp = reg[0xa] | ((reg[0xb] & 7) << 8);
    return [pulse(0), pulse(1), en(2) && linear > 0 && tp >= 2 ? { period: tp, vol: 15, duty: 0, sweep: 0, lin: 1, mode: 0 } : null, en(3) && vol(3) > 0 ? { period: reg[0xe] & 15, vol: vol(3), duty: 0, sweep: 0, lin: 0, mode: reg[0xe] >> 7 } : null];
  });
}

/** Furnace 2A03 clock per chip flag clockSel (nes.cpp setFlags): NTSC, PAL, Dendy. The ROM always runs NTSC, so a PAL
 *  song's reference periods are compared as frequencies (a PAL period plays lower than the same NTSC period). */
const FURNACE_CLOCK = [CPU_NTSC, 4433618.75 * 3 / 8, 4433618.75 * 2 / 5];

interface FirstBad { frame: number; field: string; expected: string; got: string; row?: string }
interface ChannelVerdict { ch: string; bad: number; first?: FirstBad; label?: 'driver limit' | 'converter bug'; why?: string }
const CH_NAMES = ['pulse1', 'pulse2', 'triangle', 'noise', 'dpcm'];
// triangle `lin` is the counter's on/off (always 1 while the channel sounds): a held counter's value (control bit set) is inaudible; a finite one shows as sounding -> silent transitions.
const FIELDS: Array<keyof NonNullable<ChState>> = ['period', 'vol', 'duty', 'sweep', 'lin', 'mode'];
const fmt = (x: ChState | undefined): string => (x ? FIELDS.map((f) => `${f}=${x[f]}`).join(' ') : 'silent');

/** DPCM per frame: start (a $4015 write with bit 4), the rate/length latched at it, and the last $4015 bit 4 ("play"). */
/** `pcm`: the start is a Furnace PCM-mode stream ($4018 pseudo write), so only its timing compares (no DPCM rate/length/play). */
type DpcmFrame = { start: boolean; rate: number; len: number; play: boolean; pcm?: boolean };
function dpcmFrames(writes: Array<Array<[number, number]>>): DpcmFrame[] {
  let rate = 0, len = 0, play = false, loaded = false, pcm = false;
  return writes.map((tick) => {
    let start = false;
    // $4015 bit 4 with no sample length ever written is the init enable, not a sample start.
    for (const [a, v] of tick) { if (a === 0x4010) rate = v & 15; else if (a === 0x4013) { len = v; loaded = true; pcm = false; } else if (a === 0x4015) { play = (v & 16) !== 0 && loaded; if (play) start = true; } else if (a === 0x4018) { start = true; pcm = true; } }
    return { start, rate, len, play, pcm };
  });
}

/** Exact per-frame compare, the ROM shifted by `lag` frames. Pulse/triangle/noise: silent-vs-sounding or any field differing is bad.
 *  Noise period is an index (not Hz) and DPCM is rate/length, so only pulse/triangle periods are rescaled for a PAL/Dendy reference clock. */
function lockstep(ref: ChState[][], got: ChState[][], rd: DpcmFrame[], gd: DpcmFrame[], lag: number, refClock: number, rowOf: (t: number) => string): ChannelVerdict[] {
  const out: ChannelVerdict[] = [];
  const n = ref.length;
  for (let ch = 0; ch < 5; ch++) {
    const v: ChannelVerdict = { ch: CH_NAMES[ch], bad: 0 };
    const note = (t: number, field: string, expected: string, g: string): void => { v.bad++; v.first ??= { frame: t, field, expected, got: g, row: rowOf(t) }; };
    for (let t = 0; t < n; t++) {
      if (t + lag < 0) continue;
      if (ch === 4) {
        const a = rd[t], b = gd[t + lag] ?? { start: false, rate: 0, len: 0, play: false };
        if (a.start !== b.start) note(t, 'start', String(a.start), String(b.start));
        else if (a.pcm) continue;
        else if (a.start && a.rate !== b.rate) note(t, 'rate', String(a.rate), String(b.rate));
        else if (a.start && a.len !== b.len) note(t, 'length', String(a.len), String(b.len));
        else if (a.play !== b.play) note(t, 'play', String(a.play), String(b.play));
        continue;
      }
      const a = ref[t][ch], b = got[t + lag]?.[ch] ?? null;
      if (!a && !b) continue;
      if (!a || !b) { note(t, 'sounding', fmt(a), fmt(b)); continue; }
      for (const f of FIELDS) {
        let x = a[f];
        if (f === 'period' && ch !== 3 && refClock !== CPU_NTSC) x = Math.round((a.period + 1) * CPU_NTSC / refClock) - 1; // PAL/Dendy reference, same frequency
        if (x !== b[f]) { note(t, f, fmt(a), fmt(b)); break; }
      }
    }
    out.push(v);
  }
  return out;
}

/** "driver limit" when the exporter's own lossy record explains the first bad field; otherwise "converter bug". */
function labelChannels(chs: ChannelVerdict[], song: { lossy: string[]; pitchLossy: PitchLossySpan[] }): void {
  // expansion-chip / subsong notes describe other channels, never an APU-channel mismatch
  const has = (re: RegExp): string | undefined => song.lossy.find((l) => !/^(expansion chip|other subsongs)/.test(l) && re.test(l));
  const byField: Record<string, RegExp> = {
    period: /slide|vibrato|pitch|arp|tempo|tick rate|clamped|sample|note outside/i, sounding: /note cut|dropped to fit|tempo|tick rate|DPCM|past 63|delay/i,
    vol: /volume|envelope|macro|tempo|tick rate/i, duty: /duty|macro/i, sweep: /sweep|effect/i, lin: /volume|macro|note cut|tempo|tick rate|effect/i, mode: /noise|effect|macro/i,
    start: /DPCM|tempo|tick rate|dropped|past/i, rate: /DPCM|effect/i, length: /DPCM|cut/i, play: /DPCM|tempo|tick rate/i,
  };
  chs.forEach((c, i) => {
    if (!c.first) return;
    const f = c.first;
    const span = song.pitchLossy.some((sp) => sp.ch === i && f.frame >= sp.from - 1 && f.frame <= sp.to + 1);
    const hit = span ? 'pitchLossy span' : has(byField[f.field] ?? /$^/);
    c.label = hit ? 'driver limit' : 'converter bug';
    if (hit) c.why = hit;
  });
}

function writeResults(r: unknown): void { writeFileSync(`${RESULTS}.tmp`, `${JSON.stringify(r, null, 1)}\n`); renameSync(`${RESULTS}.tmp`, RESULTS); }

const results: Record<string, Verdict> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
const names = readdirSync(SONGS).filter((f) => f.endsWith('.fur')).map((f) => f.slice(0, -4)).filter((n) => !only || n === only).filter((n) => !failedOnly || results[n]?.pass === false);
const toolHash = createHash('sha1').update(PLAYER).update(readFileSync(import.meta.filename)).update(readFileSync(path.join(ROOT, 'src/lib/export/nes/famistudioSong.ts'))).digest('hex');
for (const name of names) {
  const fur = readFileSync(path.join(SONGS, `${name}.fur`));
  const inputHash = createHash('sha1').update(fur).update(toolHash).digest('hex');
  if (!only && !failedOnly && results[name]?.inputHash === inputHash) { console.log(`[SKIP] ${name}`); continue; }
  let v: Verdict;
  try {
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
    const song = furnaceToFamistudio(m, 0, META.dpcmCap);
    const [player, meta]: [Buffer, FamistudioMeta] = song.vrc6 ? [PLAYER_VRC6, META_VRC6] : song.fme7 ? [PLAYER_FME7, META_FME7] : [PLAYER, META];
    if (song.music.length > meta.musicCap) console.log(`  [SIZE] ${song.music.length} B > cap ${meta.musicCap}: header+instruments=${song.sizes.header} sampleTable=${song.sizes.samples} envelopes=${song.sizes.envelopes} streams(pulse1/pulse2/tri/noise/dpcm...)=${song.sizes.streams.join('/')}`);
    const rom = buildFamistudioRom(player, meta, song, { title: m.name || name, author: m.author });
    if (OUT) writeFileSync(path.join(OUT, `${name}.nes`), rom);
    const refWrites = furnaceTicks(path.join(SONGS, `${name}.fur`), 60, MAX_FRAMES);
    // Reference first: Furnace stops writing at song end (-loops 0); compare the whole song up to and including its last register write.
    // Frames after it are not held state: Furnace has stopped ticking (its volume macros write no more), while the ROM plays on.
    const refEnd = refWrites.map((w) => w.length > 0).lastIndexOf(true) + 1;
    const sub = m.subsongs[0];
    const hz = sub.hz > 0 ? sub.hz : 60;
    const spd = (sub.speedPattern?.length ? sub.speedPattern : [sub.speed1, sub.speed2 || sub.speed1]).reduce((x: number, y: number) => x + y, 0) / (sub.speedPattern?.length || 2);
    const vt = sub.virtualTempo > 0 && sub.virtualTempoD > 0 ? sub.virtualTempoD / sub.virtualTempo : 1;
    const rowOf = (t: number): string => { const r = Math.floor((t * hz / 60) / (spd * vt)); return `~order ${Math.floor(r / sub.patLen)} row ${r % sub.patLen}`; };
    const ref = apuStates(refWrites).slice(0, refEnd);
    const refD = dpcmFrames(refWrites).slice(0, refEnd);
    const lagGuess = Math.max(0, ...song.firstNoteFrames) + FIRST_NOTE_MARGIN;
    const ticks = refEnd + lagGuess + 60;
    const run = mesen(rom, ticks, Math.ceil(ticks / 20) + 60, song.vrc6 ? [...APU_RANGES, [0x9000, 0x9002], [0xa000, 0xa002], [0xb000, 0xb002]] : undefined, { tickAddress: nmiOf(rom, meta), region: 'Ntsc' });
    const s = sounding(run.writes);
    // famistudio_init runs before the first NMI marker, so the harness drops its writes; replay the ones that set APU
    // state the frames depend on ($4015 = $0F, triangle $4008 = $80, noise length load $400F = 0; famistudio_ca65.s famistudio_init).
    const gotWrites = [[[0x4015, 0x0f], [0x4001, 0x08], [0x4005, 0x08], [0x4008, 0x80], [0x400f, 0x00], ...(run.writes[0] ?? [])] as Array<[number, number]>, ...run.writes.slice(1)];
    const got = apuStates(gotWrites);
    const gotD = dpcmFrames(run.writes);
    // Frame 0 = first frame any channel starts sounding (tone or DPCM start) on each side; the constant difference is the printed offset.
    // A DPCM start with length register 0 (one byte) is not a sound: Furnace writes one on a note-off / 18xx row before the first
    // sample (one_sided_love row 0), which shifted the whole compare by two rows.
    const firstOn = (st: ChState[][], d: DpcmFrame[]): number => { const a = st.findIndex((x) => x.some(Boolean)), b = d.findIndex((x) => x.start && x.len > 0); return a < 0 ? b : b < 0 ? a : Math.min(a, b); };
    const lag = firstOn(got, gotD) - firstOn(ref, refD);
    const channels = lockstep(ref, got, refD, gotD, lag, FURNACE_CLOCK[Number(/clockSel=(\d)/.exec(m.chipFlags?.[0] ?? '')?.[1] ?? 0)] ?? CPU_NTSC, rowOf);
    labelChannels(channels, song);
    if (song.vrc6) {
      // No Furnace reference exists for VRC6 (-vgmout has no VRC6 command): report what the ROM writes per VRC6 channel (Mesen bus writes).
      const names = ['VRC6 pulse 1', 'VRC6 pulse 2', 'VRC6 saw'], base = [0x9000, 0xa000, 0xb000];
      const vol = [0, 0, 0], hi = [0, 0, 0], lo = [0, 0, 0];
      const on: number[][] = [[], [], []], periods: Array<Set<number>> = [new Set(), new Set(), new Set()];
      run.writes.forEach((fw, t) => {
        for (const [a, val] of fw) for (let c = 0; c < 3; c++) {
          if (a === base[c]) vol[c] = val; else if (a === base[c] + 1) lo[c] = val; else if (a === base[c] + 2) hi[c] = val;
        }
        for (let c = 0; c < 3; c++) if ((hi[c] & 0x80) && (vol[c] & (c === 2 ? 0x3f : 0x0f))) { on[c].push(t); periods[c].add(((hi[c] & 15) << 8) | lo[c]); }
      });
      console.log(names.map((n, c) => `  ${n}: first sounding frame ${on[c][0] ?? 'never'}, ${on[c].length} sounding frames, ${periods[c].size} distinct periods`).join('\n'));
    }
    if (DUMP) for (let t = DUMP[0]; t <= DUMP[1] && t < ref.length; t++) console.log(t, ref[t].map((x) => (x ? `${x.period}/${x.vol}` : '-').padStart(8)).join(' '), ' | ', (got[t + lag] ?? []).map((x) => (x ? `${x.period}/${x.vol}` : '-').padStart(8)).join(' '));
    const wantHz = song.firstNotes[0] >= 0 ? Math.round(440 * 2 ** ((song.firstNotes[0] - 57) / 12)) : undefined;
    v = { inputHash, pass: channels.every((c) => c.bad === 0) && run.writes.length >= refEnd + lag, channels, ticks: run.writes.length, got: run.writes.flat().length, sounding: s.frames, hasNotes: song.channelsWithNotes, firstHz: s.firstHz, wantHz, romBytes: rom.length, songBytes: song.music.length, dpcmBytes: song.dpcm.length, lossy: song.lossy, lag };
    console.log(`  frames=${refEnd} offset(ROM-Furnace first sound)=${lag}`);
  } catch (e) {
    v = { inputHash, pass: false, ticks: 0, got: 0, sounding: [], hasNotes: [], error: e instanceof Error ? e.message : String(e) };
  }
  results[name] = v;
  writeResults(results);
  for (const label of ['driver limit', 'converter bug'] as const) {
    for (const c of (v.channels ?? []).filter((x) => x.label === label)) console.log(`  [${label.toUpperCase()}] ${c.ch} bad=${c.bad} first: frame ${c.first!.frame} ${c.first!.row ?? ''} field=${c.first!.field} expected{${c.first!.expected}} got{${c.first!.got}}${c.why ? ` (lossy: ${c.why})` : ''}`);
  }
  console.log(`${v.pass ? '[OK]' : '[FAIL]'} ${name} frames=${v.ticks} sound=${v.sounding.join('/')} notes=${v.hasNotes.map((n) => (n ? 1 : 0)).join('')} song=${v.songBytes ?? '-'}B dpcm=${v.dpcmBytes ?? '-'}B lossy=${v.lossy?.length ?? '-'} lag=${v.lag ?? '-'} driverLimit=${(v.channels ?? []).filter((c) => c.label === 'driver limit').length} converterBug=${(v.channels ?? []).filter((c) => c.label === 'converter bug').length}${v.error ? ` error=${v.error}` : ''}`);
}
