/**
 * Furnace NES song -> FamiStudio sound engine data (third-party/famistudio, MIT), for the
 * NROM player public/nes/famistudio/player.nes. Replaces the register-stream capture route
 * (nesRecord/nesStream/nesCapture) once the check tool passes.
 *
 * Data layout follows FamiStudio's FamitoneMusicFile.cs (FamiStudio kernel, FamiTracker tempo),
 * emitted as bytes for a fixed base address instead of asm text: header (OutputHeader),
 * instruments (OutputInstruments), envelopes (ProcessEnvelope), DPCM mappings
 * (OutputDPCMMappings), then one opcode stream per channel. Plan + mapping table:
 * thoughts/shared/plans/2026-11-17-nes-native-player.md, section "FamiStudio route".
 *
 * Scope now: 2A03 (2 pulse, triangle, noise) + DPCM. Expansion chips are reported lossy.
 */

import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import type { FurnacePatternCell } from '../../import/formats/furnace/FurnacePatternParser';
import { nesScreenText, nesScrollText, type NesScreenInfo } from './nesCartridge';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';

export interface FamistudioMeta { musicAddr: number; musicCap: number; dpcmAddr: number; dpcmCap: number; prgOffset: number; tickAddr: number; titleAddr: number; authorAddr: number; textLen: number; chipAddr: number; chipLen: number; scrollAddr: number; scrollLen: number; nsubAddr: number; nmiAddr: number; sourceHash: string; /** Initial FamiTracker tempo accumulator word (player.s fs_tacc). */ taccAddr?: number }
/** Frames (song start = 0) where the converter knows the pitch cannot match Furnace (a lossy slide), per channel. */
export interface PitchLossySpan { ch: number; from: number; to: number }
export interface FamistudioSong { /** Initial tempo accumulator (8.8; 0x600 = engine default). */ tempoAcc?: number; music: Uint8Array; dpcm: Uint8Array; lossy: string[]; pitchLossy: PitchLossySpan[]; channelsWithNotes: boolean[]; firstNotes: number[]; firstNoteFrames: number[];
  /** Bytes of each music-area part: song header + instrument table, DPCM sample table, envelopes, and one entry per channel stream. */ sizes: { header: number; samples: number; envelopes: number; streams: number[] }
  /** The song carries the three VRC6 channels: it needs the mapper-24 player (player-vrc6.nes / .json). */ vrc6?: boolean
  /** Music past 16 KB, assembled for $6000: it needs the FME-7 player (player-fme7.nes / .json). */ fme7?: boolean
  /** Furnace A-4 tuning (Hz); buildFamistudioRom retunes the player's note table to it. */ tuning?: number
  /** Furnace 2A03 clock (clockSel): the note table rounds on its grid. */ clock?: number }

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
  save(): Map<string, number> { return new Map(this.counts); }
  restore(saved: Map<string, number>): void { this.counts = saved; }
}

const VRC6_SYSTEM = 0x88; // Furnace file system id: VRC6 (channels 5-7 after the five 2A03 ones: pulse, pulse, saw)
const VRC6_SAW_INS = 26; // Furnace instrument type DIV_INS_VRC6_SAW
const NES_SYSTEM = 0x06; // Furnace file system id (FurnaceSongParser.ts:172)
const CHANNELS = 5; // square 1, square 2, triangle, noise, DPCM (FamiStudio 2A03 order = Furnace order)
const DPCM_CH = 4;
const NOISE_CH = 3;
const MAX_INSTRUMENTS = 64;
const MAX_EMPTY = 64; // 0x81|(n<<1) waits n+1 rows, n <= 63
/** FamiStudio note N plays NoteTables index N; index 46 = A-4 440 Hz (pulse). Measured with `furnace -vgmout`: the
 *  flat value 45 (convertFurnaceNoteValue) sounds 440 Hz on a 2A03 pulse. Pulse and triangle share one period table
 *  in both engines (triangle an octave below a pulse at the same period), so one offset serves both. */
const NOTE_OFFSET = -1;
/** Furnace nes.cpp noiseTable: period index for note position ntPos when the song lacks properNoiseLayout (old files). */
const NOISE_TABLE = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, ...[0, 1, 2, 3, 4, 5, 6].flatMap((r) => (r === 0 || r % 2 === 1 ? [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4] : [3, 2, 1, 0, 11, 10, 9, 8, 7, 6, 5, 4]))];
/** Arp macro step that pins a fixed note (flat note = value). Furnace engine.cpp calcArp: fixed when bit 30 differs from
 *  the sign bit (a negative relative step such as -2 = 0xFFFFFFFE has bit 30 set and is NOT fixed). */
const ARP_FIXED = 0x40000000;
export const arpIsFixed = (v: number): boolean => ((v & ARP_FIXED) !== 0) !== (v < 0);
/** Fixed arp step -> flat note (calcArp: arp|0x40000000 when negative, arp&~0x40000000 when positive). */
const arpFixedNote = (v: number): number => (v < 0 ? v | ARP_FIXED : v & ~ARP_FIXED);
/** FamiStudio noise note whose period index (15 - (note & 15), famistudio_ca65.s) equals Furnace's for note position
 *  ntPos (nes.cpp: properNoiseLayout 15 - (ntPos & 15), else noiseTable[ntPos]). */
export const noiseNote = (ntPos: number, proper: boolean): number => 32 + (proper ? ntPos & 15 : 15 - (NOISE_TABLE[Math.max(0, ntPos)] ?? 15));
/** FamiTracker tempo 150 = one Furnace tick per 60 Hz frame (FamitoneMusicFile.cs OutputHeader). */
const FT_TEMPO = 150;

/** Macro code -> FamiStudio envelope slot (instrument entry order vol, arp, duty, pitch). */
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_PITCH = 4;

/** ProcessEnvelope (FamitoneMusicFile.cs:325-432) for one envelope; values already in env units. */
export function encodeEnvelope(values: number[], loop: number, release: number, kind: 'vol' | 'arp' | 'duty' | 'pitch', relative = false): number[] {
  const lead = kind === 'vol' || kind === 'pitch';
  const allowReleases = kind === 'vol';
  if (values.length === 1 && !relative && release < 0) {
    const v = 192 + clampEnv(values[0]);
    return lead ? [0x00, v, 0x7f, 0x00, 0x02] : [v, 0x7f, 0x00, 0x00];
  }
  const data: number[] = lead ? [kind === 'pitch' && relative ? 0x80 : 0x00] : [];
  let ptrLoop = -1, relCount = 0, foundRelease = false;
  let prevVal = 192 + clampEnv(values[0]) + 1;
  const allowRle = !relative;
  for (let j = 0; j < values.length; j++) {
    const val = 192 + clampEnv(values[j]);
    if (prevVal !== val || !allowRle || j === loop || (allowReleases && j === release) || j === values.length - 1 || (relCount === 127 && kind === 'pitch')) {
      if (relCount !== 0) {
        if (relCount === 1) data.push(prevVal);
        else { while (relCount > 127) { data.push(127); relCount -= 127; } data.push(relCount); }
        relCount = 0;
      }
      if (j === loop) ptrLoop = data.length;
      if (j === release && allowReleases) {
        foundRelease = true;
        data.push(0, ptrLoop);
        data[0] = data.length;
      }
      data.push(val);
      prevVal = val;
    } else relCount++;
  }
  if (ptrLoop < 0 || foundRelease) {
    if (kind === 'pitch' && relative && data[data.length - 1] !== 192) data.push(192);
    ptrLoop = data.length - 1;
  }
  data.push(0, ptrLoop);
  return data;
}
const clampEnv = (v: number): number => Math.max(-64, Math.min(63, v));

const DEFAULT_ENV: Record<'vol' | 'arp' | 'duty' | 'pitch', number[]> = {
  vol: encodeEnvelope([15], -1, -1, 'vol'),
  arp: [0xc0, 0x7f, 0x00, 0x01],
  duty: [0x7f, 0x00, 0x00],
  pitch: [0x00, 0xc0, 0x7f, 0x00, 0x02],
};

/** Furnace macro -> envelope values + loop/release, expanding speed and delay into frames. */
/**
 * Furnace macros are sequences, ADSR (open bits 1-2 = 1) or LFO (= 2). The latter two store parameters in data[]
 * (macroInt.cpp 19-47, 141-300), not values: run the same per-tick state machine here and return a plain sequence.
 * shortcut: note release is ignored (no release phase / LFO keeps running), LFO cut at 240 ticks, delay ticks ignore macro speed.
 */
export function expandProcMacro(mac: FurnaceMacro, version = 245): FurnaceMacro {
  const kind = ((mac.type & 15) >> 1) & 3;
  if (kind !== 1 && kind !== 2) return mac;
  const v = mac.data.slice();
  if (version < 245) { // instrument.cpp convertOldADSRLFO: files before 245 store rates as 0..255 fractions of the range
    if (v[0] >= v[1]) v[0] = v[1] + ((255 + (v[0] - v[1]) * 255) >> 8);
    const bottom = v[0], top = v[1], range = Math.abs(top - bottom) << 8;
    if (kind === 1) {
      for (const i of [2, 4, 7, 8]) v[i] = Math.trunc((v[i] * range) / 255);
      v[5] = bottom + Math.trunc(((top - bottom) * v[5]) / 255);
    } else {
      const w = v[12] & 3, r = Math.abs(top - bottom);
      v[11] = w === 0 ? (r * v[11]) >> 1 : w === 1 ? (r * v[11]) >> 2 : w === 2 ? v[11] << 6 : v[11];
    }
  }
  const [low, high, ar, ht, dr, sl, st, sr] = v, lfoSpeed = v[11], wave = v[12] & 3, phase = v[13];
  const inv = low > high, bottom = (low << 8) | (inv ? 0xff : 0), top = high << 8; // measured against Furnace 0.6 (The East tambourine 0,15 ADSR): the peak is high<<8, reached on the first tick STRICTLY past it
  const sus = inv ? sl << 8 : (sl << 8) | 0xff;
  let pos = bottom, state = 0, delay = 0, dir = false, val = low;
  if (kind === 2) {
    const b = low << 8, tp = (high << 8) | 0xff;
    if (wave === 0) { dir = (phase & 512) !== 0; pos = dir ? tp + (((b - tp) * (phase & 511)) >> 9) : b + (((tp - b) * phase) >> 9); }
    else if (wave === 1) pos = b + (((tp - b) * phase) >> 10);
    else pos = phase << 6;
  }
  const out: number[] = [];
  for (let n = 0; n < 240; n++) {
    if (delay > 0) { delay--; out.push(val); continue; }
    const d = inv ? -1 : 1; // the inverted case mirrors every comparison
    if (kind === 1) {
      if (state === 0) { pos += d * ar; if (d * (pos - top) > 0) { pos = top; state = 1; delay = ht; } }
      else if (state === 1) { pos -= d * dr; if (d * (pos - sus) <= 0) { pos = sus; state = 2; delay = st; } }
      else if (state === 2) { pos -= d * sr; if (d * (pos - (inv ? bottom : low << 8)) <= 0) { pos = bottom; state = 4; } }
      else { out.push(val); break; }
      val = pos >> 8;
    } else if (wave === 2) { pos = (pos + lfoSpeed) & 65535; val = pos & 32768 ? high : low; }
    else {
      const lo = inv ? high << 8 : low << 8, hi = inv ? (low << 8) | 0xff : (high << 8) | 0xff;
      if (wave === 0) { pos += dir === inv ? lfoSpeed : -lfoSpeed; if (pos > hi) { dir = !inv; pos -= lfoSpeed * 2; } else if (pos < lo) { dir = inv; pos += lfoSpeed * 2; } }
      else { pos += inv ? -lfoSpeed : lfoSpeed; if (pos > hi || pos < lo) pos += inv ? hi - lo : lo - hi; }
      val = pos >> 8;
    }
    out.push(val);
  }
  return { ...mac, type: mac.type & ~6, data: out, length: out.length, loop: 255, release: 255 };
}

function macroEnvelope(macIn: FurnaceMacro, kind: 'vol' | 'arp' | 'duty' | 'pitch', lossy: Lossy, step?: (v: number) => number, rate = 1, version = 245, ph = 0): number[] {
  const f = macroFrames(macIn, kind, lossy, step, rate, version, ph);
  return encodeEnvelope(f.vals, f.loop, f.release, kind, f.relative);
}

/** The last engine tick (counted from song tick 0) a 60 Hz frame shows, at rate = Furnace ticks per frame. Tick j lands
 *  in frame round(j / rate), as rowFrame and the Furnace reference bin it (ties go to the earlier frame: the VGM sample
 *  is floored). Famitune1, 56 Hz: frame 1 shows tick 1 and frame 8 repeats tick 7. `ph` = the note's start time minus
 *  its frame (-0.5..0.5): at 50 Hz a note starting 0.4 frame late shows its tick 0 on two frames. */
export const tickAtFrame = (f: number, rate: number, ph = 0): number => Math.ceil((f + 0.5 - ph) * rate + 1e-9) - 1;

/** Per-frame envelope values of a Furnace macro (what macroEnvelope encodes). */
function macroFrames(macIn: FurnaceMacro, kind: 'vol' | 'arp' | 'duty' | 'pitch', lossy: Lossy, step?: (v: number) => number, rate = 1, version = 245, ph = 0): { vals: number[]; loop: number; release: number; relative: boolean } {
  const mac = expandProcMacro(macIn, version);
  const speed = Math.max(1, mac.speed || 1);
  const delay = Math.max(0, mac.delay || 0);
  const vals: number[] = [];
  for (let i = 0; i < delay; i++) vals.push(mac.data[0]);
  for (const v of mac.data.slice(0, mac.length)) for (let i = 0; i < speed; i++) vals.push(v);
  const at = (i: number): number => (i >= 0 && i < mac.length ? delay + i * speed : -1);
  let loop = at(mac.loop);
  let release = at(mac.release);
  if (kind === 'vol') {
    // Furnace holds at the release step until note release; FamiStudio loops [loop, release) then jumps on.
    if (release >= 0) {
      if (loop < 0 || loop > release) loop = release;
      release = release + 1 < vals.length ? release + 1 : -1;
      if (release < 0) loop = vals.length - 1;
    }
  } else if (release >= 0) {
    lossy.add(`${kind} macro release point (FamiStudio has releases on volume only)`);
    if (loop < 0 || loop > release) { vals.length = release + 1; loop = -1; }
  }
  // Furnace steps macros once per engine tick; FamiStudio once per 60 Hz frame. Resample (rate = ticks per frame);
  // relative pitch macros are increments per tick and stay unresampled.
  if (rate !== 1 && (kind !== 'pitch' || (mac.mode & 1) === 0) && vals.length > 1) {
    const src = vals.slice();
    vals.length = 0;
    // A frame can hold several ticks: a one-shot macro runs on until a frame shows its last tick, so it ends on its
    // last value (samurai 128 Hz noise kick volume 0) instead of the tick before it. A looped one keeps its length.
    const more = (f: number): boolean => tickAtFrame(f, rate, ph) < src.length || (loop < 0 && tickAtFrame(f - 1, rate, ph) < src.length - 1);
    for (let f = 0; more(f); f++) vals.push(src[Math.min(src.length - 1, tickAtFrame(f, rate, ph))]);
    const fr = (i: number): number => (i < 0 ? -1 : Math.min(vals.length - 1, Math.max(0, Math.floor(i / rate + ph + 0.5 - 1e-9))));
    loop = fr(loop); release = fr(release);
  }
  if (vals.length > 240) { lossy.add(`${kind} macro longer than 240 frames (cut)`); vals.length = 240; if (loop >= 240) loop = -1; if (release >= 240) release = -1; }
  if (vals.length > 0 && loop < 0 && kind !== 'vol' && kind !== 'pitch') loop = -1;
  // `step` maps a macro value to envelope units (arp: per-note target; pitch: linear 1/128 semitone -> period units).
  return { vals: vals.map((v) => (step && (kind === 'arp' || kind === 'pitch') ? step(v) : kind !== 'arp' ? v : (v << 2) >> 2)), loop, release: kind === 'vol' ? release : -1, relative: kind === 'pitch' && (mac.mode & 1) === 1 };
}

/**
 * Furnace adds vibrato (chan.pitch) and the pitch macro (pitch2); FamiStudio's 0x49 override replaces the instrument
 * pitch envelope, so both go into one relative envelope: per-frame deltas of (macro offset + vibrato), +-63 per step.
 * `vib` is one looping vibrato cycle (absolute offsets); `mac` is the macro as macroFrames gives it (period units).
 */
export function mergeVibratoPitch(vib: number[], mac: { vals: number[]; loop: number; relative: boolean }, lossy: { add(s: string): void }, vibShort?: number[]): { deltas: number[]; loop: number } {
  let len = mac.vals.length;
  // A held tail (ADSR sustain, trailing zero increments) repeats already: end the macro part where it stops moving.
  if (mac.loop < 0) while (len > 1 && (mac.relative ? mac.vals[len - 1] === 0 : mac.vals[len - 1] === mac.vals[len - 2])) len--;
  const lp = mac.loop >= 0 && mac.loop < len ? len - mac.loop : 0;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const period = lp ? (lp * vib.length) / gcd(lp, vib.length) : vib.length;
  // Past the macro's last frame both parts repeat (macro loop or hold, vibrato cycle), so the deltas loop from there.
  let end = len + period, loop = len;
  // An unrolled multi-cycle vibrato that no longer fits next to the macro falls back to its one-cycle loop.
  if (end > 240 && vibShort && vibShort.length < vib.length) return mergeVibratoPitch(vibShort, mac, lossy);
  if (end > 240) { lossy.add('vibrato + pitch macro envelope longer than 240 frames (cut, no loop)'); end = 240; loop = -1; }
  const macAt = (f: number): number => (f < len ? f : lp ? mac.loop + ((f - len) % lp) : -1);
  const deltas: number[] = [];
  let macAbs = 0, prev = 0;
  for (let f = 0; f < end; f++) {
    const i = macAt(f);
    if (mac.relative) macAbs += i >= 0 ? mac.vals[i] : 0;
    else macAbs = i >= 0 ? mac.vals[i] : mac.vals[len - 1] ?? 0;
    const total = macAbs + vib[f % vib.length];
    let d = total - prev;
    if (Math.abs(d) > 63) { lossy.add('vibrato + pitch macro step past 63 period units (clamped)'); d = Math.sign(d) * 63; }
    deltas.push(d);
    prev += d;
  }
  return { deltas, loop };
}

/**
 * An LFO pitch macro is expanded to a 240-frame delta list; its rounded deltas repeat exactly, so a tail that repeats
 * twice with a zero-sum cycle becomes one cycle plus a loop point (the engine replays it forever, as the LFO does).
 */
export function loopPeriodicTail(d: number[]): { deltas: number[]; loop: number } {
  const n = d.length;
  let best = { cut: n, loop: -1 };
  for (let q = 1; 2 * q <= n; q++) {
    let l = n - q;
    while (l > 0 && d[l - 1] === d[l - 1 + q]) l--;
    if (n - l < 2 * q || l + q >= best.cut) continue;
    let sum = 0;
    for (let i = l; i < l + q; i++) sum += d[i];
    if (sum === 0) best = { cut: l + q, loop: l };
  }
  return { deltas: d.slice(0, best.cut), loop: best.loop };
}

/** 8-bit level stream -> 1-bit delta DPCM bytes (FamiStudio DPCM encoder logic, no resampling). */
function pcmToDpcm(levels: number[]): number[] {
  const out: number[] = [];
  let level = 64, byte = 0;
  levels.forEach((target, i) => {
    const up = target > level;
    if (up) { byte |= 1 << (i & 7); if (level <= 125) level += 2; } else if (level >= 2) level -= 2;
    if ((i & 7) === 7) { out.push(byte); byte = 0; }
  });
  if (levels.length & 7) out.push(byte);
  return out;
}

/** NES DPCM rates (Hz, NTSC) for pitch index 0..15. */
const DPCM_RATES = [4181.71, 4709.93, 5264.04, 5593.04, 6257.95, 7046.35, 7919.35, 8363.42, 9419.86, 11186.1, 12604, 13982, 16884.6, 21306.8, 24858, 33143.9];
/** 2A03 pulse period of FamiStudio note n (index 46 = A-4 at `a4` Hz); the triangle period is half. */
const periodRawAt = (n: number, a4: number): number => 1789773 / (16 * a4 * 2 ** ((n - 46) / 12));

/** Furnace 2A03 clock per chip flag clockSel (nes.cpp setFlags): NTSC, PAL, Dendy. */
const NES_CLOCKS = [1789773, 4433618.75 * 3 / 8, 4433618.75 * 2 / 5];
export const furnaceNesClock = (m: { chipFlags?: string[] }): number => NES_CLOCKS[Number(/clockSel=(\d)/.exec(m.chipFlags?.[0] ?? '')?.[1] ?? 0)] ?? 1789773;

/** NTSC period + 1 for an exact NTSC period + 1 (`raw`), rounded where Furnace rounds: on the song's clock grid. A PAL song
 *  plays an integer PAL period P; the NTSC ROM sounds the same pitch at round((P + 1) * 1789773 / clock) - 1. Rounding the
 *  exact NTSC value instead lands +-1 off (turtle_byte, A-4 = 436 PAL: 24 of 96 note-table entries). NTSC: Math.round. */
export const roundOnClock = (raw: number, clock: number): number => (clock === 1789773 ? Math.round(raw) : Math.round(Math.round(raw * clock / 1789773) * 1789773 / clock));
const SLIDE_FX = new Set([0x01, 0x02, 0x03, 0xe1, 0xe2]);
const clamp8 = (v: number): number => Math.max(-127, Math.min(127, Math.round(v)));
/** Furnace VOL_SCALE_LINEAR_BROKEN (dispatch.h): channel volume x macro volume. Default floors; FamiStudio's volume table
 *  rounds up, so a channel volume under 15 is baked into the volume envelope and the channel volume sent as 15. */
/** Volume cache value that forces the next 0x70 (-1 instead skips it on a note: the slide or default volume is in place). */
const LAST_VOL_UNKNOWN = -2;
/** + KEY_PHASE * (501 + start phase in 1/1000 frame): one instrument copy per distinct resampled macro set. */
const KEY_PHASE = 2 ** 33;
type PhaseStat = { over: boolean; uses: Map<number, number>; copies: Map<number, Set<number>> };
const KEY_BAKE = 2 ** 28; // instrument key = macro index + 65536 * (1 + hardware envelope) + KEY_BAKE * (1 + baked channel volume)
const scaleVol = (vol: number, env: number, flags: { newVolumeScaling?: unknown; ceilVolumeScaling?: unknown } | undefined): number => {
  const e = Math.min(15, env);
  if (flags?.newVolumeScaling === false) return Math.max(0, Math.min(15, vol + e - 15));
  return flags?.ceilVolumeScaling ? Math.floor((vol * e + 14) / 15) : Math.floor((vol * e) / 15);
};

/** Music bytes the NROM player holds at $8000 (musicCap in player.json). */
const MUSIC_CAP = 16384;
/** 2A03 songs past MUSIC_CAP go to the FME-7 player: 24 KB of music at $6000 (player-fme7.json musicAddr / musicCap). */
const FME7_MUSIC_ADDR = 0x6000;
const FME7_MUSIC_CAP = 0x6000;

export function furnaceToFamistudio(m: FurnaceModule, subsong = 0, dpcmCap = 0x2000): FamistudioSong {
  // The loop pass (end-of-song state at the loop target) is tried first in each music area and kept only when it fits
  // with nothing dropped: it never moves a song to another area. Then note cuts cost 2 bytes per row, a held 01/02 slide
  // 3 extra bytes per note; when the song is over the cap, drop cuts first, then held slides (the notes then play
  // unslid), then both.
  // Macro phase copies past the 64-instrument cap: the least-used instruments fall back to one copy.
  const noPhase = new Set<number>();
  // Per-note arp override at the note's own phase for instruments that lost their phase copies: kept only when the song still fits the first music area.
  let phaseArp = false;
  const conv = (cuts: boolean, held: boolean, b: number, loop: boolean): FamistudioSong => {
    for (;;) {
      const stat: PhaseStat = { over: false, uses: new Map(), copies: new Map() };
      const song = convert(m, subsong, dpcmCap, cuts, held, b, loop, noPhase, stat, phaseArp);
      const multi = [...stat.copies].filter(([, c]) => c.size > 1).sort((x, y) => (stat.uses.get(x[0]) ?? 0) - (stat.uses.get(y[0]) ?? 0));
      if (!stat.over || !multi.length) {
        if (noPhase.size) song.lossy.push(`macro start phase copies dropped for ${noPhase.size} instruments (64-instrument cap)`);
        return song;
      }
      let excess = [...stat.copies.values()].reduce((n, c) => n + c.size, 0) + [...noPhase].filter((k) => stat.uses.has(k)).length - MAX_INSTRUMENTS;
      for (const [k, c] of multi) { noPhase.add(k); excess -= c.size - 1; if (excess <= 0) break; }
    }
  };
  const fit = (): FamistudioSong => {
    let base = 0x8000;
    let cap = MUSIC_CAP;
    let song = conv(true, true, base, true);
    if (song.music.length > cap) song = conv(true, true, base, false);
    // shortcut: VRC6 songs stay on the 16 KB mapper-24 player; give player-vrc6 a second music bank when one needs it.
    if (song.music.length > cap && !song.vrc6) {
      base = FME7_MUSIC_ADDR;
      cap = FME7_MUSIC_CAP;
      song = conv(true, true, base, true);
    }
    for (const [cuts, held] of [[true, true], [false, true], [true, false], [false, false]]) {
      if (song.music.length <= cap) break;
      song = conv(cuts, held, base, false);
      if (!cuts) song.lossy.push(`note cut EC dropped to fit the ${cap / 1024} KiB music area`);
      if (!held) song.lossy.push(`01/02 slide held over later notes dropped to fit the ${cap / 1024} KiB music area`);
    }
    if (base === FME7_MUSIC_ADDR) song.fme7 = true;
    return song;
  };
  const fitDrops = (x: FamistudioSong): number => x.lossy.filter((l) => l.includes('to fit the')).length;
  phaseArp = false;
  const plain = fit();
  phaseArp = true;
  const rich = fit();
  return !!rich.fme7 === !!plain.fme7 && fitDrops(rich) <= fitDrops(plain) ? rich : plain;
}

const APU_LENGTH = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];

/** 2A03 pulse/noise volume per 60 Hz frame after a note trigger, for envMode | period << 2 | lengthIndex << 6
 *  (15xx/volume column/16xx): envelope decay on quarter-frame clocks, length counter on half-frame clocks. */
export function hwVolumeEnvelope(hw: number): number[] {
  const mode = hw & 3, per = (hw >> 2) & 15, envOn = (mode & 1) === 0, halt = (mode & 2) !== 0;
  let len = APU_LENGTH[(hw >> 6) & 31], decay = 15, div = per, start = true;
  const out: number[] = [];
  // A looping envelope repeats every 16 x (period + 1) quarter clocks = 4 x (period + 1) frames, phase-locked to the trigger.
  const frames = halt ? (envOn ? 4 * (per + 1) : 1) : 240;
  for (let f = 0; f < frames; f++) {
    for (let q = 0; q < 4; q++) {
      if (start) { start = false; decay = 15; div = per; }
      else if (div === 0) { div = per; if (decay > 0) decay--; else if (halt) decay = 15; }
      else div--;
      if ((q & 1) === 1 && !halt && len > 0) len--;
    }
    out.push(!halt && len === 0 ? 0 : envOn ? decay : 15);
    if (!halt && (len === 0 || (envOn && decay === 0))) break;
  }
  return encodeEnvelope(out, halt ? 0 : out.length - 1, -1, 'vol');
}

export interface StreamRef { at: number; events: number; target: number }
export interface PackedStream { out: number[]; efx: Array<[number, number]>; loopAt: number; refs: StreamRef[]; chunkEnds: number[] }
const REF_OP = 0x41; // engine opcode_set_reference: len (events), 16-bit address; counts events (note, wait or slide byte), then returns
const REF_SIZE = 4;

/**
 * FamiStudio-style pattern references. A chunk = the ops before an event plus the event (`ev` = stream length after each
 * event). A run of chunks equal to earlier literal chunks becomes `0x41 len addr` when that is shorter. References never
 * nest (the engine keeps one return pointer) and never hide the loop target. Chunks match on bytes and envelope ids
 * (`efx`: [offset, envelope id]). Returns the stream without the loop op; `target` is a stream offset (caller adds the base).
 */
export function compressRefs(out: number[], ev: number[], efx: Array<[number, number]>, loopAt: number): PackedStream {
  const n = ev.length;
  const starts = ev.map((_, i) => (i ? ev[i - 1] : 0));
  const envAt = new Map(efx);
  const ids = new Map<string, number>();
  const key = starts.map((a, i) => {
    let k = '';
    for (let o = a; o < ev[i]; o++) { if (envAt.has(o)) { k += `e${envAt.get(o)},`; o++; } else k += `${out[o]},`; }
    // Release (0x45) jumps to the engine's ref-row check with X clobbered by the envelope index (famistudio_ca65.s @opcode_release_note),
    // so a reference cannot count it: give it a key nothing else shares.
    if (out[ev[i] - 1] === 0x45 && ev[i] - a === 1) k = `release${i}`;
    return ids.get(k) ?? (ids.set(k, ids.size), ids.size - 1);
  });
  const literal = new Array<boolean>(n).fill(true);
  const plan = new Map<number, { len: number; j: number }>();
  for (let i = 0; i < n;) {
    let cap = Math.min(255, n - i);
    for (let k = i + 1; k < i + cap; k++) if (starts[k] === loopAt) { cap = k - i; break; }
    let best = 0, bestJ = -1, bestSave = 0;
    for (let j = 0; j < i; j++) {
      let l = 0, bytes = 0;
      while (l < cap && j + l < i && literal[j + l] && key[j + l] === key[i + l]) { bytes += ev[i + l] - starts[i + l]; l++; }
      if (bytes - REF_SIZE > bestSave) { best = l; bestJ = j; bestSave = bytes - REF_SIZE; }
    }
    if (best > 0) { plan.set(i, { len: best, j: bestJ }); for (let k = 0; k < best; k++) literal[i + k] = false; i += best; } else i++;
  }
  const res: number[] = [], newEfx: Array<[number, number]> = [], refs: StreamRef[] = [], chunkEnds: number[] = [];
  const newStart = new Array<number>(n).fill(-1);
  let loop = loopAt >= (ev[n - 1] ?? 0) ? -1 : loopAt;
  for (let i = 0; i < n;) {
    if (starts[i] === loopAt) loop = res.length;
    const r = plan.get(i);
    if (r) {
      refs.push({ at: res.length, events: r.len, target: newStart[r.j] });
      res.push(REF_OP, r.len, 0, 0); i += r.len;
      continue;
    }
    newStart[i] = res.length;
    for (let o = starts[i]; o < ev[i]; o++) { if (envAt.has(o)) newEfx.push([res.length, envAt.get(o)!]); res.push(out[o]); }
    chunkEnds.push(res.length); i++;
  }
  return { out: res, efx: newEfx, loopAt: loop < 0 ? res.length : loop, refs, chunkEnds };
}

/** Inverse of compressRefs (references replaced by the chunks they replay), for tests. Envelope placeholders stay zero. */
export function expandRefs(p: PackedStream): number[] {
  const lit: Array<[number, number]> = []; // literal chunks [start, end)
  const refAt = new Map(p.refs.map((r) => [r.at, r]));
  const out: number[] = [];
  for (let o = 0; o < p.out.length;) {
    const r = refAt.get(o);
    if (r) { const k = lit.findIndex(([s]) => s === r.target); for (const [s, e] of lit.slice(k, k + r.events)) out.push(...p.out.slice(s, e)); o += REF_SIZE; continue; }
    const e = p.chunkEnds.find((x) => x > o)!;
    lit.push([o, e]); out.push(...p.out.slice(o, e)); o = e;
  }
  return out;
}

/**
 * FamiStudio slide step (half-periods per frame, signed) that best follows Furnace's linear-pitch slide.
 * Furnace moves `unitsPerTick` 1/128 semitones per tick up to `totalUnits` (Infinity for 01/02, which slide on) and
 * writes round(rawFrom * 2^(-(u + furPitch)/1536)) - 1 (calcFreq with E5 fine pitch, NES freq--). FamiStudio starts at
 * 2 * (from - to) half-periods, adds the step every frame and plays to + fsOffset (its fine pitch) + floor(pitch / 2).
 * Rounding the average step drifts by one mid-slide (one_sided_love 030D: 140 -> 132 wants 6, round(6.5) = 7), so
 * every step is simulated and the closest curve wins. Returns [signed step, summed period error]; an error above 0
 * means no constant FamiStudio step reproduces the slide.
 */
export function bestSlideStep(o: { rawFrom: number; fromPeriod: number; toPeriod: number; unitsPerTick: number; totalUnits: number; dirUp: boolean; furPitch: number; fsOffset: number; frames: number; perTick: number; guess: number; clock?: number }): [number, number] {
  const sign = o.toPeriod < o.fromPeriod ? -1 : 1;
  const fur: number[] = [];
  for (let f = 0; f < o.frames; f++) {
    const u = Math.min(o.totalUnits, o.unitsPerTick * (Math.floor(f / o.perTick) + 1));
    fur.push(roundOnClock(o.rawFrom * 2 ** (-((o.dirUp ? u : -u) + o.furPitch) / 1536), o.clock ?? 1789773) - 1);
  }
  let best = Math.max(1, Math.min(127, Math.round(o.guess))), bestCost = Infinity;
  for (let st = 1; st <= 127; st++) {
    let pitch = 2 * (o.fromPeriod - o.toPeriod), cost = 0;
    for (let f = 0; f < o.frames && cost <= bestCost; f++) {
      pitch += sign * st;
      if (sign < 0 ? pitch < 0 : pitch > 0) pitch = 0;
      cost += Math.abs(o.toPeriod + o.fsOffset + Math.floor(pitch / 2) - fur[f]);
    }
    if (cost < bestCost || (cost === bestCost && Math.abs(st - o.guess) < Math.abs(best - o.guess))) { best = st; bestCost = cost; }
  }
  return [sign * best, bestCost];
}

function convert(m: FurnaceModule, subsong: number, dpcmCap: number, withCuts: boolean, withHeld: boolean, base: number, withLoop: boolean, noPhase: Set<number> = new Set(), stat?: PhaseStat, withPhaseArp = true): FamistudioSong {
  const lossy = new Lossy();
  const pitchLossy: PitchLossySpan[] = [];
  const s = m.subsongs[subsong];
  // Period offsets (fine pitch, vibrato, pitch macro, slides) are taken against the note table buildFamistudioRom
  // retunes to the song's A-4, so they use the same tuning (one_sided_love, A-4 = 445: offsets were 1 off at 440).
  const pulsePeriodRaw = (n: number): number => periodRawAt(n, m.tuning || 440);
  // PAL/Dendy songs round every period on their own clock's grid, then map to NTSC (see roundOnClock).
  const clock = furnaceNesClock(m), rnd = (raw: number): number => roundOnClock(raw, clock);
  const pulsePeriod = (n: number): number => Math.max(1, rnd(pulsePeriodRaw(n)) - 1);
  // Virtual tempo N/D advances the row counter N/D per engine tick: rows scale by D/N, effects and macros still run at hz.
  const vtScale = s.virtualTempo > 0 && s.virtualTempoD > 0 ? s.virtualTempoD / s.virtualTempo : 1;
  // Linear pitch (Furnace default): slides move in 1/128 semitone x pitchSlideSpeed per tick, not in period units.
  const linear = Number(m.compatFlags?.linearPitch ?? 2) !== 0;
  const properNoise = !!m.compatFlags?.properNoiseLayout;
  const slideUnit = Number(m.compatFlags?.pitchSlideSpeed ?? 4) || 4;
  if (!s) throw new Error(`subsong ${subsong} missing`);
  if (m.systems[0] !== NES_SYSTEM) throw new Error(`first chip is system ${m.systems[0]}, not NES 2A03`);
  const vrc6 = m.systems[1] === VRC6_SYSTEM; // mapper-24 board + FAMISTUDIO_EXP_VRC6 player (player-vrc6.nes)
  const NCH = vrc6 ? 8 : CHANNELS;
  for (const sys of m.systems.slice(vrc6 ? 2 : 1)) lossy.add(`expansion chip system ${sys} (channels dropped; 2A03 only so far)`);
  if (m.subsongs.length > 1) lossy.add('other subsongs (only one exported)');
  // Furnace speeds: the pattern advances one entry per row (playback.cpp curSpeed); 09xx sets entry 0 (or picks groove xx when the song has grooves), 0Fxx entry 1 when there are two and no grooves.
  const speeds = s.speedPattern?.length ? [...s.speedPattern] : s.speed2 !== s.speed1 ? [s.speed1, s.speed2] : [s.speed1];
  // FamiTracker tempo: frames per row = speed x 150 / tempo. Below the engine's 32 (slow tick rates such as 10 Hz),
  // multiply tempo and every speed by the same integer so frames per row stay exact.
  const macroRate = (s.hz > 0 ? s.hz : 60) / 60;
  const tempoBase = FT_TEMPO * (s.hz > 0 ? s.hz : 60) / 60 / vtScale;
  const cellAt = (ch: number, o: number, r: number): FurnacePatternCell | undefined => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];
  // Flow and speed effects (0B/0D/09/0F/FD/FE) are global in Furnace: they act from every channel, dropped expansion channels included.
  const rowFx = (o: number, r: number): Array<{ type: number; value: number }> => s.orders.flatMap((_, ch) => cellAt(ch, o, r)?.effects ?? []);

  // Order lengths (0B/0D in any channel ends the order) and the loop target (last 0B, else order 0).
  const orderLen: number[] = [];
  let loopOrder = 0, endOrder = s.ordersLen;
  for (let o = 0; o < endOrder; o++) {
    let len = s.patLen;
    for (let r = 0; r < s.patLen && len === s.patLen; r++) {
      for (const e of rowFx(o, r)) {
        if (e.type === 0x0d) len = r + 1;
        if (e.type === 0x0b) { len = r + 1; if (e.value <= o) { loopOrder = e.value; endOrder = o + 1; } }
      }
    }
    orderLen.push(len);
  }

  // Frame at which each row starts (speed effects in any channel apply to all; tick rate scales frames per tick).
  const rowFrame: number[][] = [], rowFrameT: number[][] = [], rowSpeed: number[][] = [];
  let songEndFrame = 0, songEndT = 0;
  {
    let f = 0, cur = 0;
    let sp = [...speeds];
    const grooves = m.grooves ?? [];
    const perTick = 60 / (s.hz > 0 ? s.hz : 60) * vtScale;
    for (let o = 0; o < endOrder; o++) {
      rowFrame.push([]); rowFrameT.push([]); rowSpeed.push([]);
      for (let r = 0; r < orderLen[o]; r++) {
        for (const e of rowFx(o, r)) {
          // playback.cpp 0x09/0x0f: with grooves, 09xx selects groove xx (a copy) and restarts it; 0Fxx sets entry 0.
          if (e.type === 0x09 && grooves.length) { if (e.value < grooves.length) { sp = grooves[e.value].val.slice(0, Math.max(1, grooves[e.value].len)); cur = 0; } }
          else if (e.type === 0x09 && e.value > 0) sp[0] = e.value;
          if (e.type === 0x0f && e.value > 0) sp[sp.length === 2 && !grooves.length ? 1 : 0] = e.value;
          if (e.type === 0xfd || e.type === 0xfe) lossy.add(`virtual tempo change ${e.type === 0xfd ? 'FD' : 'FE'}xx (ignored: rows keep the song start tempo)`);
        }
        rowFrame[o].push(Math.round(f)); rowFrameT[o].push(f);
        rowSpeed[o].push(sp[cur]);
        f += sp[cur] * perTick;
        cur = (cur + 1) % sp.length;
      }
    }
    songEndFrame = Math.round(f); songEndT = f;
  }
  // The engine adds a 8.8 step of 256 x tempo / 150 per frame and starts a row when the integer part reaches the speed.
  // A rounded step drifts a row by a frame every few hundred rows (virtual tempo 155/112: step 354.29), so speeds and
  // tempo are scaled by the smallest q that makes the step whole (speed bit 7 = paused: speed x q <= 127).
  const maxSpd = Math.max(1, ...rowSpeed.flat());
  const qMin = tempoBase < 32 ? Math.ceil(32 / tempoBase) : 1;
  const stepFits = (q: number): boolean => 256 * tempoBase * q / 150 < (256 - maxSpd * q) * 256;
  let spdMul = qMin;
  for (let q = qMin; q * maxSpd <= 127 && stepFits(q); q++) {
    const st = 256 * tempoBase * q / 150;
    if (Math.abs(st - Math.round(st)) < 1e-6) { spdMul = q; break; }
  }
  { const st = 256 * tempoBase * spdMul / 150; if (Math.abs(st - Math.round(st)) >= 1e-6) lossy.add(`virtual tempo ${s.virtualTempo}/${s.virtualTempoD}: FamiStudio tempo step not whole (rows drift)`); }
  // A groove ([2,1]) changes speed every row: one 0x46 op per row overflowed Future_Re-ference's FME-7 area. With tempo x2
  // (step 2.0 per frame) the accumulator's odd phase lets one speed byte play the groove (speed 3: rows 2,1,2,1), so a
  // speed op lands only where the byte must change. spdOut = byte per row on channel 0 (-1 = none); kept only when a
  // replay of the driver (acc >= speed -> new row, acc -= speed; acc += 2 per frame) matches every row on both passes.
  let spdOut: number[][] | null = null;
  if ((m.grooves ?? []).length && tempoBase === 150 && spdMul === 1) {
    const k = 2, out = rowSpeed.map((row) => row.map(() => -1));
    const rowLen = (sb: number, ph: number): number => Math.max(1, Math.ceil((sb - ph) / k));
    let sb = -1, ph = 0;
    for (let o = 0; o < endOrder; o++) for (let r = 0; r < rowSpeed[o].length; r++) {
      const len = rowSpeed[o][r], next = rowSpeed[o][r + 1] ?? rowSpeed[o + 1]?.[0];
      if (sb < 0 || (o === loopOrder && r === 0) || rowLen(sb, ph) !== len) {
        // Of the bytes that give this row's length, take one that also gives the next row's (fewer ops later).
        sb = ph + len * k;
        for (let c = ph + len * k; c > ph + (len - 1) * k; c--) if (next !== undefined && rowLen(c, ph + len * k - c) === next) { sb = c; break; }
        out[o][r] = sb;
      }
      ph += len * k - sb;
    }
    let ok = true; sb = -1; ph = 0;
    for (const o of [...Array(endOrder).keys(), ...Array(endOrder - loopOrder).keys()].map((x, i) => (i < endOrder ? x : x + loopOrder)))
      for (let r = 0; r < rowSpeed[o].length; r++) {
        if (out[o][r] >= 0) sb = out[o][r];
        if (sb > 127 || rowLen(sb, ph) !== rowSpeed[o][r]) ok = false;
        ph += rowLen(sb, ph) * k - sb;
      }
    if (ok) { spdOut = out; spdMul = k; }
  }

  // Instruments by first use; envelopes deduplicated by content.
  const insMap = new Map<number, number>();
  const insNo = (i: number): number => {
    if (!insMap.has(i)) { if (insMap.size >= MAX_INSTRUMENTS) { lossy.add('instruments past 64'); if (stat) stat.over = true; return 0; } insMap.set(i, insMap.size); }
    return insMap.get(i)!;
  };
  // Off 60 Hz a note's first tick spans one or two frames by where the note starts between frames (oby1 at 50 Hz:
  // arp/duty steps a frame early on some notes): each distinct resampled macro set gets its own instrument copy.
  const sigCache = new Map<string, string>(), phaseOf = new Map<string, number>();
  // Exact start phase per copy: 56 Hz ticks fall on exact half frames, which the 1/1000 key rounding moves across the tie.
  const phaseExact = new Map<number, number>();
  const keyPhase = (k: number): number => phaseExact.get(k) ?? 0;
  const MACROS = [[MACRO_VOL, 'vol'], [MACRO_ARP, 'arp'], [MACRO_DUTY, 'duty'], [MACRO_PITCH, 'pitch']] as const;
  const phaseKey = (key: number, fi: number, ph: number): number => {
    if (macroRate === 1) return key;
    if (stat) stat.uses.set(key, (stat.uses.get(key) ?? 0) + 1);
    if (noPhase.has(key)) return key;
    const phi = Math.round(ph * 1000);
    let sig = sigCache.get(`${fi}|${phi}`);
    if (sig === undefined) {
      const q = new Lossy();
      sig = MACROS.map(([code, kind]) => {
        const mac = m.instruments[fi]?.macros.find((x) => x.code === code && x.length > 0);
        if (!mac) return '';
        // A one-shot envelope holds its last value: trailing repeats of it sound the same at every phase.
        const f = macroFrames(mac, kind, q, undefined, macroRate, m.version, ph);
        if (f.loop < 0 && f.release < 0) while (f.vals.length > 1 && f.vals[f.vals.length - 1] === f.vals[f.vals.length - 2]) f.vals.pop();
        return JSON.stringify(f);
      }).join('|');
      sigCache.set(`${fi}|${phi}`, sig);
    }
    if (!phaseOf.has(`${key}|${sig}`)) phaseOf.set(`${key}|${sig}`, phi);
    const pk = key + KEY_PHASE * (501 + phaseOf.get(`${key}|${sig}`)!);
    if (!phaseExact.has(pk)) phaseExact.set(pk, ph);
    if (stat) stat.copies.set(key, (stat.copies.get(key) ?? new Set<number>()).add(pk));
    return pk;
  };
  // DPCM mappings (sample, pitch, loop, delta) by first use; note byte = 1 + index.
  const dpcmMap = new Map<string, number>();
  const dpcmList: Array<{ sample: number; pitch: number; delta: number }> = [];
  let lastDpcmPitch = 0;
  // nes.cpp:516-527: with dpcmMode=false Furnace streams non-NES-type samples as 7-bit PCM through $4011 until an NES-type note switches it to DPCM.
  let pcmMode = /dpcmMode=false/.test(m.chipFlags?.[0] ?? '');
  const dpcmNote = (ins: FurnaceInstrument | undefined, flat: number): number => {
    // Furnace DivInstrumentAmiga defaults to initSample 0 (instrument.h:607); nes.cpp:538-540 pitch = note & 15.
    let sample = ins?.amiga?.initSample ?? 0;
    let pitch = flat & 15;
    let delta = -1;
    if (ins?.amiga?.useNoteMap && ins.amiga.noteMap) {
      const e = ins.amiga.noteMap[flat + 60];
      if (e) sample = e.map;
    }
    // nes.cpp:529-534: with a note map the DPCM rate and delta come from the NE feature (dpcmFreq/dpcmDelta), not the Amiga freq;
    // out of 0..15 keeps the previous rate (lastDPCMFreq).
    const nm = ins?.fm?.nes?.dpcmNoteMap ? ins.fm.nes.dpcmMap?.[flat + 60] : undefined;
    if (nm) {
      if (nm.freq >= 0 && nm.freq <= 15) lastDpcmPitch = nm.freq;
      pitch = lastDpcmPitch;
      if (nm.delta >= 0 && nm.delta <= 63) delta = nm.delta;
    }
    if (sample < 0 || !m.samples[sample]) { lossy.add('DPCM note without a sample'); return -1; }
    if (!ins || ins.type === 34) pcmMode = false;
    else if (pcmMode) lossy.add('DPCM channel in Furnace PCM mode ($4011 stream) played as 1-bit DPCM');
    // nes.cpp:425-456: a non-NES-type (Amiga/sample) instrument writes calcDPCMRate(min(sample rate at the note, 48000)) to $4010.
    if (ins && ins.type !== 34) {
      const hz = Math.min(48000, (m.samples[sample].c4Rate || 0) * 2 ** ((flat - 48) / 12));
      const T = [4450, 5000, 5400, 5900, 6650, 7450, 8100, 8800, 10200, 11700, 13300, 15900, 18900, 23500, 29000];
      const b = T.findIndex((t) => hz < t);
      pitch = b < 0 ? 15 : b;
    }
    const key = `${sample}_${pitch}_${delta}`;
    if (!dpcmMap.has(key)) {
      if (dpcmList.length >= 63) { lossy.add('DPCM mappings past 63'); return -1; }
      dpcmMap.set(key, dpcmList.length); dpcmList.push({ sample, pitch, delta });
    }
    return 1 + dpcmMap.get(key)!;
  };

  // Envelope registry (shared by instruments and effect envelopes); streams patch addresses in via envFixups.
  const envKey = new Map<string, number>();
  const envs: number[][] = [];
  const envId = (bytes: number[]): number => {
    const k = bytes.join(',');
    if (!envKey.has(k)) { envKey.set(k, envs.length); envs.push(bytes); }
    return envKey.get(k)!;
  };
  const envFixups: Array<Array<[number, number]>> = [];
  const perTick = 60 / (s.hz > 0 ? s.hz : 60);
  const perFrame = 1 / perTick;

  // Channel streams. Fixups: [offset in stream, target offset in same stream].
  const streams: number[][] = [];
  const fixups: Array<Array<[number, number]>> = [];
  const channelsWithNotes: boolean[] = [];
  const firstNotes: number[] = [];
  const firstNoteFrames: number[] = [];
  const speedFx = new Set([0x09, 0x0f]);
  // forceVol: the channel is converted again with the volume cache unknown at the loop target (see the loop-row check).
  let forceVol = false;
  for (let ch = 0; ch < NCH; ch++) {
    const chMark = { envs: envs.length, ins: insMap.size, pl: pitchLossy.length, lossy: lossy.save() };
    const out: number[] = [];
    const fx: Array<[number, number]> = [];
    // 2A03 hardware volume state (nes.cpp): 15xx envMode, 16xx length index, volume column = envelope period in envelope modes.
    let envMode = 3, lenIdx = 0x1f, furVol = 15, hwVol = false, baked = false, lastSpd = -1;
    let bake: { vol: number; vals: number[]; held: boolean; loop: number; release: number; frame: number } | null = null; // the baked note's channel volume and volume macro frames
    let slideOps: number[] = [];
    let slVol = ch === 7 ? 63 : 15, slStep = 0, slFrame = 0; // Furnace channel volume under a running 0Axy (volume units), its step per tick
    let loopSlide = ''; // running 0Axy as the first pass enters the loop target
    let lastIns = -1, lastVol = -1, empty = 0, hasNotes = false, first = -1, firstFrame = -1;
    let curIns: FurnaceInstrument | undefined;
    // Furnace duty is channel state a duty macro writes (nes.cpp chan.duty); FamiStudio's 0x4f value (famistudio_duty_cycle) is what a note of a duty-macro-less instrument plays.
    let furDuty = 0, fsDuty = 0, dutyMac: { vals: number[]; loop: number; t: number } | null = null;
    let vibPos = 0, vibFrame = 0; // Furnace's vibratoPos (64-step sine) at the row start
    let curInsIdx = -1, curNote = 0, vibXY = 0, vibOn = -1, slideEnv = -1, envCarry = 0, arpXY = 0, arpOn = -1, keyOff = false, noteArp: number[] | null = null, insArp: { vals: number[]; loop: number } | null = null, fineRaw = 128, fineSent = 0;
    // Furnace 01xx/02xx is channel state (playback.cpp portaSpeed): it keeps sliding every new note until x00, another
    // slide effect, or the slide reaching its target (note 0 / 179, targetResetsSlides).
    let heldSlide: [number, number] | null = null;
    const efx: Array<[number, number]> = [];
    const tonal = ch < 3 || ch === 5 || ch === 6; // VRC6 pulses share the 2A03 pulse period (divider 16); the saw (14) keeps no vibrato or slides
    const seq: Array<{ cell?: FurnacePatternCell; frame: number; t: number }> = [];
    for (let o = 0; o < endOrder; o++) for (let r = 0; r < orderLen[o]; r++) seq.push({ cell: cellAt(ch, o, r), frame: rowFrame[o][r], t: rowFrameT[o][r] });
    // The loop pass (orders loopOrder..end again, after the song end): rows played with the end-of-song state.
    const n1 = seq.length, loopRi = orderLen.slice(0, loopOrder).reduce((a, b) => a + b, 0);
    for (let o = loopOrder; o < endOrder; o++) for (let r = 0; r < orderLen[o]; r++) seq.push({ cell: cellAt(ch, o, r), frame: rowFrame[o][r] + songEndFrame - rowFrame[loopOrder][0], t: rowFrameT[o][r] + songEndT - rowFrameT[loopOrder][0] });
    /** End of the pass row i belongs to: look-aheads stop there, as the first pass always did. */
    const lim = (i: number): number => (i < n1 ? n1 : seq.length);
    /** Frames until the next note or slide effect on this channel (how long a slide runs). */
    const span = (i: number): number => {
      for (let j = i + 1; j < lim(i); j++) {
        const c = seq[j].cell;
        if (c && (convertFurnaceNoteValue(c) >= 0 || c.effects.some((e) => SLIDE_FX.has(e.type)))) return Math.min(240, seq[j].frame - seq[i].frame);
      }
      return 240;
    };
    /** Frames until the next row that rebuilds the vibrato envelope (a note or a 04xy other than `xy`), capped at 240. */
    const vibSpan = (i: number, xy: number): number => {
      for (let j = i + 1; j < lim(i); j++) {
        const c = seq[j].cell;
        if (c && (convertFurnaceNoteValue(c) >= 0 || c.effects.some((e) => e.type === 0x04 && Math.max(0, e.value) !== xy))) return Math.min(240, seq[j].frame - seq[i].frame);
      }
      return 240;
    };
    const ev: number[] = []; // stream length after each event (note byte, wait byte, slide): the reference boundaries
    const flush = (): void => { if (empty > 0) { out.push(0x81 | ((empty - 1) << 1)); empty = 0; ev.push(out.length); } };
    /** Whether state left after row i is read again in its pass: the first later row that `kills` it (overwrites it before
     *  any read) or `uses` it decides; the pass end counts as a read (the loop replays it). */
    const liveAfter = (i: number, use: (c: FurnacePatternCell) => boolean, kill: (c: FurnacePatternCell) => boolean): boolean => {
      for (let j = i + 1; j < lim(i); j++) { const c = seq[j].cell; if (c && kill(c)) return false; if (c && use(c)) return true; }
      return true;
    };
    const hasFx = (c: FurnacePatternCell, ...t: number[]): boolean => c.effects.some((e) => t.includes(e.type));
    const isNote = (c: FurnacePatternCell): boolean => { const v = convertFurnaceNoteValue(c); return v >= 0 && v < 253; };
    // The state after a row that can change later bytes or the driver's state (frames relative to the current row): two
    // rows with equal bytes and equal snapshots convert the rest of the pass alike. A field enters only while a later row
    // can read it; slFrame is the row frame after every row (relative 0), and first/hasNotes do not reach the stream.
    const snap = (): string => {
      const notePorta = (c: FurnacePatternCell): boolean => isNote(c) && hasFx(c, 0x03);
      // curNote: the slide/fine/vibrato source on rows without a note, and the 03xx porta start; a plain note replaces it.
      const noteLive = tonal && liveAfter(ri, (c) => notePorta(c) || (!isNote(c) && hasFx(c, 0x00, 0x04, 0xe5, ...SLIDE_FX)), (c) => isNote(c) && !notePorta(c));
      // curIns: read by notes and by 00xy/04xy rebuilds (pitch macro); an instrument column replaces it first.
      const insLive = liveAfter(ri, (c) => isNote(c) || hasFx(c, 0x00, 0x04), (c) => c.instrument >= 0);
      // vibratoPos: read by every vibrato rebuild; a note zeroes it (not under continuousVibrato or a keyed-on 03xx).
      const vibLive = tonal && liveAfter(ri, (c) => notePorta(c) || hasFx(c, 0x00, 0x04) || (isNote(c) && !!m.compatFlags?.continuousVibrato), (c) => isNote(c) && !notePorta(c) && !m.compatFlags?.continuousVibrato);
      // keyOff: a later note clears a running 00xy after a note off; a note off sets it again, a note with no arp running clears it.
      const offLive = noteLive || liveAfter(ri, (c) => (hasFx(c, 0x00) && !isNote(c)) || (isNote(c) && arpXY !== 0), (c) => { const v = convertFurnaceNoteValue(c); return v === 253 || v === 254 || (isNote(c) && arpXY === 0); });
      // slVol: the 0Axy slide's start volume; a volume column replaces it first.
      const slLive = slideOps.length > 0 || liveAfter(ri, (c) => hasFx(c, 0x0a), (c) => c.volume >= 0);
      // furVol: read by notes (instrument key, bake, volume byte); a volume column replaces it first.
      const furLive = liveAfter(ri, isNote, (c) => c.volume >= 0);
      // bake/baked: read by a volume column on a row with no note; a note re-bakes first.
      const bakeLive = liveAfter(ri, (c) => c.volume >= 0, (c) => isNote(c));
      return JSON.stringify([envMode, lenIdx, furLive ? furVol : null, hwVol, ch === 0 && !spdOut ? lastSpd : null,
        !bakeLive ? null : !hwVol && baked && bake ? [bake.vol, bake.vals, bake.held, Math.min(seq[ri].frame - bake.frame, bake.vals.length - 1)] : !hwVol && baked,
        slideOps, slLive ? slVol : null, slideOps.length ? slStep : null, lastIns, lastVol, empty,
        vibLive ? [vibPos, (vibXY & 15) > 0 ? seq[ri].frame - vibFrame : 0] : null, insLive ? curInsIdx : null, noteLive ? curNote : null,
        // slideEnv / envCarry stay out of this state: with them in, turtle_byte pulse2 instrument-9 arpeggios played a frame off (637, 9231).
        vibXY, vibOn, arpXY, arpOn, offLive ? keyOff : null, noteArp, fineRaw, fineSent, heldSlide]);
    };
    // Song loop: Furnace keeps the end-of-song state (fine pitch, arp, vibrato, slides, volume) at the loop target, while
    // the stream's 0x42 jump replays first-pass bytes. Each channel converts the loop pass with the end-of-song state;
    // from the first row X of a run of rows whose bytes equal the first pass's, up to a row whose state after it equals
    // the first pass's too (or the song end), the copy is dropped and the loop jumps to the first pass's row X.
    const pass1: Array<{ at: number; sig: string; post: string }> = [];
    type Mark = { at: number; ev: number; efx: number; pl: number; envs: number; ins: number; lossy: Map<string, number> };
    let ri = 0, loopTarget = -1, loopPassAt = 0, p1Vol = -1, retry = false, run: (Mark & { to: number }) | null = null;
    const converge = (mk: Mark & { to: number }): void => {
      out.length = mk.at; ev.length = mk.ev; efx.length = mk.efx; pitchLossy.length = mk.pl; empty = 0;
      for (const [k, id] of envKey) if (id >= mk.envs) envKey.delete(k);
      envs.length = mk.envs;
      for (const [k, id] of insMap) if (id >= mk.ins) insMap.delete(k);
      lossy.restore(mk.lossy);
      loopTarget = mk.to;
    };
    passes: for (let p = 0; p < (withLoop ? 2 * endOrder - loopOrder : endOrder); p++) {
      const pass2 = p >= endOrder, o = pass2 ? p - endOrder + loopOrder : p;
      // The loop target is entered with the end-of-song instrument, not the first pass's: send the instrument again.
      if (o === loopOrder) {
        // shortcut: a 0Axy running at the loop target on one pass only stays lossy (the loop pass does not compare it).
        if (pass2 && slideOps.join() !== loopSlide) lossy.add('volume slide 0Axy running on one pass of the loop target only');
        flush(); if (pass2 || !withLoop) loopPassAt = out.length; if (!pass2) loopSlide = slideOps.join(); lastIns = -1;
        // The driver enters the loop target from the song start and from the song end. When the volume caches differ
        // there, both passes restart from LAST_VOL_UNKNOWN (the next note or volume column sends 0x70), so they converge.
        if (!pass2) p1Vol = lastVol;
        else if (!forceVol && lastVol !== p1Vol) { retry = true; break passes; }
        if (forceVol) lastVol = LAST_VOL_UNKNOWN;
      }
      for (let r = 0; r < orderLen[o]; r++, ri++) {
        const q = pass2 ? pass1[ri - n1 + loopRi] : null;
        if (q && q.at >= 0) {
          flush(); // a first-pass row on an event boundary can be jumped to: start the loop-pass copy on one too
          run ??= { at: out.length, ev: ev.length, efx: efx.length, pl: pitchLossy.length, envs: envs.length, ins: insMap.size, lossy: lossy.save(), to: q.at };
        }
        const startEmpty = empty, startAt = out.length, startEfx = efx.length;
        const cell = cellAt(ch, o, r);
        const ops: Array<number | { env: number }> = [];
        const insOps: number[] = [];
        const tail: Array<number | { env: number }> = [];
        let delay = 0, noAttack = false, envTo = 0, slide: number[] | null = null, rowByte: number[] | null = null;
        if (ch === 7 && o === 0 && r === 0) ops.push(0x55, 1); // saw volume shift: full (x4), so 0-15 spans the saw's 0-60
        if (ch === 0) {
          const sb = spdOut ? spdOut[o][r] : rowSpeed[o][r] !== lastSpd || (o === loopOrder && r === 0) ? rowSpeed[o][r] * spdMul : -1;
          if (sb >= 0) { ops.push(0x46, Math.min(255, sb)); lastSpd = rowSpeed[o][r]; }
        }
        // Furnace stops a running 0Axy once the volume passes its maximum or drops below 0 (playback.cpp, unless noVolSlideReset).
        if (slideOps.length && slVol >= 0) {
          slVol += slStep * (seq[ri].frame - slFrame) / perTick;
          if ((slVol >= (ch === 7 ? 64 : 16) || slVol < 0) && !m.compatFlags?.noVolSlideReset) slideOps = [];
        }
        slFrame = seq[ri].frame;
        if (cell) {
          if (cell.instrument >= 0) { curIns = m.instruments[cell.instrument]; curInsIdx = cell.instrument; }
          // Furnace steps vibratoPos by the rate each tick (a new note zeroes it unless continuousVibrato) while the depth is above 0; the elapsed ticks run with the previous 04xy.
          if ((vibXY & 15) > 0) vibPos = (vibPos + (vibXY >> 4) * Math.round((seq[ri].frame - vibFrame) / perTick)) & 63;
          vibFrame = seq[ri].frame;
          // The loop target is entered again with the end-of-song state: its effects are sent there even when they match the first pass.
          const atLoop = o === loopOrder && r === 0;
          if (atLoop) { fineSent = NaN; vibOn = -2; arpOn = -2; fsDuty = -1; } // -2 / -1: override state unknown, sent either way (the loop pass enters with the duty the song end left)
          let fxChanged = false, fineHere = false, slideFx = 0, slideVal = 0, volSlide = -1, cutTicks = 0;
          for (const e of cell.effects) {
            if (e.type < 0) continue;
            const t = e.type, v = Math.max(0, e.value); // an effect with no value byte plays as xx = 00 (Furnace playback.cpp)
            if (speedFx.has(t)) continue; // speed rows are written per row on channel 0 from rowSpeed
            else if ((t === 0x15 || t === 0x16) && ch < DPCM_CH && ch !== 2) { if (t === 0x15) envMode = v & 3; else lenIdx = v & 0x1f; }
            else if (t === 0x12 && ch < DPCM_CH && ch !== 2) { ops.push(0x4f, v & 3); furDuty = fsDuty = v & 3; dutyMac = null; }
            else if (t === 0x0b || t === 0x0d || t === 0xfd || t === 0xfe) continue; // global, handled (or reported) in the row scans
            else if (t === 0x00 && ch !== DPCM_CH) { if (v !== arpXY || atLoop) fxChanged = true; arpXY = v; }
            else if (t === 0x04 && tonal) { if (v !== vibXY || atLoop) fxChanged = true; vibXY = v; }
            else if (SLIDE_FX.has(t) && tonal) { slideFx = t; slideVal = v; }
            else if (t === 0xe5 && tonal) { fineRaw = v; fineHere = true; }
            else if (t === 0x0a && ch !== DPCM_CH && ch !== 2) volSlide = v;
            else if (t === 0xec && ch !== DPCM_CH) cutTicks = v;
            else if (t === 0xed && ch !== DPCM_CH) delay = v;
            else if (t === 0x12 && (ch === 5 || ch === 6)) ops.push(0x4f, v & 7); // VRC6 duty 0-7
            else lossy.add(`effect ${t.toString(16).toUpperCase().padStart(2, '0')}${ch === DPCM_CH ? ' on DPCM' : ch === NOISE_CH ? ' on noise' : ''}`);
          }
          const nv = convertFurnaceNoteValue(cell);
          let n = 0;
          // Furnace clears a running 00xy arp when a note follows a note off or release (playback.cpp: keyOffAffectsArp is
          // true for NES and VRC6); a 00xy on the note's own row is applied after that and wins.
          const keyOnBefore = !keyOff && curNote > 0; // Furnace chan.keyOn before this row (note off / release clear it)
          if (nv === 253 || nv === 254) keyOff = true;
          else if (nv >= 0 && ch !== DPCM_CH) {
            if (keyOff && arpXY !== 0 && !cell.effects.some((e) => e.type === 0x00)) { arpXY = 0; fxChanged = true; }
            keyOff = false;
          }
          if (nv === 253) rowByte = [0x00];
          else if (nv === 254 || nv === 255) rowByte = ch === DPCM_CH ? [0x00] : [0x45];
          else if (nv >= 0) {
            hasNotes = true;
            if (first < 0) { first = nv; firstFrame = seq[ri].frame; }
            if (ch === DPCM_CH) {
              const b = dpcmNote(curIns, nv);
              rowByte = b > 0 ? [b] : null;
            } else {
              n = ch === NOISE_CH ? noiseNote(nv, properNoise) : nv - NOTE_OFFSET;
              if (n < 1 || n > 96) { lossy.add('note outside FamiStudio range C-1..B-8 (clamped)'); n = Math.max(1, Math.min(96, n)); }
              rowByte = n >= 13 && n <= 75 ? [n - 12] : [0x40, n];
            }
          }
          if (slideFx) heldSlide = (slideFx === 0x01 || slideFx === 0x02) && slideVal > 0 ? [slideFx, slideVal] : null;
          else if (n > 0 && heldSlide && withHeld) [slideFx, slideVal] = heldSlide;
          const src = n > 0 ? n : curNote;
          // Fine pitch (E5xx, 80 = centre): Furnace chan.pitch = xx - 0x80, in 1/128 semitone with linear pitch (calcFreq:
          // round(period at base + pitch) - 1), else raw period units subtracted; sent as the period offset from the note's table entry.
          if (tonal && (fineHere || (n > 0 && fineRaw !== 128))) {
            const fp = fineRaw - 128, sn = src || 46;
            const fine = clamp8(linear ? rnd(pulsePeriodRaw(sn) * 2 ** (-fp / 1536)) - 1 - pulsePeriod(sn) : -fp);
            if (fine !== fineSent) { ops.push(0x4e, fine & 0xff); fineSent = fine; }
          }
          // Arpeggio: effect 00xy wins; else a per-note override of the instrument arp macro when FamiStudio's relative
          // steps would not land on Furnace's note: fixed-note steps (pinned to the flat note value), and every noise arp
          // (Furnace's noise period comes from noiseNote, not from note & 15 alone).
          if (n > 0 && ch !== DPCM_CH) {
            const arpMac = curIns?.macros.find((x) => x.code === MACRO_ARP && x.length > 0);
            const fixed = !!arpMac && arpMac.data.slice(0, arpMac.length).some(arpIsFixed);
            const target = (v: number): number => (arpIsFixed(v) ? arpFixedNote(v) : nv + v);
            // The driver indexes its 97-entry note table with note + arp unchecked (famistudio_ca65.s "apply arpeggio"):
            // a step past C-1..B-8 reads the MSB table or beyond and plays a garbage high period, so such notes get an
            // override clamped to the table (entries below A-1 hold 2047, Furnace's saturated period).
            const inTable = (v: number): number => Math.max(1, Math.min(96, n + target(v) - nv)) - n;
            const outside = !!arpMac && ch !== NOISE_CH && arpMac.data.slice(0, arpMac.length).some((v) => inTable(v) !== target(v) - nv);
            if (outside && arpMac.data.slice(0, arpMac.length).some((v) => n + target(v) - nv > 96)) lossy.add('arp step above B-8 (clamped)');
            // The override restarts at the note's attack, so it is resampled at the note's own sub-frame phase (like insArp below).
            const arpPh = seq[ri].t + delay * perTick - seq[ri].frame - Math.round(delay * perTick);
            // The instrument's own arp envelope is resampled at phase 0: a note starting off the frame grid (50 Hz song, ph != 0)
            // shows other ticks per frame, so it gets the override too (turtle_byte triangle kick, ph 0.2: hold at frames 1-2, not 2-3).
            // An instrument that kept its start-phase copies (phaseKey) already plays this note's phase; only one dropped to its
            // phase-0 copy (64-instrument cap) needs the per-note override, which costs stream bytes and splits shared rows.
            const phaseDiffers = !!arpMac && ch === 2 && macroRate !== 1 && arpPh !== 0 && withPhaseArp && noPhase.has(curInsIdx >= 0 ? curInsIdx : 0)
              && JSON.stringify(macroFrames(arpMac, 'arp', new Lossy(), inTable, macroRate, m.version, 0))
                !== JSON.stringify(macroFrames(arpMac, 'arp', new Lossy(), inTable, macroRate, m.version, arpPh));
            noteArp = !arpMac || (!fixed && !outside && ch !== NOISE_CH && !phaseDiffers) ? null
              : macroEnvelope(arpMac, 'arp', lossy, ch === NOISE_CH ? (v) => noiseNote(target(v), properNoise) - n : inTable, macroRate, m.version, arpPh);
            // The steps the driver plays: the override above (phase 0), else the instrument copy at this note's start phase.
            insArp = arpMac && tonal ? macroFrames(arpMac, 'arp', new Lossy(), inTable, macroRate, m.version, noteArp ? 0 : arpPh) : null;
          }
          // 00xy arp frames. Frame-exact: frame f plays step floor(f * ticksPerFrame) % 3, looped over the shortest frame count
          // that holds a whole number of 3-tick cycles (45 frames at 56 Hz); a rounded per-tick frame count drifts a step per cycle.
          const arp00 = (): number[] => {
            const steps = [0, arpXY >> 4, arpXY & 15];
            let len = 3 * Math.max(1, Math.round(perTick));
            for (let L = 1; L <= 240; L++) if (Math.abs(((L * macroRate) / 3) - Math.round((L * macroRate) / 3)) < 1e-6) { len = L; break; }
            return Array.from({ length: len }, (_, f) => steps[tickAtFrame(f, macroRate) % 3]);
          };
          // Vibrato (04xy): looping absolute pitch envelope, a sine over 64/x ticks. Depth y is y/16 semitone in linear
          // pitch (measured with furnace -vgmout), so the amplitude in period units follows the playing note.
          // Without vibrato, a linear-pitch instrument pitch macro (value v = v/128 semitone up) goes through the same
          // override, scaled to the note: FamiStudio pitch envelopes add period units (positive = lower), note-independent.
          // Furnace zeroes vibratoPos only when the note is committed (playback.cpp "commit note on"); a 03xx (xx > 0) on a
          // keyed-on channel clears doNote ("if (chan[i].keyOn) chan[i].doNote=false"), so a porta target keeps the phase.
          // The driver agrees: a 0x43 no-attack note leaves the pitch envelope running (only an attack or 0x49 restarts it).
          if (n > 0 && !m.compatFlags?.continuousVibrato && !(keyOnBefore && slideFx === 0x03 && slideVal > 0)) vibPos = 0;
          if (tonal && (fxChanged || n > 0)) {
            // Speed is exact (a snapped speed changes the vibrato rate audibly); identical rounded envelopes share one id.
            const x = vibXY >> 4, y = vibXY & 15;
            let pid = -1, vib: number[] | null = null, vibLen1 = 0;
            if (x > 0 && y > 0) {
              // Furnace steps a 64-entry sine x per tick and has stepped once on the note tick: loop the whole cycle set
              // (64/gcd(x,64) ticks) so a rate like 64/6 does not drift.
              const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
              // Off 60 Hz a cycle is not whole frames (Famitune1 56 Hz: 32 ticks = 34.29 frames; looped at 34 the phase slipped
              // 0.29 frame per loop). Each step is exact from the row's time, so unroll whole cycles up to the next rebuild (note
              // or 04xy): the loop point is never reached. Past 240 frames take the k (k * cycle <= 240) that slips least per frame.
              // Unrolling only as far as the note holds keeps short notes at one cycle (a blanket 240-frame unroll passed the song-data cap).
              const cyc = 64 / gcd(x, 64) * perTick, D = vibSpan(ri, vibXY);
              let k = Math.max(1, Math.ceil(D / cyc - 1e-6));
              if (k * cyc > 240 + 1e-6) {
                const slip = (j: number): number => Math.abs(j * cyc - Math.round(j * cyc)) / (j * cyc);
                k = 1;
                for (let j = 2; j * cyc <= 240 + 1e-6; j++) if (slip(j) < slip(k) - 1e-12) k = j;
              }
              const len = Math.max(2, Math.min(240, Math.round(k * cyc)));
              const len1 = Math.max(2, Math.min(240, Math.round(cyc)));
              const amp = linear ? pulsePeriod(src || 46) * (2 ** ((vibXY & 15) / 192) - 1) : y;
              // Linear pitch: Furnace offsets the pitch by (round(127 sin) * depth) >> 4 in 1/128 semitone and rounds the
              // unrounded period (measured on Sky Sanctuary: a depth-1 vibrato dips a period only above ~2 units), so offsets
              // are taken against the fractional base period, not the table's rounded one.
              const P = pulsePeriod(src || 46), X = pulsePeriodRaw(src || 46);
              // Furnace adds fine pitch (E5xx) and vibrato in 1/128 semitone and rounds once; the engine adds the sent fine
              // offset F to each step, so a step is taken at fine + vibrato minus F (rounding both apart was 1 off, one_sided_love).
              const fp = fineRaw - 128, F = rnd(X * 2 ** (-fp / 1536)) - 1 - P;
              // Step i shows the Furnace tick its 60 Hz frame holds, counted from the row's exact time (as the macros do):
              // floor(i / perTick) ignored a 56 Hz row firing up to half a frame off its tick and ran a frame late (Famitune1).
              const rowPh = seq[ri].t - seq[ri].frame;
              vib = Array.from({ length: len }, (_, i) => {
                const phase = vibPos + x * (tickAtFrame(i, macroRate, rowPh) + 1);
                if (!linear) return Math.round(-amp * Math.sin(2 * Math.PI * phase / 64));
                // Furnace: vibTable = (short)(127 sin) truncates; pitch = ((depth * vibTable * vibratoFine(15)) >> 4) / 15, C division truncates.
                const u = Math.trunc(((y * Math.trunc(127 * Math.sin(2 * Math.PI * (phase & 63) / 64)) * 15) >> 4) / 15);
                return rnd(X * 2 ** (-(u + fp) / 1536)) - 1 - P - F;
              });
              vibLen1 = len1;
              pid = envId(encodeEnvelope(vib, 0, -1, 'pitch'));
            }
            if (linear) {
              const pm = curIns?.macros.find((mc) => mc.code === MACRO_PITCH && mc.length > 0);
              if (pm) {
                const P = pulsePeriod(src || 46), X = pulsePeriodRaw(src || 46), fp = fineRaw - 128;
                // Furnace adds fine pitch (E5xx) and the macro in 1/128 semitone and rounds once; the engine adds the sent fine
                // offset F, so an absolute value is taken at fine + v minus F (rounding both apart was 1 off). Without fine pitch
                // the note-period scaling stays as it was.
                const F = rnd(X * 2 ** (-fp / 1536)) - 1 - P;
                const off = (v: number): number => (fp ? rnd(X * 2 ** (-(v + fp) / 1536)) - 1 - P - F : Math.round(P * (2 ** (-v / 1536) - 1)));
                const rel = (pm.mode & 1) === 1;
                // A relative macro: Furnace keeps the running sum in pitch2 and rounds fine + sum once, so each step is
                // off(sum) - off(previous sum) (macroFrames maps the frames in order). With or without fine pitch: a constant
                // per-step period offset is period-linear, Furnace's sum is pitch-linear (turtle_byte triangle kick 221 -> 635
                // played 220 -> 353).
                // shortcut: a looped relative macro repeats its first-pass deltas (the sum keeps growing in Furnace), rounding per
                // step without fine pitch; unroll the loop if a song shows audible drift.
                let relSum = 0;
                const relStep = (v: number): number => { const d = off(relSum + v) - off(relSum); relSum += v; return d; };
                const toPeriod = (v: number): number => { const d = rel ? relStep(v) : off(v); if (Math.abs(d) > 63) lossy.add('pitch macro step past 63 period units (clamped)'); return d; };
                // An ADSR/LFO pitch macro in absolute mode is a position curve: FamiStudio's +-63 range only holds per-frame
                // steps, so send the differences of the period offsets as a relative envelope.
                const ex = expandProcMacro(pm, m.version);
                const mf = ex !== pm && (pm.mode & 1) === 0
                  ? macroFrames({ ...ex, mode: 0 }, 'pitch', lossy, off, 1, m.version)
                  : macroFrames(pm, 'pitch', lossy, vib && !rel ? off : vib ? (v) => Math.round(P * (2 ** (-v / 1536) - 1)) : toPeriod, macroRate, m.version);
                // A looped relative macro whose loop moves the pitch (a falling kick): Furnace sums it per tick and rounds the
                // period of the sum, so the steps grow (pitch-linear). Unroll it: frame f sends off(sum at the tick that frame
                // shows) - off(sum one frame before), until the period leaves the 11-bit range (240 frames at most). Repeating
                // the first-pass deltas played turtle_byte's triangle kick 221 -> 635 as 220 -> 508 (frames 144-156).
                const tk = rel && !vib ? macroFrames(pm, 'pitch', lossy, undefined, 1, m.version) : null;
                const loopSum = tk && tk.loop >= 0 ? tk.vals.slice(tk.loop).reduce((x, y) => x + y, 0) : 0;
                if (tk && loopSum !== 0) {
                  const at = (i: number): number => tk.vals[i < tk.vals.length ? i : tk.loop + ((i - tk.loop) % (tk.vals.length - tk.loop))];
                  const rowPh = seq[ri].t - seq[ri].frame, deltas: number[] = [];
                  let sum = 0, tick = -1, prev = 0;
                  for (let f = 0; f < 240; f++) {
                    for (const k = tickAtFrame(f, macroRate, rowPh); tick < k;) sum += at(++tick);
                    const o = off(sum);
                    if (P + o > 2047 || P + o < 0) break;
                    if (Math.abs(o - prev) > 63) lossy.add('pitch macro step past 63 period units (clamped)');
                    deltas.push(o - prev); prev = o;
                  }
                  pid = envId(encodeEnvelope(deltas.length ? deltas : [0], -1, -1, 'pitch', true));
                } else if (vib || (!mf.relative && ex !== pm)) {
                  // Vibrato on top, or an ADSR/LFO position curve (+-63 only holds per-frame steps): one relative envelope.
                  const mg = mergeVibratoPitch(vib ?? [0], mf, lossy, vib?.slice(0, vibLen1));
                  const lt = !vib && ex !== pm && (mg.loop < 0 || mg.loop >= mg.deltas.length - 1) ? loopPeriodicTail(mg.deltas) : mg;
                  pid = envId(encodeEnvelope(lt.deltas, lt.loop, -1, 'pitch', true));
                } else pid = envId(encodeEnvelope(mf.vals, mf.loop, -1, 'pitch', mf.relative));
              }
            }
            // Fine pitch under an arpeggio: Furnace applies E5xx as 1/128 semitone to the note each arp step gives (calcFreq
            // linear), the engine adds one period offset F taken at the base note. Without vibrato or a pitch macro the
            // per-step difference goes into a pitch envelope stepping with the arp envelope (same frames and loop; both
            // restart on the note attack, and a 00xy change restarts both with 0x4b + 0x49).
            // shortcut: under vibrato or a pitch macro the arp steps keep the base note's offset (needs one merged envelope).
            const fp = fineRaw - 128;
            const arpSteps = pid < 0 && linear && fp ? (arpXY !== 0 ? { vals: arp00(), loop: 0 } : n > 0 ? insArp : null) : null;
            if (arpSteps && arpSteps.vals.some((v) => v !== 0)) {
              const sn = src || 46, fineAt = (k: number): number => rnd(pulsePeriodRaw(k) * 2 ** (-fp / 1536)) - 1 - pulsePeriod(k);
              const F = fineAt(sn), d = arpSteps.vals.map((v) => fineAt(Math.max(1, Math.min(96, sn + v))) - F);
              if (d.some((v) => v !== 0)) pid = envId(encodeEnvelope(d, arpSteps.loop, -1, 'pitch'));
            }
            // An override persists across notes and instrument changes in the engine: send it only when it changes.
            if (pid >= 0) { if (vibOn !== pid) ops.push(0x49, { env: pid }); vibOn = pid; }
            else if (vibOn !== -1) { ops.push(0x4a); vibOn = -1; lastIns = -1; }
          }
          if (ch !== DPCM_CH && (fxChanged || n > 0)) {
            const env = arpXY !== 0 ? encodeEnvelope(arp00(), 0, -1, 'arp') : noteArp;
            if (env) { const id = envId(env); if (arpOn !== id) ops.push(0x4b, { env: id }); arpOn = id; }
            else if (arpOn !== -1) { ops.push(0x4c); arpOn = -1; lastIns = -1; }
          }
          // A cut at or after the end of its row never fires; skip it (saves 2 bytes per row against the 16 KiB cap).
          if (withCuts && cutTicks > 0 && ri + 1 < lim(ri) && cutTicks * perTick < seq[ri + 1].frame - seq[ri].frame) ops.push(0x48, Math.min(255, Math.round(cutTicks * perTick)));
          if (cell.volume >= 0) {
            if (ch === DPCM_CH) lossy.add('volume column on DPCM');
            else { slVol = cell.volume; furVol = Math.min(15, ch === 7 ? Math.round(cell.volume / 4) : cell.volume); /* VRC6 saw volume is 0-63 */ if (!hwVol && baked && n === 0 && bake) {
              // The envelope holds bake x macro; Furnace now plays v x macro. Send the FamiStudio channel volume c (table =
              // floor(c * e / 15)) with the least error over the macro frames still to play (after a finished macro: v x L only,
              // L = its last value). Matching L alone while the macro runs silenced a decay to 0 (Future_Re-ference pulse 2).
              // Past the loop start the envelope cycles [loop, release) (a Furnace release step is held there until note release):
              // Future_Re-ference pulse 1 row 4, frame 6 of [15 12 11 10 | 1 3 2] release 3 plays 10, not 2.
              // shortcut: assumes no note-off since the bake, upgrade if a released note takes a volume row.
              const at = seq[ri].frame - bake.frame, vals = bake.vals.length ? bake.vals : [15];
              const rest = bake.loop >= 0 && at >= bake.loop ? vals.slice(bake.loop, bake.release >= 0 ? bake.release : undefined) : vals.slice(Math.min(at, vals.length - 1));
              const err = (c: number): number => rest.reduce((a, L) => a + Math.abs(Math.floor((c * scaleVol(bake!.vol, L, m.compatFlags)) / 15) - scaleVol(furVol, L, m.compatFlags)), 0);
              let c = 0;
              for (let k = 1; k <= 15; k++) if (err(k) < err(c)) c = k;
              if (bake.held || rest.length > 1 || err(c) > 0) lossy.add('volume column under a running baked volume macro');
              if (c !== lastVol) { ops.push(0x70 | c); lastVol = c; } // lastVol stays under 15, so the next baked note sends 15 again
            } else if (!hwVol && !(baked && n === 0) && cell.volume !== lastVol) { ops.push(0x70 | furVol); lastVol = cell.volume; } }
          }
          if (volSlide >= 0) {
            const x = volSlide >> 4, y = volSlide & 15;
            // Furnace keeps the 0Axy slide running across rows until 0A00; FamiStudio's slide stops on a volume set, so it is re-sent after each one.
            slideOps = x > 0 ? [0x51, clamp8(x * 4 * perFrame) & 0xff, 240] : y > 0 ? [0x51, -clamp8(y * 4 * perFrame) & 0xff, 0] : [];
            ops.push(...(slideOps.length ? slideOps : [0x51, 0, 0]));
            slStep = x > 0 ? x / 4 : -y / 4;
            lastVol = -1;
          }
          if (n > 0) {
            // Envelope / length-counter modes have no FamiStudio equivalent: play them through a derived instrument whose
            // volume envelope is the APU output frame by frame (hwVolumeEnvelope), with the channel volume at 15.
            hwVol = ch !== 2 && ch < DPCM_CH && envMode !== 3;
            const idx = curInsIdx >= 0 ? curInsIdx : 0;
            const volMac = curIns?.macros.some((x) => x.code === MACRO_VOL && x.length > 0);
            // A running 0Axy changes the channel volume every tick, so it cannot be baked into the envelope: FamiStudio slides it instead.
            baked = !hwVol && ch !== DPCM_CH && ch !== 2 && !!volMac && furVol < 15 && !slideOps.length;
            const key0 = (hwVol ? idx + 65536 * (1 + (envMode | (furVol << 2) | (lenIdx << 6))) : idx) + (baked ? KEY_BAKE * (1 + furVol) : 0);
            // The loop pass gets phase copies like the first pass; it rejoins first-pass bytes only when the loop shifts the song tick phase by a whole frame (else the replay plays first-pass phases).
            const key = pass2 ? phaseKey(key0, idx, (seq[ri].t + delay * perTick) - Math.round(seq[ri].t + delay * perTick)) : phaseKey(key0, idx, seq[ri].t + delay * perTick - seq[ri].frame - Math.round(delay * perTick));
            if (baked) { const f = macroFrames(curIns!.macros.find((x) => x.code === MACRO_VOL && x.length > 0)!, 'vol', lossy, undefined, macroRate, m.version, keyPhase(key)); bake = { vol: furVol, vals: f.vals, held: f.loop >= 0 || f.release >= 0, loop: f.loop, release: f.release, frame: seq[ri].frame }; }
            if (key !== lastIns) { insOps.push(0x80 | (insNo(key) << 1)); lastIns = key; }
            if (ch < DPCM_CH && ch !== 2) {
              const dm = curIns?.macros.find((x) => x.code === MACRO_DUTY && x.length > 0);
              if (dutyMac) { // the duty the previous note's macro left in Furnace's channel state
                // vals are per Furnace tick (rate 1, no phase). The new note's row runs before that tick's macro step (playback.cpp
                // nextTick, then the dispatch tick), so the old macro last played tick n - 1 of the n ticks between the two notes.
                const { vals, loop } = dutyMac, at = Math.max(0, Math.round((seq[ri].t - dutyMac.t) * macroRate) - 1);
                furDuty = vals[at < vals.length ? at : loop >= 0 ? loop + ((at - loop) % (vals.length - loop)) : vals.length - 1] & 3;
              }
              if (dm) { const f = macroFrames(dm, 'duty', lossy); dutyMac = { vals: f.vals, loop: f.loop, t: seq[ri].t }; }
              else { dutyMac = null; if (furDuty !== fsDuty) { ops.push(0x4f, furDuty); fsDuty = furDuty; } }
            }
            const fsVol = hwVol || baked ? 15 : furVol;
            if (hwVol || baked ? lastVol !== 15 : lastVol !== -1 && lastVol !== furVol) { ops.push(0x70 | fsVol); lastVol = fsVol; }
          }
          if (volSlide < 0 && slideOps.length && (cell.volume >= 0 || n > 0)) { ops.push(...slideOps); lastVol = -1; }
          // Slides: 0x50 step,from,to replaces the note byte (it attacks the note); 0x43 first keeps a held note from retriggering.
          if (tonal && src > 0 && slideFx) {
            const pFrom = pulsePeriod;
            let from = src, to = src, mag = 0;
            // FamiStudio step = half-periods per frame. Linear pitch: Furnace moves `semi` semitones per tick, so the
            // FamiStudio step covers the same span in the same time (period-linear, so the curve differs on long slides).
            const linStep = (a: number, b: number, semi: number): number => 2 * Math.abs(pFrom(a) - pFrom(b)) / Math.max(1, Math.abs(b - a) / semi * perTick);
            if (slideFx === 0x03) {
              if (n > 0 && curNote > 0 && n !== curNote && slideVal > 0) {
                from = curNote; to = n; noAttack = true;
                mag = linear ? linStep(from, to, slideVal * slideUnit / 128) : 2 * slideVal * perFrame;
              }
            } else if (slideFx === 0x01 || slideFx === 0x02) {
              if (slideVal > 0) {
                const dir = slideFx === 0x01 ? 1 : -1;
                if (linear) {
                  const semi = slideVal * slideUnit / 128;
                  to = Math.max(1, Math.min(96, src + dir * Math.round(semi * span(ri) * perFrame)));
                  // Furnace note = FamiStudio note + 59; the slide stops at note 0 (down) or 179 (up), or with limitSlides at
                  // getPortaFloor = 60 (NES keeps the DivDispatch default) and 156 (playback.cpp 0x01/0x02): FamiStudio 1 / 97.
                  const lim = m.compatFlags?.limitSlides === true;
                  if (semi * span(ri) * perFrame >= (dir < 0 ? src - (lim ? 1 : -59) : (lim ? 97 : 120) - src) && m.compatFlags?.targetResetsSlides !== false) heldSlide = null;
                  if (to !== src) mag = linStep(src, to, semi);
                } else {
                  const pn = Math.max(1, pFrom(src) - dir * slideVal * span(ri) * perFrame);
                  to = Math.max(1, Math.min(96, Math.round(46 + 12 * Math.log2((pFrom(46) + 1) / (pn + 1)))));
                  mag = 2 * slideVal * perFrame;
                }
                noAttack = n === 0;
              }
            } else {
              const x = slideVal >> 4, y = slideVal & 15;
              if (y > 0) {
                to = Math.max(1, Math.min(96, src + (slideFx === 0xe1 ? y : -y)));
                mag = linear ? linStep(src, to, x * 4 * slideUnit / 128) : 2 * (2 * x + 1) * perFrame;
                noAttack = n === 0;
              }
            }
            // A lossy slide is off until the next note on this channel.
            const markPitchLossy = (): void => {
              let j = ri + 1;
              while (j < lim(ri) && !(seq[j].cell && convertFurnaceNoteValue(seq[j].cell!) >= 0)) j++;
              pitchLossy.push({ ch, from: seq[ri].frame, to: j < lim(ri) ? seq[j].frame : seq[ri].frame + 600 });
            };
            // Linear pitch: units per tick and whether Furnace stops at the target (03, E1/E2) or slides on (01/02).
            const units = slideFx === 0x03 || slideFx === 0x01 || slideFx === 0x02 ? slideVal * slideUnit : (slideVal >> 4) * 4 * slideUnit;
            const totalUnits = slideFx === 0x01 || slideFx === 0x02 ? Infinity : Math.abs(to - from) * 128;
            const [step, curveErr] = to !== from && mag > 0 && linear && mag <= 127.5
              ? bestSlideStep({ rawFrom: pulsePeriodRaw(from), fromPeriod: pFrom(from), toPeriod: pFrom(to), unitsPerTick: units, totalUnits, dirUp: to > from, furPitch: fineRaw - 128, fsOffset: fineSent || 0, frames: Math.max(1, span(ri)), perTick, guess: mag, clock })
              : [-Math.sign(pFrom(from) - pFrom(to)) * Math.max(1, Math.min(127, Math.round(mag))), 0];
            // Furnace slides pitch-linear; a FamiStudio 0x50 slide is period-linear with steps of at least half a period per
            // frame, so a long or slow slide overshoots or lags (turtle_byte pulse2 frame 403: 457 -> 469 played 429 -> 496).
            // When no other pitch override runs, play the start note and send Furnace's per-frame periods (row phase as the
            // unrolled pitch macro) as a relative 0x49 envelope; it holds the last offset once the slide reaches its target.
            // shortcut: a 04xy / 00xy change mid-slide without a note sends 0x4a and drops the offset; merge it into the
            // vibrato envelope if a song needs that.
            const curveMiss = linear && to !== from && mag > 0 && (Math.abs(to - from) > 2 || mag > 127.5 || curveErr > 0);
            // The engine zeroes a relative pitch envelope's running offset only on a note attack (famistudio_do_note_attack
            // @reset_pitch_env); 0x49, 0x4a and a 0x43 note keep it. envCarry models that running offset: a slide envelope on
            // a no-attack 03 starts with a step that cancels it (turtle_byte pulse1 frame 403: 462 played 739), and a no-attack
            // 0x50 slide after one gets a one-step cancel envelope (Famitune1 triangle frame 1440: 80 played 93).
            if (n > 0 && !noAttack) envCarry = 0;
            // The envelope path plays the start note; a 00xy / 04xy / E5xx before the next note replaces the envelope with an
            // override that rides on that start note (Famitune1 triangle frame 1260: vibrato around 39, Furnace around 35).
            const playsOut = (): boolean => {
              for (let j = ri + 1; j < lim(ri); j++) {
                const c = seq[j].cell;
                if (!c) continue;
                if (convertFurnaceNoteValue(c) > 0) return true;
                if (c.effects.some((e) => e.type === 0x00 || e.type === 0x04 || e.type === 0xe5)) return false;
              }
              return true;
            };
            if (curveMiss && n > 0 && (vibOn === -1 || (vibOn >= 0 && vibOn === slideEnv)) && playsOut()) {
              const rowPh = seq[ri].t - seq[ri].frame, raw = pulsePeriodRaw(from), base = pFrom(from) + (fineSent || 0), d: number[] = [];
              const start = envCarry;
              // span 240 = no next note or slide in sight: the envelope must reach the target (it then holds), else it
              // would freeze mid-slide; stop it there, the held last offset covers the rest.
              const open = span(ri) >= 240;
              let prev = envCarry, u = 0;
              for (let f = 0; f < Math.max(1, span(ri)); f++) {
                u = Math.min(totalUnits, units * (tickAtFrame(f, macroRate, rowPh) + 1));
                const o = roundOnClock(raw * 2 ** (-((to > from ? u : -u) + fineRaw - 128) / 1536), clock) - 1 - base;
                if (Math.abs(o - prev) > 63 || base + o < 1 || base + o > 2047) { d.length = 0; break; }
                d.push(o - prev); prev = o;
                if (open && u >= totalUnits) break;
              }
              if (open && u < totalUnits) d.length = 0;
              if (d.length) {
                slideEnv = envId(encodeEnvelope(d, -1, -1, 'pitch', true));
                // An EDxx note delay attacks (and restarts the envelope) that many frames late, so only the first span - delay
                // steps play before the next row (turtle_byte pulse2 frame 403: ED01 left the engine at 216, not the end 242).
                const played = open ? d.length : Math.max(0, d.length - Math.round(delay * perTick)); // open: trimmed to the target, all steps play
                envCarry = start + d.slice(0, played).reduce((a, b) => a + b, 0); // shortcut: assumes the envelope plays out before the next 0x49 / attack
                ops.push(0x49, { env: slideEnv }); vibOn = slideEnv;
                if (noAttack) tail.push(0x43);
                rowByte = from >= 13 && from <= 75 ? [from - 12] : [0x40, from];
                envTo = to;
                if (n > 0) hasNotes = true;
              }
            }
            if (!envTo && vibOn >= 0 && vibOn === slideEnv) { ops.push(0x4a); vibOn = -1; lastIns = -1; }
            if (envTo) { /* sent as a pitch envelope above */ } else if (to !== from && mag > 0) {
              if ((linear && Math.abs(to - from) > 2) || mag > 127.5) markPitchLossy();
              if (linear && Math.abs(to - from) > 2) lossy.add('pitch slide over 2 semitones: FamiStudio slides period-linear, Furnace linear pitch (curve differs mid-slide)');
              if (mag > 127.5) lossy.add('pitch slide faster than FamiStudio step 127 (slowed)');
              // one_sided_love triangle frame 295 (148 -> 132): Furnace steps 3,3,4,3,3 periods, no constant FamiStudio step does.
              if (curveErr > 0 && !(Math.abs(to - from) > 2) && mag <= 127.5) { lossy.add('pitch slide curve not reachable with a constant FamiStudio step'); markPitchLossy(); }
              slide = [step & 0xff, from, to];
              // A no-attack slide keeps the previous slide envelope's end offset: zero it with a one-step envelope (the
              // next note row's 0x4a hands back the instrument envelope with the offset kept at 0).
              // A relative step holds -64..63 (encodeEnvelope clamps): one [-242] step left the engine at 178 (turtle_byte
              // pulse1 frame 403, measured famistudio_pitch_env_value), so cancel in steps of at most 64.
              if (noAttack && envCarry && vibOn === -1) {
                const cancel: number[] = [];
                for (let left = -envCarry; left !== 0; left -= cancel[cancel.length - 1]) cancel.push(Math.max(-64, Math.min(63, left)));
                vibOn = envId(encodeEnvelope(cancel, -1, -1, 'pitch', true)); ops.push(0x49, { env: vibOn }); envCarry = 0;
              }
              rowByte = null;
              if (n > 0) hasNotes = true;
            } else if (slideVal > 0) { lossy.add('slide shorter than a semitone'); markPitchLossy(); }
          }
          if (slide || envTo) curNote = slide ? slide[2] : envTo;
          else if (n > 0) curNote = n;
          if (n > 0 && !noAttack && !envTo) envCarry = 0; // any attacked note zeroes the engine's pitch envelope offset
          if (delay > 0) {
            const d = Math.round(delay * perTick) - 1;
            // 0x47 n plays the note n + 1 frames after the row (engine counts n down and plays on the wrap to $FF), so n = 0 is a 1-frame delay.
            if (d >= 0) ops.push(0x47, Math.min(255, d)); else lossy.add('note delay under 1 frame');
          }
        }
        if (slide) { tail.push(...(noAttack ? [0x43] : []), 0x50, ...slide); }
        const row: Array<number | { env: number }> = [...ops, ...insOps, ...tail];
        if (row.length || rowByte) {
          flush();
          for (const b of row) { if (typeof b === 'number') out.push(b); else { efx.push([out.length, b.env]); out.push(0, 0); } }
          // The 0x50 slide opcode plays its target note and ends the row like a note byte (engine @slide_done_pos).
          if (rowByte) { out.push(...rowByte); ev.push(out.length); } else if (!slide) empty = 1; else ev.push(out.length);
        } else { empty++; }
        if (empty === MAX_EMPTY) flush();
        const sig = `${out.slice(startAt).join()}|${efx.slice(startEfx).map(([at, id]) => `${at - startAt}:${id}`).join()}`, post = snap();
        if (!pass2) { pass1.push({ at: startEmpty === 0 ? startAt : -1, sig, post }); continue; }
        if (!q || q.sig !== sig) run = null;
        else if (run && q.post === post && Math.abs((songEndT - rowFrameT[loopOrder][0]) - Math.round(songEndT - rowFrameT[loopOrder][0])) < 1e-3) { converge(run); break passes; }
      }
    }
    // Bytes equal to the song end: the copy from the run start is the first pass's. Else loop the loop-pass copy itself.
    if (retry) {
      envs.length = chMark.envs;
      for (const [k, id] of envKey) if (id >= chMark.envs) envKey.delete(k);
      for (const [k, id] of insMap) if (id >= chMark.ins) insMap.delete(k);
      pitchLossy.length = chMark.pl; lossy.restore(chMark.lossy);
      forceVol = true; ch--; continue;
    }
    forceVol = false;
    // Single pass: the 0x42 jump replays first-pass bytes, so a 0Axy running at the loop target on one pass only plays wrong on the other (sweatsmile noise order 4).
    if (!withLoop && slideOps.join() !== loopSlide) lossy.add('volume slide 0Axy running on one pass of the loop target only');
    if (loopTarget < 0 && run) converge(run);
    if (loopTarget < 0) loopTarget = loopPassAt;
    flush();
    const packed = compressRefs(out, ev, efx, loopTarget);
    out.length = 0; out.push(...packed.out);
    efx.length = 0; efx.push(...packed.efx);
    fx.push(...packed.refs.map((r): [number, number] => [r.at + 2, r.target]));
    out.push(0x42, 0, 0);
    fx.push([out.length - 2, packed.loopAt]);
    streams.push(out); fixups.push(fx); envFixups.push(efx); channelsWithNotes.push(hasNotes); firstNotes.push(first); firstNoteFrames.push(firstFrame);
  }

  // Instrument envelopes.
  const insEnvs: number[][] = [];
  for (const [pkey] of [...insMap].sort((a, b) => a[1] - b[1])) {
    const key = pkey % KEY_PHASE, ph = keyPhase(pkey);
    const bake = Math.floor(key / KEY_BAKE) - 1, rest = key % KEY_BAKE;
    const fi = rest % 65536, hw = Math.floor(rest / 65536) - 1;
    const ins = m.instruments[fi];
    const pick = (code: number): FurnaceMacro | undefined => ins?.macros.find((x) => x.code === code && x.length > 0);
    const slot = (code: number, kind: 'vol' | 'arp' | 'duty' | 'pitch', step?: (v: number) => number): number => {
      const mac = pick(code);
      return envId(mac ? macroEnvelope(mac, kind, lossy, step, macroRate, m.version, ph) : DEFAULT_ENV[kind]);
    };
    if (hw >= 0 && pick(MACRO_VOL)) lossy.add('volume macro under 15xx hardware envelope (APU envelope played, macro ignored)');
    const bakedVol = (): number => {
      const f = macroFrames(pick(MACRO_VOL)!, 'vol', lossy, undefined, macroRate, m.version, ph);
      return envId(encodeEnvelope(f.vals.map((v) => scaleVol(bake, v, m.compatFlags)), f.loop, f.release, 'vol'));
    };
    insEnvs.push([hw >= 0 ? envId(hwVolumeEnvelope(hw)) : bake >= 0 ? bakedVol() : slot(MACRO_VOL, 'vol', ins?.type === VRC6_SAW_INS ? (v) => Math.round(v / 4) : undefined), slot(MACRO_ARP, 'arp'), slot(MACRO_DUTY, 'duty'), slot(MACRO_PITCH, 'pitch')]);
    for (const mac of ins?.macros ?? []) if (mac.length > 0 && ![MACRO_VOL, MACRO_ARP, MACRO_DUTY, MACRO_PITCH].includes(mac.code)) lossy.add(`macro code ${mac.code}`);
  }
  if (insEnvs.length === 0) insEnvs.push([envId(DEFAULT_ENV.vol), envId(DEFAULT_ENV.arp), envId(DEFAULT_ENV.duty), envId(DEFAULT_ENV.pitch)]);

  // DPCM sample data, 64-byte aligned, length 16n+1.
  const dpcm: number[] = [];
  const sampleAt = new Map<number, { off: number; len: number; loop: boolean }>();
  for (const { sample } of dpcmList) {
    if (sampleAt.has(sample)) continue;
    const smp = m.samples[sample];
    let bytes: number[];
    if (smp.depth === 1) bytes = [...smp.data].slice(0, Math.ceil(smp.length / 8)).map((b) => b & 0xff);
    else {
      // Resample from the sample's own rate to the NES DPCM rate of its first mapping, keeping the duration.
      const rate = DPCM_RATES[dpcmList.find((d) => d.sample === sample)?.pitch ?? 15];
      const src = [...smp.data].slice(0, smp.length), ratio = smp.c4Rate > 0 ? smp.c4Rate / rate : 1;
      const res = Array.from({ length: Math.max(1, Math.floor(src.length / ratio)) }, (_, i) => src[Math.min(src.length - 1, Math.floor(i * ratio))]);
      const lv = res.map((v) => (smp.depth === 16 ? (v + 32768) >> 9 : smp.data instanceof Uint8Array ? v >> 1 : (v + 128) >> 1));
      bytes = pcmToDpcm(lv);
    }
    if (bytes.length > 4081) { lossy.add('DPCM sample longer than 4081 bytes (cut)'); bytes = bytes.slice(0, 4081); }
    while (bytes.length % 16 !== 1) bytes.push(0x55);
    while (dpcm.length % 64) dpcm.push(0x55);
    if (dpcm.length + bytes.length > dpcmCap) { lossy.add('DPCM samples past the 8 KB area (dropped)'); sampleAt.set(sample, { off: -1, len: 0, loop: false }); continue; }
    sampleAt.set(sample, { off: dpcm.length, len: bytes.length, loop: smp.loop });
    dpcm.push(...bytes);
  }

  // Assemble: header, song header, instruments, sample table, envelopes, streams.
  const headerLen = 1 + 2 + 2 + NCH * 2 + 4;
  const insOff = headerLen;
  const smpOff = insOff + insEnvs.length * 8;
  const envOff = smpOff + dpcmList.length * 4;
  const envAddr: number[] = [];
  let p = envOff;
  for (const e of envs) { envAddr.push(base + p); p += e.length; }
  const streamAddr: number[] = [];
  for (const st of streams) { streamAddr.push(base + p); p += st.length; }
  const music = new Uint8Array(p);
  const w16 = (at: number, v: number): void => { music[at] = v & 0xff; music[at + 1] = (v >> 8) & 0xff; };
  music[0] = 1;
  w16(1, base + insOff);
  w16(3, base + smpOff - 4);
  for (let c = 0; c < NCH; c++) w16(5 + c * 2, streamAddr[c]);
  const hz = s.hz > 0 ? s.hz : 60;
  if (Math.abs(hz - 60) > 0.5) lossy.add(`tick rate ${hz} Hz approximated with FamiTracker tempo`);
  // FamiTracker tempo: frames per row = speed x 150 / tempo, so virtual tempo N/D scales tempo by N/D (engine range 32..255).
  // The engine takes any 16-bit step; it only has to keep the 8-bit accumulator below 256 (speed x q - 1 + step / 256).
  const tempoRaw = tempoBase * spdMul;
  const stepNtsc = Math.round(256 * tempoRaw / 150);
  const tempo = stepFits(spdMul) ? Math.max(32, tempoRaw) : 150 * (256 - maxSpd * spdMul) - 1;
  if (tempo !== tempoRaw) lossy.add(`virtual tempo ${s.virtualTempo}/${s.virtualTempoD} outside the FamiStudio tempo step range (clamped)`);
  w16(5 + NCH * 2, Math.round(256 * tempo / (50 * 60 / 24)));
  w16(7 + NCH * 2, Math.round(256 * tempo / (60 * 60 / 24)));
  // Furnace adds N to its tempo accumulator before the first tick (playback.cpp), so with N > D its first frame already
  // holds part of the next tick: the player starts the accumulator at 6 x 256 - 256 q + step (6 x 256 when N = D), which
  // puts every row on Furnace's frame. At another tick rate a row's Furnace time falls between 60 Hz frames: a start of
  // 6 x 256 + step / 2 (just under) fires each row on the nearest frame, where 6 x 256 fired it on the next one
  // (Famitune1, 56 Hz: speeds x 15 make the step whole, so every row sat up to a frame late).
  // shortcut: N != D off 60 Hz keeps 6 x 256; combine both phases if such a song shows up.
  const tempoAcc = tempo !== tempoRaw ? 0x600
    : Math.abs(hz - 60) > 0.5 ? (s.virtualTempo === s.virtualTempoD ? 0x600 + ((stepNtsc - 1) >> 1) : 0x600)
    : 0x600 - 256 * spdMul + stepNtsc;
  insEnvs.forEach((ids, i) => ids.forEach((id, k) => w16(insOff + i * 8 + k * 2, envAddr[id])));
  dpcmList.forEach((d, i) => {
    const at = sampleAt.get(d.sample)!;
    const smpLoop = at.loop ? 1 : 0;
    music.set([at.off < 0 ? 0 : at.off >> 6, at.off < 0 ? 0 : (at.len - 1) >> 4, d.pitch | (smpLoop << 6), d.delta < 0 ? 64 : d.delta], smpOff + i * 4);
  });
  envs.forEach((e, i) => music.set(e, envAddr[i] - base));
  streams.forEach((st, c) => {
    const at = streamAddr[c] - base;
    music.set(st, at);
    for (const [off, target] of fixups[c]) w16(at + off, streamAddr[c] + target);
    for (const [off, id] of envFixups[c]) w16(at + off, envAddr[id]);
  });
  return { music, dpcm: Uint8Array.from(dpcm), sizes: { header: smpOff, samples: envOff - smpOff, envelopes: streamAddr[0] - base - envOff, streams: streams.map((st) => st.length) }, lossy: lossy.list(), pitchLossy, tempoAcc, channelsWithNotes, firstNotes, firstNoteFrames, tuning: m.tuning, clock, vrc6 };
}

/** On-screen text slot: uppercase ASCII 0x20-0x5F (the player font), space padded to `len`. */
export function famistudioText(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len).fill(0x20);
  const t = s.toUpperCase();
  for (let i = 0; i < Math.min(len, t.length); i++) { const c = t.charCodeAt(i); out[i] = c >= 0x20 && c <= 0x5f ? c : 0x3f; }
  return out;
}

/** Patch the converted song (and optional on-screen title/author) into the player image (public/nes/famistudio/player*.nes). */
export function buildFamistudioRom(player: Uint8Array, meta: FamistudioMeta, song: FamistudioSong, text: { title?: string } & NesScreenInfo = {}, subsongCount = 1): Uint8Array {
  if ((song.fme7 ? FME7_MUSIC_ADDR : 0x8000) !== meta.musicAddr) throw new Error(`song assembled for another player than musicAddr ${meta.musicAddr}`);
  if (song.music.length > meta.musicCap) throw new Error(`song data ${song.music.length} bytes > ${meta.musicCap}`);
  if (song.dpcm.length > meta.dpcmCap) throw new Error(`DPCM ${song.dpcm.length} bytes > ${meta.dpcmCap}`);
  const rom = new Uint8Array(player); // copy: Buffer.slice() is a view, retuneNoteTable would write into the caller's player
  rom.set(song.music, meta.prgOffset + meta.musicAddr - 0x8000);
  rom.set(song.dpcm, meta.prgOffset + meta.dpcmAddr - 0x8000);
  if (text.title) rom.set(famistudioText(text.title, meta.textLen), meta.prgOffset + meta.titleAddr - 0x8000);
  if (text.author) rom.set(famistudioText(text.author, meta.textLen), meta.prgOffset + meta.authorAddr - 0x8000);
  const at = (a: number) => meta.prgOffset + a - 0x8000;
  if (text.chipName) rom.set(nesScreenText(text.chipName, meta.chipLen), at(meta.chipAddr));
  if (text.title || text.author || text.comments) rom.set(nesScrollText(text.title ?? '', text, meta.scrollLen), at(meta.scrollAddr));
  rom[at(meta.nsubAddr)] = subsongCount;
  if (meta.taccAddr !== undefined && song.tempoAcc !== undefined) { rom[at(meta.taccAddr)] = song.tempoAcc & 0xff; rom[at(meta.taccAddr) + 1] = song.tempoAcc >> 8; }
  // Always rewrite: also saturates notes below A-1 at 2047 like Furnace (nes.cpp: if (freq>2047) freq=2047), where the
  // stock table's 12-bit periods wrap in $4003/$400B and sound high.
  retuneNoteTable(rom, song.tuning || 440, song.clock ?? 1789773);
  return rom;
}

/** FamiStudio NTSC note table entry n (index 46 = A-4 at `a4` Hz), as NoteTables/famistudio_note_table_*.bin holds it. */
const noteTablePeriod = (n: number, a4: number, clock = 1789773): number => (n === 0 ? 0 : roundOnClock(periodRawAt(n, a4), clock) - 1);

/** FamiStudio has no song tuning: the engine plays one A-440 table (97 LSBs, then 97 MSBs). Furnace's A-4 tuning
 *  (song.tuning, e.g. 433 or 392) moves every note, so rewrite that table in the ROM for the song's A-4. */
function retuneNoteTable(rom: Uint8Array, a4: number, clock: number): void {
  const N = 97;
  const ref = Uint8Array.from({ length: 2 * N }, (_, i) => (i < N ? noteTablePeriod(i, 440) & 0xff : noteTablePeriod(i - N, 440) >> 8));
  let at = -1;
  for (let i = 0; i + ref.length <= rom.length && at < 0; i++) if (ref.every((b, k) => rom[i + k] === b)) at = i;
  if (at < 0) throw new Error('FamiStudio note table not found in the player ROM: cannot apply the song tuning');
  // Furnace clamps the NES period to 11 bits; the APU drops bits above it.
  for (let i = 0; i < N; i++) { const p = Math.min(0x7ff, noteTablePeriod(i, a4, clock)); rom[at + i] = p & 0xff; rom[at + N + i] = p >> 8; }
}
