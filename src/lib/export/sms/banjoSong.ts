// Furnace song -> Banjo (Joe Kennedy, MIT, third-party/banjo) song data for one SN76489.
// Byte-for-byte port of the SN76489 path of third-party/banjo/json2sms.py, with labels
// resolved to absolute Z80 addresses so the result drops into the prebuilt player.
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import { Lossy } from '../md/mdsSong';
import { expandProcMacro } from '../nes/famistudioSong';

/** Driver routine addresses the song header points at (from public/sms/player.json). */
export interface BanjoLayout {
  song_data: number;
  banjo_init_sn: number;
  banjo_update_channels_sn: number;
  banjo_mute_channel_sn: number;
  banjo_mute_all_sn: number;
  banjo_song_stop: number;
  /** ROM file offset of song_data (bank * 0x4000 + window offset). */
  song_rom: number;
  /** ROM file offset of the player's song tick-rate byte. */
  song_hz: number;
  /** ROM file offset of the driver's SN76489 period table (sn_tone_lookup: 12 semitones x 16 fine steps, from A = 110 Hz). */
  sn_tone_rom: number;
  /** ROM file offsets of the player screen text blocks (tools/sms-player/screen.asm): 21, 27 and 256 bytes. */
  scr_title_rom: number;
  scr_author_rom: number;
  scr_scroll_rom: number;
}

/** hz: the whole-number tick rate the player steps the song at (it spreads the ticks over the console's 50 or 60 Hz frames).
 *  tune: the song's tuning left after whole-semitone transposition, in semitones (0 <= tune < 1); smsRom.ts retunes the period table by it. */
export interface BanjoSong { bytes: Uint8Array; lossy: string[]; hz: number; tune: number }

/** The player's byte accumulator holds frame rate + tick rate, so the tick rate tops out here. */
const MAX_HZ = 195;

const SMS_FILE_ID = 0x03;
export function banjoSystemsSupported(sys: readonly number[]): boolean {
  return sys.length === 1 && sys[0] === SMS_FILE_ID;
}

const MAGIC = 0xba, BANJO_HAS_SN = 0x01, CHANNELS = 4, FLAGS_LOOP = 2;
const NOTE_OFF = 0x01, INSTRUMENT_CHANGE = 0x02, SN_NOISE_MODE = 0x05, SLIDE_UP = 0x06, SLIDE_DOWN = 0x07, SLIDE_PORTA = 0x08,
  SLIDE_OFF = 0x09, ARPEGGIO = 0x0a, ARPEGGIO_OFF = 0x0b, VIBRATO = 0x0c, VIBRATO_OFF = 0x0d, LEGATO_ON = 0x0e, LEGATO_OFF = 0x0f,
  GAME_GEAR_PAN = 0x10, ORDER_JUMP = 0x19, SET_SPEED_1 = 0x1a, SET_SPEED_2 = 0x1b, ORDER_NEXT = 0x1c, NOTE_DELAY = 0x1d,
  NOTE_RELEASE = 0x1e, VOLUME_CHANGE = 0x20, END_LINE = 0x40, NOTE_ON = 0x80;
const FLAG_VOLUME_MACRO = 0x08, FLAG_ARP_MACRO = 0x04, FLAG_EX_MACRO = 0x80;
const MACRO_VOLUME = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_PITCH = 4;
const EX_TYPE: Record<number, number> = { 0: 0x02, 1: 0x40, 2: 0x20, 3: 0x10, 4: 0x01, 5: 0 };
const HANDLED_EFFECTS = new Set([0x20, 0x00, 0x01, 0x02, 0x03, 0x04, 0xe1, 0xe2, 0xea, 0x80, 0x08, 0x0b, 0x0d, 0x09, 0x0f, 0xed, 0xec]);
const NONE = 0xff;

interface Seq { code: number; data: number[]; length: number; loop: number; release: number; speed: number; delay: number }

/** Furnace macro as a plain step sequence; ADSR / LFO macros (type bits 1-2) run through the shared Furnace state machine. */
function toSeq(raw: FurnaceMacro, version: number): Seq {
  const m = expandProcMacro(raw, version);
  const loop = m.loop >= 0 && m.loop < m.length ? m.loop : NONE;
  const release = m.release >= 0 && m.release < 255 ? m.release : NONE;
  return { code: m.code, data: m.data.slice(0, m.length), length: m.length, loop, release, speed: Math.max(1, m.speed), delay: m.delay };
}

function stepped(s: Seq, data: number[]): { body: number[]; delay: number[] } {
  const body: number[] = [];
  for (const v of data) for (let k = 0; k < s.speed; k++) body.push(v);
  return { body, delay: new Array<number>(s.delay).fill(body[0] ?? 0) };
}

function volumeMacro(s: Seq): number[] {
  const { body, delay } = stepped(s, s.data.map((v) => 15 - (v & 15)));
  let susLoop = s.loop !== NONE ? s.loop * s.speed + s.delay + 4 : 0;
  let susLen = s.length * s.speed + s.delay + 4;
  let relLoop = susLoop, relLen = susLen;
  if (s.release !== NONE) {
    relLen = susLen;
    susLen = s.release * s.speed + s.delay + 5;
    if (s.loop === NONE) { relLoop = 0; susLoop = susLen - 1; }
    else if (s.loop < s.release) relLoop = 0;
    else { relLoop = susLoop; susLoop = susLen - 1; }
  }
  return [susLen, susLoop, relLen, relLoop, ...delay, ...body];
}

function shortMacro(s: Seq, data: number[]): number[] {
  const { body, delay } = stepped(s, data);
  const loop = s.loop !== NONE ? s.loop * s.speed + s.delay + 1 : 0;
  return [s.length * s.speed + s.delay + 2, loop, ...delay, ...body];
}

interface InsOut { flags: number; vol: number[] | null; arp: number[] | null; exType: number; ex: number[] | null }

function convertInstrument(ins: FurnaceInstrument, version: number, linear: boolean, lossy: Lossy): InsOut {
  const out: InsOut = { flags: 0, vol: null, arp: null, exType: 0, ex: null };
  for (const m of ins.macros) {
    if (m.length <= 0) continue;
    const s = toSeq(m, version);
    if (s.length === 0) continue;
    if (s.code === MACRO_VOLUME) out.vol = volumeMacro(s);
    else if (s.code === MACRO_ARP) out.arp = shortMacro(s, s.data.map((v) => (v & 0x7f) | ((Math.abs(v) >> 23) & 0x80)));
    else if (out.ex === null) {
      out.exType = EX_TYPE[s.code] ?? s.code;
      let data = s.data;
      // Linear pitch: Furnace counts 1/128 semitone, Banjo adds a signed byte to the note in 1/256 semitone, both up = higher.
      // Non-linear pitch moves the period, which has no note-domain equivalent: json2sms's negated value stays.
      if (s.code === MACRO_PITCH) data = data.map((v) => (linear ? Math.max(-128, Math.min(127, 2 * v)) : -Math.max(-128, Math.min(255, v))));
      if (s.code === MACRO_DUTY) {
        const { body, delay } = stepped(s, data);
        for (let j = 0; j < body.length; j++) if (j === 0 || body[j] !== (body[j - 1] & 0x7f)) body[j] |= 0x80;
        if (delay.length) delay[0] |= 0x80;
        const loop = s.loop !== NONE ? s.loop * s.speed + s.delay + 1 : 0;
        out.ex = [s.length * s.speed + s.delay + 2, loop, ...delay, ...body];
      } else out.ex = shortMacro(s, data);
    } else lossy.add(`second extra macro (code ${s.code}) on one instrument`);
  }
  if (out.vol) out.flags |= FLAG_VOLUME_MACRO;
  if (out.arp) out.flags |= FLAG_ARP_MACRO;
  if (out.ex) out.flags |= FLAG_EX_MACRO;
  return out;
}

const SN_CLOCK = 3579545;

/** Driver period of Banjo note b: sn_tone_lookup (A = 110 Hz at note 9, retuned by tune) halved per octave. */
function banjoPeriod(b: number, tune: number): number {
  const k = b - 9, o = Math.floor(k / 12);
  return Math.round(SN_CLOCK / 32 / (110 * 2 ** ((k - 12 * o + tune) / 12))) >> o;
}

/** Pitched noise (20xy with x = 1) takes tone 3's period. Furnace computes it with the noise divider (60 on TI chip types,
 *  64 on Sega) and, on linear-pitch songs, its "easy noise" ramp (period 16, 15, ... one per semitone above a threshold);
 *  Banjo runs the note through its tone table. Pick the Banjo note whose period is nearest Furnace's (sms.cpp snCalcFreq). */
export function pitchedNoiseNote(m: FurnaceModule, linear: boolean, tuneSemis: number, tune: number): (nv: number) => number {
  const flags = m.chipFlags?.[0] ?? '';
  const chipType = Number(/chipType=(\d+)/.exec(flags)?.[1] ?? 0);
  // sms.cpp setFlags: 60 on every TI type (SN94624 / SN76494 run clock/8 with divider 7.5, the same ratio), 64 on Sega (0) and Game Gear (3).
  const noiseDiv = chipType >= 1 && chipType <= 9 && chipType !== 3 ? 60 : 64;
  const easy = !/noEasyNoise=true/.test(flags);
  const tuning = m.tuning || 440;
  const thr = Math.round(128 * 12 * Math.log2(SN_CLOCK / (16 * noiseDiv) / (0.0625 * tuning))) - 384 + 64 + 60 * 128;
  return (nv) => {
    const cur = (nv + 60) * 128;
    const want = linear && easy && cur > thr
      ? Math.max(1, (2048 - (cur - thr)) >> 7)
      : Math.min(1023, SN_CLOCK / 32 / (110 * 2 ** ((nv + tuneSemis - 9) / 12)) * 64 / noiseDiv);
    let best = 9;
    for (let b = 9; b < 128; b++) {
      if (Math.abs(Math.log(Math.max(1, banjoPeriod(b, tune)) / want)) < Math.abs(Math.log(Math.max(1, banjoPeriod(best, tune)) / want))) best = b;
    }
    return best;
  };
}

/** Driver noise mode while a noise-channel pattern converts: bit 1 = tone 3 pitch, bit 0 = white (Banjo and Furnace start at 3). */
interface NoiseState { mode: number; note: (nv: number) => number }

/** One channel pattern as Banjo commands (json2sms pattern loop, SN76489 channel). */
export function convertPattern(
  cellAt: (r: number) => { note: number; octave: number; instrument: number; volume: number; effects: { type: number; value: number }[] } | undefined,
  rows: number, sub: number, tb1: number, nIns: number, transpose: number, lossy: Lossy, noise?: NoiseState,
): number[] {
  const out: number[] = [];
  // curNote: the Banjo note the channel last keyed or slid to (-1 = none yet in this pattern); legato: EAxx state in this pattern.
  let curIns = -1, curVol = -1, lastWasEnd = false, curNote = -1, legato = false;
  const push = (...b: number[]) => { out.push(...b.map((x) => x & 0xff)); lastWasEnd = false; };
  for (let r = 0; r < rows; r++) {
    const cell = cellAt(r);
    const fx = (cell?.effects ?? []).filter((e) => e.type >= 0).map((e) => ({ type: e.type, value: e.value < 0 ? 0 : e.value }));
    if (cell && cell.instrument !== -1 && cell.instrument !== curIns) {
      curIns = cell.instrument;
      if (curIns < nIns) push(INSTRUMENT_CHANGE, curIns);
    }
    for (const { type: t, value: v } of fx) {
      if (t === 0x20) {
        const mode = (v & 1) | ((v & 0x10) >> 3);
        if (noise) noise.mode = mode;
        push(SN_NOISE_MODE, mode);
      }
      else if (t === 0x00) { if (v) push(ARPEGGIO, v); else push(ARPEGGIO_OFF); }
      else if (t === 0x01 || t === 0x02 || t === 0x03) { if (v) push(t === 0x01 ? SLIDE_UP : t === 0x02 ? SLIDE_DOWN : SLIDE_PORTA, v); else push(SLIDE_OFF); }
      else if (t === 0x04) {
        const speed = v >> 4, amount = v & 0x0f;
        if (speed && amount) push(VIBRATO, speed | (amount << 4)); else push(VIBRATO_OFF);
      } else if (t === 0xea) { legato = v > 0; push(legato ? LEGATO_ON : LEGATO_OFF); }
      else if (t === 0x80 || t === 0x08) {
        const left = t === 0x80 ? (v > 0x80 ? 0 : 1) << (sub + 4) : (v & 0xf0 ? 1 : 0) << (sub + 4);
        // json2sms compares the whole 08xy byte with 0x0f for the right side; kept as written so the driver hears what Banjo's own tool emits.
        const right = t === 0x80 ? (v < 0x80 ? 0 : 1) << sub : (v < 0x0f ? 1 : 0) << sub;
        const mask = ~(1 << sub) & 0x0f;
        push(GAME_GEAR_PAN, left | right, mask | (mask << 4));
      } else if (t === 0x0b) push(ORDER_JUMP, v);
      else if (t === 0x0d) push(ORDER_NEXT);
      else if (t === 0x09) { if (v) push(SET_SPEED_1, v * tb1); }
      else if (t === 0x0f) { if (v) push(SET_SPEED_2, v * tb1); }
      else if (t === 0xed) push(NOTE_DELAY, v * tb1);
      else if (!HANDLED_EFFECTS.has(t)) lossy.add(`effect ${t.toString(16).toUpperCase().padStart(2, '0')}xx (not in Banjo)`);
    }
    if (cell && cell.volume !== -1 && cell.volume !== curVol) { push(VOLUME_CHANGE | Math.min(15, cell.volume)); curVol = cell.volume; }
    const nv = cell ? convertFurnaceNoteValue(cell) : -1;
    if (nv >= 0 && nv < 253) { curNote = Math.max(0, noise ? (noise.mode & 2 ? noise.note(nv) : nv) : nv + transpose) & 0x7f; push(NOTE_ON | curNote); }
    else if (nv === 253) push(NOTE_OFF);
    else if (nv === 254 || nv === 255) push(NOTE_RELEASE);
    for (const { type: t, value: v } of fx) {
      if (t === 0xec) push(NOTE_DELAY, v, NOTE_OFF);
      // E1xy / E2xy (Furnace playback.cpp): portamento at speed x*4 (03xx units) from the current note to y semitones up / down,
      // after this row's note. Banjo has no shorthand slide: SLIDE_PORTA plus a legato note-on that only sets the porta target.
      else if (t === 0xe1 || t === 0xe2) {
        if (!(v & 0x0f) || !(v >> 4)) { push(SLIDE_OFF); continue; }
        if (curNote < 0 || noise) { lossy.add(`effect ${t.toString(16).toUpperCase()}xx ${noise ? 'on the noise channel' : 'before any note in its pattern'}`); continue; }
        // shortcut: the next E1/E2 slides from this target even if the slide has not arrived yet (Furnace uses the old note then).
        curNote = Math.min(0x7f, Math.max(0, curNote + (t === 0xe1 ? 1 : -1) * (v & 0x0f)));
        push(SLIDE_PORTA, (v >> 4) * 4);
        if (!legato) push(LEGATO_ON);
        push(NOTE_ON | curNote);
        if (!legato) push(LEGATO_OFF);
      }
    }
    // End of line: merge with a directly preceding end-line while its wait fits in 6 bits.
    if (lastWasEnd && (out[out.length - 1] & 0x3f) < 0x3f) out[out.length - 1]++;
    else { out.push(END_LINE); lastWasEnd = true; }
  }
  return out;
}

export function furnaceToBanjo(m: FurnaceModule, subsong: number, layout: BanjoLayout): BanjoSong {
  if (!banjoSystemsSupported(m.systems)) {
    throw new Error(`Banjo export needs a Master System song (one SN76489); systems are ${m.systems.map((x) => x.toString(16)).join(',')}`);
  }
  const lossy = new Lossy();
  const s = m.subsongs[subsong];
  const tb1 = (s.timeBase ?? 0) + 1;
  if (s.speedPattern && s.speedPattern.length > 2) lossy.add(`speed pattern of ${s.speedPattern.length} steps (first two kept)`);
  const speed1 = s.speedPattern?.length ? s.speedPattern[0] : s.speed1;
  const speed2 = s.speedPattern?.length ? (s.speedPattern[1] ?? s.speedPattern[0]) : s.speed2;
  // Banjo's SN table is fixed at A4 = 440 Hz: a song tuned elsewhere moves by whole semitones, the rest is reported.
  // Whole semitones move the notes; the rest (0..1 semitone, always raising pitch so periods stay in 10 bits) retunes the period table.
  const tuneSemis = 12 * Math.log2((m.tuning || 440) / 440), transpose = Math.floor(tuneSemis + 1e-9);
  const tune = Math.max(0, tuneSemis - transpose);
  const hz = Math.max(1, Math.min(MAX_HZ, Math.round(s.hz)));
  if (Math.abs(hz - s.hz) > 0.1) lossy.add(`tick rate ${s.hz} Hz played at ${hz} Hz`);
  const ordersLen = s.ordersLen;
  if (ordersLen > 255 || s.patLen > 255) throw new Error('Banjo export: more than 255 orders or rows per pattern');

  const linear = Number(m.compatFlags?.linearPitch ?? 2) > 0;
  const instruments = m.instruments.map((ins) => convertInstrument(ins, m.version, linear, lossy));
  const cellAt = (ch: number, pat: number, r: number) => m.patterns.get(`${subsong}_${ch}_${pat}`)?.rows[r];

  // Layout (json2sms order): header, mute-call table, macros, instruments, order pointers, order rows, patterns.
  const HEADER = 34; // sizeof music_state (banjo_defines_wladx.inc)
  const base = layout.song_data;
  const muteTable = base + HEADER;
  let at = muteTable + CHANNELS * 2;
  const blobs: number[][] = [];
  const place = (b: number[]) => { const a = at; blobs.push(b); at += b.length; return a; };
  const insPtrs = instruments.map((i) => ({
    vol: i.vol ? place(i.vol) : 0xffff,
    arp: i.arp ? place(i.arp) : 0xffff,
    ex: i.ex ? place(i.ex) : 0xffff,
  }));
  const instrumentData = at;
  const insBytes: number[] = [];
  instruments.forEach((i, n) => {
    const p = insPtrs[n];
    insBytes.push(i.flags, p.vol & 0xff, p.vol >> 8, p.arp & 0xff, p.arp >> 8, i.exType, p.ex & 0xff, p.ex >> 8, 0xff, 0xff, 0xff, 0xff);
  });
  place(insBytes);
  const orderPtrs = at;
  at += ordersLen * 2;
  const orderRowsAt = at;
  at += ordersLen * CHANNELS * 2;

  const patAddr = new Map<string, number>();
  const patBlobs: number[][] = [];
  // Noise-channel notes depend on the noise mode the pattern starts in, so that pattern converts once per start mode, walked in
  // order. shortcut: 20xy only; a duty macro that switches the mode is not followed, upgrade if a song needs it.
  const orderKeys: string[][] = [];
  const noise: NoiseState = { mode: 3, note: pitchedNoiseNote(m, linear, tuneSemis, tune) };
  for (let ch = 0; ch < CHANNELS; ch++) {
    orderKeys[ch] = [];
    for (let o = 0; o < ordersLen; o++) {
      const pat = s.orders[ch]?.[o] ?? 0;
      const startMode = noise.mode;
      const key = ch === 3 ? `${ch}_${pat}_${startMode}` : `${ch}_${pat}`;
      orderKeys[ch][o] = key;
      const b = convertPattern((r) => cellAt(ch, pat, r), s.patLen, ch, tb1, instruments.length, ch < 3 ? transpose : 0, lossy, ch === 3 ? noise : undefined);
      if (patAddr.has(key)) continue;
      patAddr.set(key, at);
      patBlobs.push(b);
      at += b.length;
    }
  }

  const w16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const header = [
    MAGIC, 1, CHANNELS, FLAGS_LOOP, 0, 0, BANJO_HAS_SN, 0xff, 0xff,
    tb1, speed1 * tb1, speed2 * tb1, s.patLen, ordersLen,
    ...w16(instrumentData), ...w16(orderPtrs),
    speed1 * tb1, s.patLen, 0, 0xff, 0, 0xff,
    ...w16(layout.banjo_init_sn), ...w16(layout.banjo_update_channels_sn), ...w16(muteTable),
    ...w16(layout.banjo_mute_all_sn), ...w16(layout.banjo_song_stop),
  ];
  if (header.length !== HEADER) throw new Error(`Banjo header is ${header.length} bytes, expected ${HEADER}`);
  const out: number[] = [...header];
  for (let c = 0; c < CHANNELS; c++) out.push(...w16(layout.banjo_mute_channel_sn));
  for (const b of blobs) out.push(...b);
  for (let o = 0; o < ordersLen; o++) out.push(...w16(orderRowsAt + o * CHANNELS * 2));
  for (let o = 0; o < ordersLen; o++) for (let ch = 0; ch < CHANNELS; ch++) out.push(...w16(patAddr.get(orderKeys[ch][o]) ?? 0));
  for (const b of patBlobs) out.push(...b);
  if (base + out.length !== at) throw new Error('Banjo layout mismatch');
  return { bytes: Uint8Array.from(out.map((x) => x & 0xff)), lossy: lossy.list(), hz, tune };
}
