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
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';

export interface FamistudioMeta { musicAddr: number; musicCap: number; dpcmAddr: number; dpcmCap: number; prgOffset: number; tickAddr: number; sourceHash: string }
export interface FamistudioSong { music: Uint8Array; dpcm: Uint8Array; lossy: string[]; channelsWithNotes: boolean[]; firstNotes: number[]; firstNoteFrames: number[] }

class Lossy {
  private counts = new Map<string, number>();
  add(item: string, n = 1): void { this.counts.set(item, (this.counts.get(item) ?? 0) + n); }
  list(): string[] { return [...this.counts].map(([k, n]) => `${k}: ${n}`); }
}

const NES_SYSTEM = 0x06; // Furnace file system id (FurnaceSongParser.ts:172)
const CHANNELS = 5; // square 1, square 2, triangle, noise, DPCM (FamiStudio 2A03 order = Furnace order)
const DPCM_CH = 4;
const NOISE_CH = 3;
const MAX_INSTRUMENTS = 64;
const MAX_EMPTY = 64; // 0x81|(n<<1) waits n+1 rows, n <= 63
/** FamiStudio note N plays NoteTables index N; index 46 = A-4 440 Hz. Furnace flat A-4 = 57. */
const NOTE_OFFSET = 11;
/** FamiStudio note 10 (A-1, period 2033) is the lowest whose 2A03 period fits 11 bits; lower notes wrap in $4003/$400B,
 *  while Furnace saturates the period at 2047 (nes.cpp: if (freq>2047) freq=2047). */
const LOWEST_11BIT_NOTE = 10;
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
function macroEnvelope(mac: FurnaceMacro, kind: 'vol' | 'arp' | 'duty' | 'pitch', lossy: Lossy): number[] {
  const speed = Math.max(1, mac.speed || 1);
  const delay = Math.max(0, mac.delay || 0);
  const vals: number[] = [];
  for (let i = 0; i < delay; i++) vals.push(mac.data[0]);
  for (const v of mac.data.slice(0, mac.length)) for (let i = 0; i < speed; i++) vals.push(v);
  const at = (i: number): number => (i >= 0 && i < mac.length ? delay + i * speed : -1);
  let loop = at(mac.loop);
  let release = at(mac.release);
  if (kind === 'arp' && mac.data.some((v) => (v & 0x40000000) !== 0)) lossy.add('arp macro fixed-note steps (played relative)');
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
  if (vals.length > 240) { lossy.add(`${kind} macro longer than 240 frames (cut)`); vals.length = 240; if (loop >= 240) loop = -1; if (release >= 240) release = -1; }
  if (vals.length > 0 && loop < 0 && kind !== 'vol' && kind !== 'pitch') loop = -1;
  return encodeEnvelope(vals.map((v) => (kind === 'arp' ? (v << 2) >> 2 : v)), loop, kind === 'vol' ? release : -1, kind, kind === 'pitch' && (mac.mode & 1) === 1);
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

export function furnaceToFamistudio(m: FurnaceModule, subsong = 0, dpcmCap = 0x2000): FamistudioSong {
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  if (!s) throw new Error(`subsong ${subsong} missing`);
  if (m.systems[0] !== NES_SYSTEM) throw new Error(`first chip is system ${m.systems[0]}, not NES 2A03`);
  for (const sys of m.systems.slice(1)) lossy.add(`expansion chip system ${sys} (channels dropped; 2A03 only so far)`);
  if (m.subsongs.length > 1) lossy.add('other subsongs (only one exported)');
  if (s.speed2 !== s.speed1) lossy.add(`speed 2 (${s.speed2}) and groove: played at speed 1 (${s.speed1})`);
  const cellAt = (ch: number, o: number, r: number): FurnacePatternCell | undefined => m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o]}`)?.rows[r];

  // Order lengths (0B/0D in any channel ends the order) and the loop target (last 0B, else order 0).
  const orderLen: number[] = [];
  let loopOrder = 0, endOrder = s.ordersLen;
  for (let o = 0; o < endOrder; o++) {
    let len = s.patLen;
    for (let r = 0; r < s.patLen && len === s.patLen; r++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        for (const e of cellAt(ch, o, r)?.effects ?? []) {
          if (e.type === 0x0d) len = r + 1;
          if (e.type === 0x0b) { len = r + 1; if (e.value <= o) { loopOrder = e.value; endOrder = o + 1; } }
        }
      }
    }
    orderLen.push(len);
  }

  // Frame at which each row starts (speed effects in any channel apply to all; tick rate scales frames per tick).
  const rowFrame: number[][] = [];
  {
    let f = 0, spd = s.speed1;
    const perTick = 60 / (s.hz > 0 ? s.hz : 60);
    for (let o = 0; o < endOrder; o++) {
      rowFrame.push([]);
      for (let r = 0; r < orderLen[o]; r++) {
        for (let ch = 0; ch < CHANNELS; ch++) for (const e of cellAt(ch, o, r)?.effects ?? []) if ((e.type === 0x09 || e.type === 0x0f) && e.value > 0) spd = e.value;
        rowFrame[o].push(Math.round(f));
        f += spd * perTick;
      }
    }
  }

  // Instruments by first use; envelopes deduplicated by content.
  const insMap = new Map<number, number>();
  const insNo = (i: number): number => {
    if (!insMap.has(i)) { if (insMap.size >= MAX_INSTRUMENTS) { lossy.add('instruments past 64'); return 0; } insMap.set(i, insMap.size); }
    return insMap.get(i)!;
  };
  // DPCM mappings (sample, pitch, loop, delta) by first use; note byte = 1 + index.
  const dpcmMap = new Map<string, number>();
  const dpcmList: Array<{ sample: number; pitch: number; delta: number }> = [];
  const dpcmNote = (ins: FurnaceInstrument | undefined, flat: number): number => {
    // Furnace DivInstrumentAmiga defaults to initSample 0 (instrument.h:607); nes.cpp:538-540 pitch = note & 15.
    let sample = ins?.amiga?.initSample ?? 0;
    const pitch = flat & 15, delta = -1;
    if (ins?.amiga?.useNoteMap && ins.amiga.noteMap) {
      const e = ins.amiga.noteMap[flat + 60];
      if (e) sample = e.map;
      lossy.add('DPCM note-map pitch and delta (parser keeps no dpcmFreq/dpcmDelta; note & 15 used)');
    }
    if (sample < 0 || !m.samples[sample]) { lossy.add('DPCM note without a sample'); return -1; }
    const key = `${sample}_${pitch}_${delta}`;
    if (!dpcmMap.has(key)) {
      if (dpcmList.length >= 63) { lossy.add('DPCM mappings past 63'); return -1; }
      dpcmMap.set(key, dpcmList.length); dpcmList.push({ sample, pitch, delta });
    }
    return 1 + dpcmMap.get(key)!;
  };

  // Channel streams. Fixups: [offset in stream, target offset in same stream].
  const streams: number[][] = [];
  const fixups: Array<Array<[number, number]>> = [];
  const channelsWithNotes: boolean[] = [];
  const firstNotes: number[] = [];
  const firstNoteFrames: number[] = [];
  const speedFx = new Set([0x09, 0x0f]);
  for (let ch = 0; ch < CHANNELS; ch++) {
    const out: number[] = [];
    const fx: Array<[number, number]> = [];
    let lastIns = -1, lastVol = -1, empty = 0, hasNotes = false, loopAt = 0, first = -1, firstFrame = -1;
    let curIns: FurnaceInstrument | undefined;
    const flush = (): void => { if (empty > 0) { out.push(0x81 | ((empty - 1) << 1)); empty = 0; } };
    if (ch === 0) out.push(0x46, s.speed1);
    for (let o = 0; o < endOrder; o++) {
      if (o === loopOrder) { flush(); loopAt = out.length; }
      for (let r = 0; r < orderLen[o]; r++) {
        const cell = cellAt(ch, o, r);
        const ops: number[] = [];
        let rowByte: number[] | null = null;
        if (cell) {
          if (cell.instrument >= 0) curIns = m.instruments[cell.instrument];
          for (const e of cell.effects) {
            if (e.type < 0) continue;
            if (speedFx.has(e.type)) { if (e.value > 0) ops.push(0x46, e.value); }
            else if (e.type === 0x12 && ch < DPCM_CH && ch !== 2) ops.push(0x4f, e.value & 3);
            else if (e.type !== 0x0b && e.type !== 0x0d) lossy.add(`effect ${e.type.toString(16).toUpperCase().padStart(2, '0')}`);
          }
          if (cell.volume >= 0) {
            if (ch === DPCM_CH) lossy.add('volume column on DPCM');
            else if (cell.volume !== lastVol) { ops.push(0x70 | Math.min(15, cell.volume)); lastVol = cell.volume; }
          }
          const nv = convertFurnaceNoteValue(cell);
          if (nv === 253) rowByte = [0x00];
          else if (nv === 254 || nv === 255) rowByte = ch === DPCM_CH ? [0x00] : [0x45];
          else if (nv >= 0) {
            hasNotes = true;
            if (first < 0) { first = nv; firstFrame = rowFrame[o][r]; }
            if (ch === DPCM_CH) {
              const b = dpcmNote(curIns, nv);
              rowByte = b > 0 ? [b] : null;
            } else {
              if (cell.instrument >= 0 && cell.instrument !== lastIns) { const i = insNo(cell.instrument); ops.push(0x80 | (i << 1)); lastIns = cell.instrument; }
              else if (lastIns < 0) { ops.push(0x80 | (insNo(0) << 1)); lastIns = 0; }
              // Noise: FamiStudio and Furnace both use the low nibble as the period index.
              let n = ch === NOISE_CH ? 32 + (nv & 15) : nv - NOTE_OFFSET;
              if (ch !== NOISE_CH && n < LOWEST_11BIT_NOTE) { lossy.add('note below A-1 (2A03 period past 11 bits; raised to A-1 as Furnace saturates it)'); n = LOWEST_11BIT_NOTE; }
              if (n < 1 || n > 96) { lossy.add('note outside FamiStudio range C-1..B-8 (clamped)'); n = Math.max(1, Math.min(96, n)); }
              rowByte = n >= 13 && n <= 75 ? [n - 12] : [0x40, n];
            }
          }
        }
        if (ops.length || rowByte) { flush(); out.push(...ops); if (rowByte) out.push(...rowByte); else empty = 1; }
        else { empty++; }
        if (empty === MAX_EMPTY) flush();
      }
    }
    flush();
    out.push(0x42, 0, 0);
    fx.push([out.length - 2, loopAt]);
    streams.push(out); fixups.push(fx); channelsWithNotes.push(hasNotes); firstNotes.push(first); firstNoteFrames.push(firstFrame);
  }

  // Instrument envelopes.
  const envKey = new Map<string, number>();
  const envs: number[][] = [];
  const envId = (bytes: number[]): number => {
    const k = bytes.join(',');
    if (!envKey.has(k)) { envKey.set(k, envs.length); envs.push(bytes); }
    return envKey.get(k)!;
  };
  const insEnvs: number[][] = [];
  for (const [fi] of [...insMap].sort((a, b) => a[1] - b[1])) {
    const ins = m.instruments[fi];
    const pick = (code: number): FurnaceMacro | undefined => ins?.macros.find((x) => x.code === code && x.length > 0);
    const slot = (code: number, kind: 'vol' | 'arp' | 'duty' | 'pitch'): number => {
      const mac = pick(code);
      return envId(mac ? macroEnvelope(mac, kind, lossy) : DEFAULT_ENV[kind]);
    };
    insEnvs.push([slot(MACRO_VOL, 'vol'), slot(MACRO_ARP, 'arp'), slot(MACRO_DUTY, 'duty'), slot(MACRO_PITCH, 'pitch')]);
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
      lossy.add('PCM sample converted to DPCM (no resampling)');
      const lv = [...smp.data].slice(0, smp.length).map((v) => (smp.depth === 16 ? (v + 32768) >> 9 : smp.data instanceof Uint8Array ? v >> 1 : (v + 128) >> 1));
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
  const base = 0x8000;
  const headerLen = 1 + 2 + 2 + CHANNELS * 2 + 4;
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
  for (let c = 0; c < CHANNELS; c++) w16(5 + c * 2, streamAddr[c]);
  const hz = s.hz > 0 ? s.hz : 60;
  if (Math.abs(hz - 60) > 0.5) lossy.add(`tick rate ${hz} Hz approximated with FamiTracker tempo`);
  const tempo = FT_TEMPO * hz / 60;
  w16(5 + CHANNELS * 2, Math.round(256 * tempo / (50 * 60 / 24)));
  w16(7 + CHANNELS * 2, Math.round(256 * tempo / (60 * 60 / 24)));
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
  });
  return { music, dpcm: Uint8Array.from(dpcm), lossy: lossy.list(), channelsWithNotes, firstNotes, firstNoteFrames };
}

/** Patch the converted song into the NROM player image (public/nes/famistudio/player.nes). */
export function buildFamistudioRom(player: Uint8Array, meta: FamistudioMeta, song: FamistudioSong): Uint8Array {
  if (song.music.length > meta.musicCap) throw new Error(`song data ${song.music.length} bytes > ${meta.musicCap}`);
  if (song.dpcm.length > meta.dpcmCap) throw new Error(`DPCM ${song.dpcm.length} bytes > ${meta.dpcmCap}`);
  const rom = player.slice();
  rom.set(song.music, meta.prgOffset + meta.musicAddr - 0x8000);
  rom.set(song.dpcm, meta.prgOffset + meta.dpcmAddr - 0x8000);
  return rom;
}
