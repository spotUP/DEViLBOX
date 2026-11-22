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
  /** Furnace A-4 tuning (Hz); buildFamistudioRom retunes the player's note table to it. */ tuning?: number }

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
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

function macroEnvelope(macIn: FurnaceMacro, kind: 'vol' | 'arp' | 'duty' | 'pitch', lossy: Lossy, step?: (v: number) => number, rate = 1, version = 245): number[] {
  const f = macroFrames(macIn, kind, lossy, step, rate, version);
  return encodeEnvelope(f.vals, f.loop, f.release, kind, f.relative);
}

/** Per-frame envelope values of a Furnace macro (what macroEnvelope encodes). */
function macroFrames(macIn: FurnaceMacro, kind: 'vol' | 'arp' | 'duty' | 'pitch', lossy: Lossy, step?: (v: number) => number, rate = 1, version = 245): { vals: number[]; loop: number; release: number; relative: boolean } {
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
    const src = vals.slice(), fr = (i: number): number => (i < 0 ? -1 : Math.min(Math.ceil(src.length / rate) - 1, Math.round(i / rate)));
    vals.length = 0;
    for (let f = 0; f * rate < src.length; f++) vals.push(src[Math.floor(f * rate)]);
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
export function mergeVibratoPitch(vib: number[], mac: { vals: number[]; loop: number; relative: boolean }, lossy: { add(s: string): void }): { deltas: number[]; loop: number } {
  let len = mac.vals.length;
  // A held tail (ADSR sustain, trailing zero increments) repeats already: end the macro part where it stops moving.
  if (mac.loop < 0) while (len > 1 && (mac.relative ? mac.vals[len - 1] === 0 : mac.vals[len - 1] === mac.vals[len - 2])) len--;
  const lp = mac.loop >= 0 && mac.loop < len ? len - mac.loop : 0;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const period = lp ? (lp * vib.length) / gcd(lp, vib.length) : vib.length;
  // Past the macro's last frame both parts repeat (macro loop or hold, vibrato cycle), so the deltas loop from there.
  let end = len + period, loop = len;
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
const SLIDE_FX = new Set([0x01, 0x02, 0x03, 0xe1, 0xe2]);
const clamp8 = (v: number): number => Math.max(-127, Math.min(127, Math.round(v)));
/** Furnace VOL_SCALE_LINEAR_BROKEN (dispatch.h): channel volume x macro volume. Default floors; FamiStudio's volume table
 *  rounds up, so a channel volume under 15 is baked into the volume envelope and the channel volume sent as 15. */
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
  // Note cuts cost 2 bytes per row, a held 01/02 slide 3 extra bytes per note; when the song is over the cap, drop cuts
  // first, then held slides (the notes then play unslid), then both.
  let base = 0x8000;
  let cap = MUSIC_CAP;
  let song = convert(m, subsong, dpcmCap, true, true, base);
  // shortcut: VRC6 songs stay on the 16 KB mapper-24 player; give player-vrc6 a second music bank when one needs it.
  if (song.music.length > cap && !song.vrc6) {
    base = FME7_MUSIC_ADDR;
    cap = FME7_MUSIC_CAP;
    song = convert(m, subsong, dpcmCap, true, true, base);
  }
  for (const [cuts, held] of [[false, true], [true, false], [false, false]]) {
    if (song.music.length <= cap) break;
    song = convert(m, subsong, dpcmCap, cuts, held, base);
    if (!cuts) song.lossy.push(`note cut EC dropped to fit the ${cap / 1024} KiB music area`);
    if (!held) song.lossy.push(`01/02 slide held over later notes dropped to fit the ${cap / 1024} KiB music area`);
  }
  if (base === FME7_MUSIC_ADDR) song.fme7 = true;
  return song;
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
export function bestSlideStep(o: { rawFrom: number; fromPeriod: number; toPeriod: number; unitsPerTick: number; totalUnits: number; dirUp: boolean; furPitch: number; fsOffset: number; frames: number; perTick: number; guess: number }): [number, number] {
  const sign = o.toPeriod < o.fromPeriod ? -1 : 1;
  const fur: number[] = [];
  for (let f = 0; f < o.frames; f++) {
    const u = Math.min(o.totalUnits, o.unitsPerTick * (Math.floor(f / o.perTick) + 1));
    fur.push(Math.round(o.rawFrom * 2 ** (-((o.dirUp ? u : -u) + o.furPitch) / 1536)) - 1);
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

function convert(m: FurnaceModule, subsong: number, dpcmCap: number, withCuts: boolean, withHeld: boolean, base: number): FamistudioSong {
  const lossy = new Lossy();
  const pitchLossy: PitchLossySpan[] = [];
  const s = m.subsongs[subsong];
  // Period offsets (fine pitch, vibrato, pitch macro, slides) are taken against the note table buildFamistudioRom
  // retunes to the song's A-4, so they use the same tuning (one_sided_love, A-4 = 445: offsets were 1 off at 440).
  const pulsePeriodRaw = (n: number): number => periodRawAt(n, m.tuning || 440);
  const pulsePeriod = (n: number): number => Math.max(1, Math.round(pulsePeriodRaw(n)) - 1);
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
  // Furnace speeds: the pattern advances one entry per row (playback.cpp curSpeed); 09xx sets entry 0, 0Fxx entry 1 when there are two.
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
  const rowFrame: number[][] = [], rowSpeed: number[][] = [];
  {
    let f = 0, cur = 0;
    const sp = [...speeds];
    const perTick = 60 / (s.hz > 0 ? s.hz : 60) * vtScale;
    for (let o = 0; o < endOrder; o++) {
      rowFrame.push([]); rowSpeed.push([]);
      for (let r = 0; r < orderLen[o]; r++) {
        for (const e of rowFx(o, r)) {
          if (e.type === 0x09 && e.value > 0) sp[0] = e.value;
          if (e.type === 0x0f && e.value > 0) sp[sp.length === 2 ? 1 : 0] = e.value;
          if (e.type === 0xfd || e.type === 0xfe) lossy.add(`virtual tempo change ${e.type === 0xfd ? 'FD' : 'FE'}xx (ignored: rows keep the song start tempo)`);
        }
        rowFrame[o].push(Math.round(f));
        rowSpeed[o].push(sp[cur]);
        f += sp[cur] * perTick;
        cur = (cur + 1) % sp.length;
      }
    }
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

  // Instruments by first use; envelopes deduplicated by content.
  const insMap = new Map<number, number>();
  const insNo = (i: number): number => {
    if (!insMap.has(i)) { if (insMap.size >= MAX_INSTRUMENTS) { lossy.add('instruments past 64'); return 0; } insMap.set(i, insMap.size); }
    return insMap.get(i)!;
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
  for (let ch = 0; ch < NCH; ch++) {
    const out: number[] = [];
    const fx: Array<[number, number]> = [];
    // 2A03 hardware volume state (nes.cpp): 15xx envMode, 16xx length index, volume column = envelope period in envelope modes.
    let envMode = 3, lenIdx = 0x1f, furVol = 15, hwVol = false, baked = false, lastSpd = -1;
    let bake: { vol: number; vals: number[]; held: boolean; frame: number } | null = null; // the baked note's channel volume and volume macro frames
    let slideOps: number[] = [];
    let slVol = ch === 7 ? 63 : 15, slStep = 0, slFrame = 0; // Furnace channel volume under a running 0Axy (volume units), its step per tick
    let loopSlide = ''; // running 0Axy as the first pass enters the loop target
    let lastIns = -1, lastVol = -1, empty = 0, hasNotes = false, loopAt = 0, first = -1, firstFrame = -1;
    let curIns: FurnaceInstrument | undefined;
    let vibPos = 0, vibFrame = 0; // Furnace's vibratoPos (64-step sine) at the row start
    let curInsIdx = -1, curNote = 0, vibXY = 0, vibOn = -1, arpXY = 0, arpOn = -1, keyOff = false, noteArp: number[] | null = null, fineRaw = 128, fineSent = 0;
    // Furnace 01xx/02xx is channel state (playback.cpp portaSpeed): it keeps sliding every new note until x00, another
    // slide effect, or the slide reaching its target (note 0 / 179, targetResetsSlides).
    let heldSlide: [number, number] | null = null;
    const efx: Array<[number, number]> = [];
    const tonal = ch < 3 || ch === 5 || ch === 6; // VRC6 pulses share the 2A03 pulse period (divider 16); the saw (14) keeps no vibrato or slides
    const seq: Array<{ cell?: FurnacePatternCell; frame: number }> = [];
    for (let o = 0; o < endOrder; o++) for (let r = 0; r < orderLen[o]; r++) seq.push({ cell: cellAt(ch, o, r), frame: rowFrame[o][r] });
    /** Frames until the next note or slide effect on this channel (how long a slide runs). */
    const span = (i: number): number => {
      for (let j = i + 1; j < seq.length; j++) {
        const c = seq[j].cell;
        if (c && (convertFurnaceNoteValue(c) >= 0 || c.effects.some((e) => SLIDE_FX.has(e.type)))) return Math.min(240, seq[j].frame - seq[i].frame);
      }
      return 240;
    };
    const ev: number[] = []; // stream length after each event (note byte, wait byte, slide): the reference boundaries
    const flush = (): void => { if (empty > 0) { out.push(0x81 | ((empty - 1) << 1)); empty = 0; ev.push(out.length); } };
    let ri = 0;
    for (let o = 0; o < endOrder; o++) {
      // The loop target is entered with the end-of-song instrument, not the first pass's: send the instrument again.
      if (o === loopOrder) { flush(); loopAt = out.length; lastIns = -1; loopSlide = slideOps.join(); }
      for (let r = 0; r < orderLen[o]; r++, ri++) {
        const cell = cellAt(ch, o, r);
        const ops: Array<number | { env: number }> = [];
        const insOps: number[] = [];
        const tail: Array<number | { env: number }> = [];
        let delay = 0, noAttack = false, slide: number[] | null = null, rowByte: number[] | null = null;
        if (ch === 7 && o === 0 && r === 0) ops.push(0x55, 1); // saw volume shift: full (x4), so 0-15 spans the saw's 0-60
        if (ch === 0 && (rowSpeed[o][r] !== lastSpd || (o === loopOrder && r === 0))) { ops.push(0x46, Math.min(255, rowSpeed[o][r] * spdMul)); lastSpd = rowSpeed[o][r]; }
        // Furnace stops a running 0Axy once the volume passes its maximum or drops below 0 (playback.cpp, unless noVolSlideReset).
        if (slideOps.length && slVol >= 0) {
          slVol += slStep * (rowFrame[o][r] - slFrame) / perTick;
          if ((slVol >= (ch === 7 ? 64 : 16) || slVol < 0) && !m.compatFlags?.noVolSlideReset) slideOps = [];
        }
        slFrame = rowFrame[o][r];
        if (cell) {
          if (cell.instrument >= 0) { curIns = m.instruments[cell.instrument]; curInsIdx = cell.instrument; }
          // Furnace steps vibratoPos by the rate each tick (a new note zeroes it unless continuousVibrato) while the depth is above 0; the elapsed ticks run with the previous 04xy.
          if ((vibXY & 15) > 0) vibPos = (vibPos + (vibXY >> 4) * Math.round((rowFrame[o][r] - vibFrame) / perTick)) & 63;
          vibFrame = rowFrame[o][r];
          // The loop target is entered again with the end-of-song state: its effects are sent there even when they match the first pass.
          const atLoop = o === loopOrder && r === 0;
          if (atLoop) { fineSent = NaN; vibOn = -2; arpOn = -2; } // -2: override state unknown, sent either way
          let fxChanged = false, fineHere = false, slideFx = 0, slideVal = 0, volSlide = -1, cutTicks = 0;
          for (const e of cell.effects) {
            if (e.type < 0) continue;
            const t = e.type, v = Math.max(0, e.value); // an effect with no value byte plays as xx = 00 (Furnace playback.cpp)
            if (speedFx.has(t)) continue; // speed rows are written per row on channel 0 from rowSpeed
            else if ((t === 0x15 || t === 0x16) && ch < DPCM_CH && ch !== 2) { if (t === 0x15) envMode = v & 3; else lenIdx = v & 0x1f; }
            else if (t === 0x12 && ch < DPCM_CH && ch !== 2) ops.push(0x4f, v & 3);
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
            if (first < 0) { first = nv; firstFrame = rowFrame[o][r]; }
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
            const fine = clamp8(linear ? Math.round(pulsePeriodRaw(sn) * 2 ** (-fp / 1536)) - 1 - pulsePeriod(sn) : -fp);
            if (fine !== fineSent) { ops.push(0x4e, fine & 0xff); fineSent = fine; }
          }
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
            let pid = -1, vib: number[] | null = null;
            if (x > 0 && y > 0) {
              // Furnace steps a 64-entry sine x per tick and has stepped once on the note tick: loop the whole cycle set
              // (64/gcd(x,64) ticks) so a rate like 64/6 does not drift.
              const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
              const len = Math.max(2, Math.min(240, Math.round(64 / gcd(x, 64) * perTick)));
              const amp = linear ? pulsePeriod(src || 46) * (2 ** ((vibXY & 15) / 192) - 1) : y;
              // Linear pitch: Furnace offsets the pitch by (round(127 sin) * depth) >> 4 in 1/128 semitone and rounds the
              // unrounded period (measured on Sky Sanctuary: a depth-1 vibrato dips a period only above ~2 units), so offsets
              // are taken against the fractional base period, not the table's rounded one.
              const P = pulsePeriod(src || 46), X = pulsePeriodRaw(src || 46);
              // Furnace adds fine pitch (E5xx) and vibrato in 1/128 semitone and rounds once; the engine adds the sent fine
              // offset F to each step, so a step is taken at fine + vibrato minus F (rounding both apart was 1 off, one_sided_love).
              const fp = fineRaw - 128, F = Math.round(X * 2 ** (-fp / 1536)) - 1 - P;
              vib = Array.from({ length: len }, (_, i) => {
                const phase = vibPos + x * (Math.floor(i / perTick + 1e-9) + 1);
                if (!linear) return Math.round(-amp * Math.sin(2 * Math.PI * phase / 64));
                // Furnace: vibTable = (short)(127 sin) truncates; pitch = ((depth * vibTable * vibratoFine(15)) >> 4) / 15, C division truncates.
                const u = Math.trunc(((y * Math.trunc(127 * Math.sin(2 * Math.PI * (phase & 63) / 64)) * 15) >> 4) / 15);
                return Math.round(X * 2 ** (-(u + fp) / 1536)) - 1 - P - F;
              });
              pid = envId(encodeEnvelope(vib, 0, -1, 'pitch'));
            }
            if (linear) {
              const pm = curIns?.macros.find((mc) => mc.code === MACRO_PITCH && mc.length > 0);
              if (pm) {
                const P = pulsePeriod(src || 46);
                // shortcut: relative macros scale each increment at the note's period (exact for small sums), rounding per step.
                const toPeriod = (v: number): number => { const d = Math.round(P * (2 ** (-v / 1536) - 1)); if (Math.abs(d) > 63) lossy.add('pitch macro step past 63 period units (clamped)'); return d; };
                // An ADSR/LFO pitch macro in absolute mode is a position curve: FamiStudio's +-63 range only holds per-frame
                // steps, so send the differences of the period offsets as a relative envelope.
                const ex = expandProcMacro(pm, m.version);
                const mf = ex !== pm && (pm.mode & 1) === 0
                  ? macroFrames({ ...ex, mode: 0 }, 'pitch', lossy, (v) => Math.round(P * (2 ** (-v / 1536) - 1)), 1, m.version)
                  : macroFrames(pm, 'pitch', lossy, vib ? (v) => Math.round(P * (2 ** (-v / 1536) - 1)) : toPeriod, macroRate, m.version);
                if (vib || (!mf.relative && ex !== pm)) {
                  // Vibrato on top, or an ADSR/LFO position curve (+-63 only holds per-frame steps): one relative envelope.
                  const mg = mergeVibratoPitch(vib ?? [0], mf, lossy);
                  const lt = !vib && ex !== pm && (mg.loop < 0 || mg.loop >= mg.deltas.length - 1) ? loopPeriodicTail(mg.deltas) : mg;
                  pid = envId(encodeEnvelope(lt.deltas, lt.loop, -1, 'pitch', true));
                } else pid = envId(encodeEnvelope(mf.vals, mf.loop, -1, 'pitch', mf.relative));
              }
            }
            // An override persists across notes and instrument changes in the engine: send it only when it changes.
            if (pid >= 0) { if (vibOn !== pid) ops.push(0x49, { env: pid }); vibOn = pid; }
            else if (vibOn !== -1) { ops.push(0x4a); vibOn = -1; lastIns = -1; }
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
            noteArp = !arpMac || (!fixed && !outside && ch !== NOISE_CH) ? null
              : macroEnvelope(arpMac, 'arp', lossy, ch === NOISE_CH ? (v) => noiseNote(target(v), properNoise) - n : inTable, macroRate, m.version);
          }
          if (ch !== DPCM_CH && (fxChanged || n > 0)) {
            let env: number[] | null = null;
            if (arpXY !== 0) {
              // Frame-exact: frame f plays step floor(f * ticksPerFrame) % 3, looped over the shortest frame count that holds
              // a whole number of 3-tick cycles (45 frames at 56 Hz); a rounded per-tick frame count drifts a step per cycle.
              const x = arpXY >> 4, y = arpXY & 15, steps = [0, x, y];
              let len = 3 * Math.max(1, Math.round(perTick));
              for (let L = 1; L <= 240; L++) if (Math.abs(((L * macroRate) / 3) - Math.round((L * macroRate) / 3)) < 1e-6) { len = L; break; }
              env = encodeEnvelope(Array.from({ length: len }, (_, f) => steps[Math.floor(f * macroRate + 1e-9) % 3]), 0, -1, 'arp');
            } else env = noteArp;
            if (env) { const id = envId(env); if (arpOn !== id) ops.push(0x4b, { env: id }); arpOn = id; }
            else if (arpOn !== -1) { ops.push(0x4c); arpOn = -1; lastIns = -1; }
          }
          // A cut at or after the end of its row never fires; skip it (saves 2 bytes per row against the 16 KiB cap).
          if (withCuts && cutTicks > 0 && seq[ri + 1] && cutTicks * perTick < seq[ri + 1].frame - seq[ri].frame) ops.push(0x48, Math.min(255, Math.round(cutTicks * perTick)));
          if (cell.volume >= 0) {
            if (ch === DPCM_CH) lossy.add('volume column on DPCM');
            else { slVol = cell.volume; furVol = Math.min(15, ch === 7 ? Math.round(cell.volume / 4) : cell.volume); /* VRC6 saw volume is 0-63 */ if (!hwVol && baked && n === 0 && bake) {
              // The envelope holds bake x macro; Furnace now plays v x macro. Send the FamiStudio channel volume c (table =
              // floor(c * e / 15)) with the least error over the macro frames still to play (after a finished macro: v x L only,
              // L = its last value). Matching L alone while the macro runs silenced a decay to 0 (Future_Re-ference pulse 2).
              const vals = bake.vals.length ? bake.vals : [15], rest = vals.slice(Math.min(seq[ri].frame - bake.frame, vals.length - 1));
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
            if (baked) { const f = macroFrames(curIns!.macros.find((x) => x.code === MACRO_VOL && x.length > 0)!, 'vol', lossy, undefined, macroRate, m.version); bake = { vol: furVol, vals: f.vals, held: f.loop >= 0 || f.release >= 0, frame: seq[ri].frame }; }
            const key = (hwVol ? idx + 65536 * (1 + (envMode | (furVol << 2) | (lenIdx << 6))) : idx) + (baked ? KEY_BAKE * (1 + furVol) : 0);
            if (key !== lastIns) { insOps.push(0x80 | (insNo(key) << 1)); lastIns = key; }
            const fsVol = hwVol || baked ? 15 : furVol;
            if (hwVol || baked ? lastVol !== 15 : lastVol >= 0 && lastVol !== furVol) { ops.push(0x70 | fsVol); lastVol = fsVol; }
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
                  // Furnace note = FamiStudio note + 59; the slide stops at note 0 (down) or 179 (up).
                  if (semi * span(ri) * perFrame >= (dir < 0 ? src + 59 : 120 - src) && m.compatFlags?.targetResetsSlides !== false) heldSlide = null;
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
              while (j < seq.length && !(seq[j].cell && convertFurnaceNoteValue(seq[j].cell!) >= 0)) j++;
              pitchLossy.push({ ch, from: seq[ri].frame, to: j < seq.length ? seq[j].frame : seq[ri].frame + 600 });
            };
            if (to !== from && mag > 0) {
              if ((linear && Math.abs(to - from) > 2) || mag > 127.5) markPitchLossy();
              if (linear && Math.abs(to - from) > 2) lossy.add('pitch slide over 2 semitones: FamiStudio slides period-linear, Furnace linear pitch (curve differs mid-slide)');
              if (mag > 127.5) lossy.add('pitch slide faster than FamiStudio step 127 (slowed)');
              // Linear pitch: units per tick and whether Furnace stops at the target (03, E1/E2) or slides on (01/02).
              const units = slideFx === 0x03 || slideFx === 0x01 || slideFx === 0x02 ? slideVal * slideUnit : (slideVal >> 4) * 4 * slideUnit;
              const [step, curveErr] = linear && mag <= 127.5
                ? bestSlideStep({ rawFrom: pulsePeriodRaw(from), fromPeriod: pFrom(from), toPeriod: pFrom(to), unitsPerTick: units, totalUnits: slideFx === 0x01 || slideFx === 0x02 ? Infinity : Math.abs(to - from) * 128, dirUp: to > from, furPitch: fineRaw - 128, fsOffset: fineSent || 0, frames: Math.max(1, span(ri)), perTick, guess: mag })
                : [-Math.sign(pFrom(from) - pFrom(to)) * Math.max(1, Math.min(127, Math.round(mag))), 0];
              // one_sided_love triangle frame 295 (148 -> 132): Furnace steps 3,3,4,3,3 periods, no constant FamiStudio step does.
              if (curveErr > 0 && !(Math.abs(to - from) > 2) && mag <= 127.5) { lossy.add('pitch slide curve not reachable with a constant FamiStudio step'); markPitchLossy(); }
              slide = [step & 0xff, from, to];
              rowByte = null;
              if (n > 0) hasNotes = true;
            } else if (slideVal > 0) { lossy.add('slide shorter than a semitone'); markPitchLossy(); }
          }
          if (n > 0) curNote = slide ? slide[2] : n;
          else if (slide) curNote = slide[2];
          if (delay > 0) {
            const d = Math.round(delay * perTick) - 1;
            if (d >= 1) ops.push(0x47, Math.min(255, d)); else lossy.add('note delay under 2 frames');
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
      }
    }
    // The loop pass replays the first pass's bytes: a 0Axy running there on one pass only plays wrong on the other (sweatsmile noise order 4).
    if (slideOps.join() !== loopSlide) lossy.add('volume slide 0Axy running on one pass of the loop target only');
    flush();
    const packed = compressRefs(out, ev, efx, loopAt);
    out.length = 0; out.push(...packed.out);
    efx.length = 0; efx.push(...packed.efx);
    fx.push(...packed.refs.map((r): [number, number] => [r.at + 2, r.target]));
    out.push(0x42, 0, 0);
    fx.push([out.length - 2, packed.loopAt]);
    streams.push(out); fixups.push(fx); envFixups.push(efx); channelsWithNotes.push(hasNotes); firstNotes.push(first); firstNoteFrames.push(firstFrame);
  }

  // Instrument envelopes.
  const insEnvs: number[][] = [];
  for (const [key] of [...insMap].sort((a, b) => a[1] - b[1])) {
    const bake = Math.floor(key / KEY_BAKE) - 1, rest = key % KEY_BAKE;
    const fi = rest % 65536, hw = Math.floor(rest / 65536) - 1;
    const ins = m.instruments[fi];
    const pick = (code: number): FurnaceMacro | undefined => ins?.macros.find((x) => x.code === code && x.length > 0);
    const slot = (code: number, kind: 'vol' | 'arp' | 'duty' | 'pitch', step?: (v: number) => number): number => {
      const mac = pick(code);
      return envId(mac ? macroEnvelope(mac, kind, lossy, step, macroRate, m.version) : DEFAULT_ENV[kind]);
    };
    if (hw >= 0 && pick(MACRO_VOL)) lossy.add('volume macro under 15xx hardware envelope (APU envelope played, macro ignored)');
    const bakedVol = (): number => {
      const f = macroFrames(pick(MACRO_VOL)!, 'vol', lossy, undefined, macroRate, m.version);
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
  return { music, dpcm: Uint8Array.from(dpcm), sizes: { header: smpOff, samples: envOff - smpOff, envelopes: streamAddr[0] - base - envOff, streams: streams.map((st) => st.length) }, lossy: lossy.list(), pitchLossy, tempoAcc, channelsWithNotes, firstNotes, firstNoteFrames, tuning: m.tuning, vrc6 };
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
  retuneNoteTable(rom, song.tuning || 440);
  return rom;
}

/** FamiStudio NTSC note table entry n (index 46 = A-4 at `a4` Hz), as NoteTables/famistudio_note_table_*.bin holds it. */
const noteTablePeriod = (n: number, a4: number): number => (n === 0 ? 0 : Math.round(periodRawAt(n, a4)) - 1);

/** FamiStudio has no song tuning: the engine plays one A-440 table (97 LSBs, then 97 MSBs). Furnace's A-4 tuning
 *  (song.tuning, e.g. 433 or 392) moves every note, so rewrite that table in the ROM for the song's A-4. */
function retuneNoteTable(rom: Uint8Array, a4: number): void {
  const N = 97;
  const ref = Uint8Array.from({ length: 2 * N }, (_, i) => (i < N ? noteTablePeriod(i, 440) & 0xff : noteTablePeriod(i - N, 440) >> 8));
  let at = -1;
  for (let i = 0; i + ref.length <= rom.length && at < 0; i++) if (ref.every((b, k) => rom[i + k] === b)) at = i;
  if (at < 0) throw new Error('FamiStudio note table not found in the player ROM: cannot apply the song tuning');
  // Furnace clamps the NES period to 11 bits; the APU drops bits above it.
  for (let i = 0; i < N; i++) { const p = Math.min(0x7ff, noteTablePeriod(i, a4)); rom[at + i] = p & 0xff; rom[at + N + i] = p >> 8; }
}
