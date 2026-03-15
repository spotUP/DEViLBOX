/**
 * S98Parser.ts — S98 FM register dump format parser
 *
 * Supports S98 v0/v1/v2/v3 files used for Japanese computer FM music
 * (PC-88, PC-98, MSX). Detects chip types from the device table,
 * reconstructs note events from register writes, and builds a TrackerSong
 * with instruments per detected chip.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

// ── Frequency-to-note conversion ──────────────────────────────────────────────

function freqToMidi(freq: number): number {
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}

/** YM2612/OPN F-number + block → MIDI note. */
function opnFnumToNote(fnum: number, block: number, clock: number): number {
  const freq = fnum * clock / (144 * (1 << (21 - block)));
  return freqToMidi(freq);
}

/** AY/YM2149/SSG period → MIDI note. clock / (16 * period) */
function ayPeriodToNote(period: number, clock: number): number {
  if (period <= 0) return 0;
  return freqToMidi(clock / (16 * period));
}

/** SN76489 10-bit counter → MIDI note. */
function sn76489CounterToNote(counter: number, clock: number): number {
  if (counter <= 0) return 0;
  return freqToMidi(clock / (32 * counter));
}

/** OPL F-number + block → MIDI note. freq = fnum * clock / (72 * 2^(20-block)) */
function oplFnumToNote(fnum: number, block: number, clock: number): number {
  const freq = fnum * clock / (72 * (1 << (20 - block)));
  return freqToMidi(freq);
}

// YM2151 KC nibble → semitone offset from C (C is at nibble value 14→0)
const KC_TO_SEMITONE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0] as const;

/** YM2151 key code → MIDI note. */
function opmKeyCodeToNote(kc: number): number {
  const octave = (kc >> 4) & 0x07;
  const kcNote = Math.min(kc & 0x0F, 11);
  const semi = KC_TO_SEMITONE[kcNote];
  return Math.max(1, Math.min(96, octave * 12 + semi + 12));
}

// ── S98 Device Types ──────────────────────────────────────────────────────────

const S98_DEVICE_NONE     = 0;
const S98_DEVICE_YM2149   = 1;
const S98_DEVICE_YM2203   = 2;
const S98_DEVICE_YM2612   = 3;
const S98_DEVICE_YM2608   = 4;
const S98_DEVICE_YM2151   = 5;
const S98_DEVICE_YM2413   = 6;
const S98_DEVICE_YM3526   = 7;
const S98_DEVICE_YM3812   = 8;
const S98_DEVICE_YMF262   = 9;
const S98_DEVICE_AY8910   = 15;
const S98_DEVICE_SN76489  = 16;

interface S98Device {
  type: number;
  clock: number;
  pan: number;
}

// ── S98 Header ────────────────────────────────────────────────────────────────

interface S98Header {
  version: number;
  timerNumerator: number;
  timerDenominator: number;
  tagOffset: number;
  dataOffset: number;
  loopOffset: number;
  devices: S98Device[];
  tickInterval: number; // seconds per tick
}

function parseS98Header(buf: Uint8Array): S98Header {
  if (buf.length < 32) throw new Error('File too small for S98 header');

  const magic = String.fromCharCode(buf[0], buf[1], buf[2]);
  if (magic !== 'S98') throw new Error('Not a valid S98 file');

  const versionChar = String.fromCharCode(buf[3]);
  const version = parseInt(versionChar, 10) || 0;

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let timerNum = dv.getUint32(4, true);
  let timerDen = dv.getUint32(8, true);
  if (timerNum === 0) timerNum = 10;
  if (timerDen === 0) timerDen = 1000;
  const tickInterval = timerNum / timerDen;

  /* compression field — always 0, reserved */
  // const _compression = dv.getUint32(12, true);
  const tagOffset = dv.getUint32(16, true);
  let dataOffset = dv.getUint32(20, true);
  const loopOffset = dv.getUint32(24, true);

  const devices: S98Device[] = [];

  if (version >= 3) {
    // V3: device info table starting at offset 28, each entry 16 bytes
    let off = 28;
    while (off + 16 <= buf.length) {
      const devType = dv.getUint32(off, true);
      if (devType === S98_DEVICE_NONE) break; // end of table
      const clock = dv.getUint32(off + 4, true);
      const pan = dv.getUint32(off + 8, true);
      devices.push({ type: devType, clock, pan });
      off += 16;
    }
  } else if (version === 2) {
    // V2: device count at offset 28, device entries at offset 32+
    const deviceCount = dv.getUint32(28, true);
    let off = 32;
    for (let i = 0; i < deviceCount && off + 16 <= buf.length; i++) {
      const devType = dv.getUint32(off, true);
      const clock = dv.getUint32(off + 4, true);
      const pan = dv.getUint32(off + 8, true);
      devices.push({ type: devType, clock, pan });
      off += 16;
    }
  }
  // V0/V1: no device table

  // Default device for v0/v1 or empty table
  if (devices.length === 0) {
    devices.push({ type: S98_DEVICE_YM2149, clock: 4000000, pan: 0 });
  }

  // If data offset is 0, it starts right after the header
  if (dataOffset === 0) {
    if (version >= 3) {
      // After device table
      dataOffset = 28 + (devices.length + 1) * 16; // +1 for ENDOFTABLE sentinel
    } else if (version === 2) {
      dataOffset = 32 + devices.length * 16;
    } else {
      dataOffset = 32;
    }
  }

  return { version, timerNumerator: timerNum, timerDenominator: timerDen,
           tagOffset, dataOffset, loopOffset, devices, tickInterval };
}

// ── PSF Tag Parsing ───────────────────────────────────────────────────────────

interface S98Tags {
  title: string;
  artist: string;
  game: string;
  year: string;
  comment: string;
}

function parseTags(buf: Uint8Array, tagOffset: number): S98Tags {
  const tags: S98Tags = { title: '', artist: '', game: '', year: '', comment: '' };
  if (tagOffset === 0 || tagOffset >= buf.length) return tags;

  // Try to detect encoding: UTF-8 BOM (EF BB BF) or Shift-JIS
  let off = tagOffset;

  // Check for "[S98]" marker (5 bytes ASCII)
  const marker = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3], buf[off+4]);
  if (marker !== '[S98]') return tags;
  off += 5;

  // Skip optional line break after marker
  if (off < buf.length && buf[off] === 0x0A) off++;
  else if (off + 1 < buf.length && buf[off] === 0x0D && buf[off+1] === 0x0A) off += 2;

  // Decode the rest as UTF-8 (most modern S98 files) with fallback
  const remaining = buf.slice(off);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(remaining);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(remaining);
  }

  // Parse key=value pairs separated by newlines
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();
    if (!val) continue;
    switch (key) {
      case 'title': tags.title = val; break;
      case 'artist': tags.artist = val; break;
      case 'game': tags.game = val; break;
      case 'year': tags.year = val; break;
      case 'comment': tags.comment = val; break;
    }
  }
  return tags;
}

// ── Instrument Builder ────────────────────────────────────────────────────────

interface DeviceLayout {
  /** Index into the instruments array for this device */
  instIdx: number;
  /** Starting output channel index for this device */
  chStart: number;
  /** Number of output channels for this device */
  numChannels: number;
  /** Device type (S98_DEVICE_*) */
  type: number;
  /** Device clock */
  clock: number;
}

interface InstrumentLayout {
  instruments: InstrumentConfig[];
  deviceLayouts: DeviceLayout[];
  totalChannels: number;
}

function deviceChannelCount(type: number): number {
  switch (type) {
    case S98_DEVICE_YM2149:  return 3;          // 3 SSG
    case S98_DEVICE_YM2203:  return 6;          // 3 FM + 3 SSG
    case S98_DEVICE_YM2612:  return 6;          // 6 FM
    case S98_DEVICE_YM2608:  return 11;         // 6 FM + 3 SSG + rhythm + ADPCM
    case S98_DEVICE_YM2151:  return 8;          // 8 FM
    case S98_DEVICE_YM2413:  return 9;          // 9 FM (or 6 FM + 5 rhythm)
    case S98_DEVICE_YM3526:  return 9;          // 9 FM
    case S98_DEVICE_YM3812:  return 9;          // 9 FM
    case S98_DEVICE_YMF262:  return 18;         // 18 FM
    case S98_DEVICE_AY8910:  return 3;          // 3 SSG
    case S98_DEVICE_SN76489: return 4;          // 3 tone + 1 noise
    default: return 3;
  }
}

function deviceName(type: number): string {
  switch (type) {
    case S98_DEVICE_YM2149:  return 'YM2149 SSG';
    case S98_DEVICE_YM2203:  return 'YM2203 OPN';
    case S98_DEVICE_YM2612:  return 'YM2612 OPN2';
    case S98_DEVICE_YM2608:  return 'YM2608 OPNA';
    case S98_DEVICE_YM2151:  return 'YM2151 OPM';
    case S98_DEVICE_YM2413:  return 'YM2413 OPLL';
    case S98_DEVICE_YM3526:  return 'YM3526 OPL';
    case S98_DEVICE_YM3812:  return 'YM3812 OPL2';
    case S98_DEVICE_YMF262:  return 'YMF262 OPL3';
    case S98_DEVICE_AY8910:  return 'AY-3-8910';
    case S98_DEVICE_SN76489: return 'SN76489';
    default: return `Device ${type}`;
  }
}

function deviceSynthType(type: number): InstrumentConfig['synthType'] {
  switch (type) {
    case S98_DEVICE_YM2149:  return 'FurnaceAY';
    case S98_DEVICE_YM2203:  return 'FurnaceOPN2203';
    case S98_DEVICE_YM2612:  return 'FurnaceOPN';
    case S98_DEVICE_YM2608:  return 'FurnaceOPNA';
    case S98_DEVICE_YM2151:  return 'FurnaceOPM';
    case S98_DEVICE_YM2413:  return 'FurnaceOPLL';
    case S98_DEVICE_YM3526:  return 'FurnaceOPL';
    case S98_DEVICE_YM3812:  return 'FurnaceOPL';
    case S98_DEVICE_YMF262:  return 'FurnaceOPL';
    case S98_DEVICE_AY8910:  return 'FurnaceAY';
    case S98_DEVICE_SN76489: return 'FurnacePSG';
    default: return 'FurnaceAY';
  }
}

function deviceChipType(type: number): number {
  switch (type) {
    case S98_DEVICE_YM2149:  return 6;
    case S98_DEVICE_YM2203:  return 1;
    case S98_DEVICE_YM2612:  return 1;
    case S98_DEVICE_YM2608:  return 1;
    case S98_DEVICE_YM2151:  return 33;
    case S98_DEVICE_YM2413:  return 13;
    case S98_DEVICE_YM3526:  return 14;
    case S98_DEVICE_YM3812:  return 14;
    case S98_DEVICE_YMF262:  return 14;
    case S98_DEVICE_AY8910:  return 6;
    case S98_DEVICE_SN76489: return 0;
    default: return 6;
  }
}

function deviceOps(type: number): number {
  switch (type) {
    case S98_DEVICE_YM2149:
    case S98_DEVICE_AY8910:
    case S98_DEVICE_SN76489:
      return 2;
    case S98_DEVICE_YM2413:
    case S98_DEVICE_YM3526:
    case S98_DEVICE_YM3812:
    case S98_DEVICE_YMF262:
      return 2;
    default:
      return 4;
  }
}

function buildInstruments(devices: S98Device[]): InstrumentLayout {
  const instruments: InstrumentConfig[] = [];
  const deviceLayouts: DeviceLayout[] = [];
  let nextId = 1;
  let nextCh = 0;

  for (let i = 0; i < devices.length; i++) {
    const dev = devices[i];
    const instIdx = instruments.length;
    const chCount = deviceChannelCount(dev.type);

    instruments.push({
      id: nextId++,
      name: deviceName(dev.type),
      type: 'synth',
      synthType: deviceSynthType(dev.type),
      furnace: { ...DEFAULT_FURNACE, chipType: deviceChipType(dev.type), ops: deviceOps(dev.type) } as FurnaceConfig,
      effects: [],
      volume: 0,
      pan: 0,
    });

    deviceLayouts.push({
      instIdx,
      chStart: nextCh,
      numChannels: chCount,
      type: dev.type,
      clock: dev.clock,
    });

    nextCh += chCount;
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'SSG', type: 'synth', synthType: 'FurnaceAY',
      furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 } as FurnaceConfig,
      effects: [], volume: 0, pan: 0,
    });
    deviceLayouts.push({ instIdx: 0, chStart: 0, numChannels: 3, type: S98_DEVICE_YM2149, clock: 4000000 });
    nextCh = 3;
  }

  return { instruments, deviceLayouts, totalChannels: Math.max(nextCh, 1) };
}

// ── S98 Command Walker ────────────────────────────────────────────────────────

interface NoteEvent { tick: number; ch: number; note: number; on: boolean; instIdx: number; }

// Per-device chip state for register tracking
interface OPNState {
  fnumLo: Uint8Array;   // F-number low per FM channel
  fnumHi: Uint8Array;   // Block + F-number high per FM channel
  keyOn: Uint8Array;    // Key-on state per FM channel
  ssgPeriodLo: Uint8Array;  // SSG period low (3 channels)
  ssgPeriodHi: Uint8Array;  // SSG period high (3 channels)
  ssgPlaying: Uint8Array;
}

interface OPMState {
  keyCode: Uint8Array;
  keyOn: Uint8Array;
}

interface AYState {
  periodLo: Uint8Array;
  periodHi: Uint8Array;
  playing: Uint8Array;
}

interface OPLState {
  fnumLo: Uint8Array;
  fnumHi: Uint8Array;   // block + fnum high + key-on bit
  keyOn: Uint8Array;
}

interface SNState {
  counter: Uint16Array;
  volume: Uint8Array;
  playing: Uint8Array;
  latchCh: number;
  latchTyp: number;
}

function walkCommands(
  buf: Uint8Array,
  dataOffset: number,
  loopOffset: number,
  layouts: DeviceLayout[],
  _tickInterval: number,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = dataOffset;
  let tick = 0;

  // Chip state arrays indexed by device index
  const opnStates: (OPNState | null)[] = layouts.map(l => {
    if (l.type === S98_DEVICE_YM2203 || l.type === S98_DEVICE_YM2608 || l.type === S98_DEVICE_YM2612) {
      const fmChs = l.type === S98_DEVICE_YM2612 ? 6 : (l.type === S98_DEVICE_YM2608 ? 6 : 3);
      return {
        fnumLo: new Uint8Array(fmChs),
        fnumHi: new Uint8Array(fmChs),
        keyOn: new Uint8Array(fmChs),
        ssgPeriodLo: new Uint8Array(3),
        ssgPeriodHi: new Uint8Array(3),
        ssgPlaying: new Uint8Array(3),
      };
    }
    return null;
  });

  const opmStates: (OPMState | null)[] = layouts.map(l =>
    l.type === S98_DEVICE_YM2151
      ? { keyCode: new Uint8Array(8), keyOn: new Uint8Array(8) }
      : null
  );

  const ayStates: (AYState | null)[] = layouts.map(l =>
    (l.type === S98_DEVICE_YM2149 || l.type === S98_DEVICE_AY8910)
      ? { periodLo: new Uint8Array(3), periodHi: new Uint8Array(3), playing: new Uint8Array(3) }
      : null
  );

  const oplStates: (OPLState | null)[] = layouts.map(l => {
    if (l.type === S98_DEVICE_YM2413 || l.type === S98_DEVICE_YM3526 ||
        l.type === S98_DEVICE_YM3812 || l.type === S98_DEVICE_YMF262) {
      const chs = l.type === S98_DEVICE_YMF262 ? 18 : 9;
      return { fnumLo: new Uint8Array(chs), fnumHi: new Uint8Array(chs), keyOn: new Uint8Array(chs) };
    }
    return null;
  });

  const snStates: (SNState | null)[] = layouts.map(l =>
    l.type === S98_DEVICE_SN76489
      ? { counter: new Uint16Array(4), volume: new Uint8Array(4).fill(15),
          playing: new Uint8Array(4), latchCh: 0, latchTyp: 0 }
      : null
  );

  // Prevent infinite loops: limit iterations (buf.length is a reasonable upper bound)
  const maxIterations = Math.min(buf.length * 2, 500_000);
  let iterations = 0;
  let looped = false;

  while (pos < buf.length && iterations++ < maxIterations) {
    const cmd = buf[pos++];

    // 0xFF: sync (wait 1 tick)
    if (cmd === 0xFF) {
      tick++;
      continue;
    }

    // 0xFE: sync-n (wait n+2 ticks)
    if (cmd === 0xFE) {
      if (pos + 4 > buf.length) break;
      const n = buf[pos] | (buf[pos+1] << 8) | (buf[pos+2] << 16) | ((buf[pos+3] << 24) >>> 0);
      pos += 4;
      tick += n + 2;
      continue;
    }

    // 0xFD: end of data / loop
    if (cmd === 0xFD) {
      if (loopOffset > 0 && !looped) {
        pos = loopOffset;
        looped = true;
        continue;
      }
      break;
    }

    // Device register write: cmd 0x00-0x7F
    if (cmd <= 0x7F) {
      if (pos + 2 > buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];

      const deviceIdx = cmd >> 1;
      const port = cmd & 1;

      if (deviceIdx >= layouts.length) continue;
      const layout = layouts[deviceIdx];

      // ── YM2612 (OPN2) ──────────────────────────────────────────────
      if (layout.type === S98_DEVICE_YM2612) {
        const st = opnStates[deviceIdx]!;
        const portBase = port === 1 ? 3 : 0;

        if (reg >= 0xA0 && reg <= 0xA2) {
          st.fnumLo[portBase + (reg - 0xA0)] = val;
        } else if (reg >= 0xA4 && reg <= 0xA6) {
          st.fnumHi[portBase + (reg - 0xA4)] = val;
        } else if (reg === 0x28 && port === 0) {
          const rawCh = val & 0x07;
          const ch = rawCh < 4 ? rawCh : rawCh - 1;
          if (ch < 6) {
            const on = (val & 0xF0) !== 0;
            if (on !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | ((st.fnumHi[ch] & 0x07) << 8);
              const block = (st.fnumHi[ch] >> 3) & 0x07;
              const note = opnFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
              st.keyOn[ch] = on ? 1 : 0;
            }
          }
        }
        continue;
      }

      // ── YM2203 (OPN) ───────────────────────────────────────────────
      if (layout.type === S98_DEVICE_YM2203) {
        const st = opnStates[deviceIdx]!;
        // FM part: 3 channels, port 0 only
        if (reg >= 0xA0 && reg <= 0xA2) {
          st.fnumLo[reg - 0xA0] = val;
        } else if (reg >= 0xA4 && reg <= 0xA6) {
          st.fnumHi[reg - 0xA4] = val;
        } else if (reg === 0x28) {
          const ch = val & 0x03;
          if (ch < 3) {
            const on = (val & 0xF0) !== 0;
            if (on !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | ((st.fnumHi[ch] & 0x07) << 8);
              const block = (st.fnumHi[ch] >> 3) & 0x07;
              const note = opnFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
              st.keyOn[ch] = on ? 1 : 0;
            }
          }
        }
        // SSG part: channels 3-5 (AY-compatible registers 0x00-0x0D)
        else if (reg <= 0x0D) {
          handleSSGWrite(reg, val, st, layout, deviceIdx, tick, events);
        }
        continue;
      }

      // ── YM2608 (OPNA) ──────────────────────────────────────────────
      if (layout.type === S98_DEVICE_YM2608) {
        const st = opnStates[deviceIdx]!;
        if (port === 0) {
          // Port 0: FM ch 0-2, SSG, rhythm
          if (reg >= 0xA0 && reg <= 0xA2) {
            st.fnumLo[reg - 0xA0] = val;
          } else if (reg >= 0xA4 && reg <= 0xA6) {
            st.fnumHi[reg - 0xA4] = val;
          } else if (reg === 0x28) {
            const rawCh = val & 0x07;
            const ch = rawCh < 4 ? rawCh : rawCh - 1;
            if (ch < 6) {
              const on = (val & 0xF0) !== 0;
              if (on !== (st.keyOn[ch] !== 0)) {
                const fnum = st.fnumLo[ch] | ((st.fnumHi[ch] & 0x07) << 8);
                const block = (st.fnumHi[ch] >> 3) & 0x07;
                const note = opnFnumToNote(fnum, block, layout.clock);
                events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
                st.keyOn[ch] = on ? 1 : 0;
              }
            }
          } else if (reg <= 0x0D) {
            // SSG registers (channels at FM offset + 6)
            handleSSGWrite(reg, val, st, layout, deviceIdx, tick, events);
          }
        } else {
          // Port 1: FM ch 3-5
          if (reg >= 0xA0 && reg <= 0xA2) {
            st.fnumLo[3 + (reg - 0xA0)] = val;
          } else if (reg >= 0xA4 && reg <= 0xA6) {
            st.fnumHi[3 + (reg - 0xA4)] = val;
          }
        }
        continue;
      }

      // ── YM2151 (OPM) ───────────────────────────────────────────────
      if (layout.type === S98_DEVICE_YM2151) {
        const st = opmStates[deviceIdx]!;
        if (reg >= 0x28 && reg <= 0x2F) {
          st.keyCode[reg - 0x28] = val;
        } else if (reg === 0x08) {
          const ch = val & 0x07;
          const on = (val & 0x78) !== 0;
          if (on !== (st.keyOn[ch] !== 0)) {
            const note = opmKeyCodeToNote(st.keyCode[ch]);
            events.push({ tick, ch: layout.chStart + ch, note, on, instIdx: layout.instIdx });
            st.keyOn[ch] = on ? 1 : 0;
          }
        }
        continue;
      }

      // ── YM2149 / AY-3-8910 (SSG) ──────────────────────────────────
      if (layout.type === S98_DEVICE_YM2149 || layout.type === S98_DEVICE_AY8910) {
        const st = ayStates[deviceIdx]!;
        if (reg === 0x00 || reg === 0x02 || reg === 0x04) {
          const ch = reg >> 1;
          st.periodLo[ch] = val;
          const period = st.periodLo[ch] | ((st.periodHi[ch] & 0x0F) << 8);
          if (period > 0 && st.playing[ch]) {
            const note = ayPeriodToNote(period, layout.clock);
            if (note > 0) {
              events.push({ tick, ch: layout.chStart + ch, note: 97, on: false, instIdx: layout.instIdx });
              events.push({ tick, ch: layout.chStart + ch, note, on: true, instIdx: layout.instIdx });
            }
          }
        } else if (reg === 0x01 || reg === 0x03 || reg === 0x05) {
          const ch = (reg - 1) >> 1;
          st.periodHi[ch] = val & 0x0F;
        } else if (reg === 0x08 || reg === 0x09 || reg === 0x0A) {
          const ch = reg - 0x08;
          const volume = val & 0x1F;
          if (volume > 0 && !st.playing[ch]) {
            const period = st.periodLo[ch] | ((st.periodHi[ch] & 0x0F) << 8);
            if (period > 0) {
              const note = ayPeriodToNote(period, layout.clock);
              if (note > 0) {
                events.push({ tick, ch: layout.chStart + ch, note, on: true, instIdx: layout.instIdx });
                st.playing[ch] = 1;
              }
            }
          } else if (volume === 0 && st.playing[ch]) {
            events.push({ tick, ch: layout.chStart + ch, note: 97, on: false, instIdx: layout.instIdx });
            st.playing[ch] = 0;
          }
        }
        continue;
      }

      // ── OPL / OPL2 / OPLL (YM3526 / YM3812 / YM2413) ─────────────
      if (layout.type === S98_DEVICE_YM3526 || layout.type === S98_DEVICE_YM3812 ||
          layout.type === S98_DEVICE_YM2413) {
        const st = oplStates[deviceIdx]!;
        if (reg >= 0xA0 && reg <= 0xA8) {
          const ch = reg - 0xA0;
          st.fnumLo[ch] = val;
        } else if (reg >= 0xB0 && reg <= 0xB8) {
          const ch = reg - 0xB0;
          st.fnumHi[ch] = val;
          const keyOn = (val & 0x20) !== 0;
          if (keyOn !== (st.keyOn[ch] !== 0)) {
            const fnum = st.fnumLo[ch] | ((val & 0x03) << 8);
            const block = (val >> 2) & 0x07;
            const note = oplFnumToNote(fnum, block, layout.clock);
            events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
            st.keyOn[ch] = keyOn ? 1 : 0;
          }
        }
        // OPLL has slightly different register layout for key-on but 0x20-0x28 map similarly
        // For simplicity we handle via 0xB0 range which covers standard OPL
        if (layout.type === S98_DEVICE_YM2413) {
          // OPLL: reg 0x10-0x18 = F-number low, 0x20-0x28 = sustain+key-on+block+fnum-hi
          if (reg >= 0x10 && reg <= 0x18) {
            const ch = reg - 0x10;
            st.fnumLo[ch] = val;
          } else if (reg >= 0x20 && reg <= 0x28) {
            const ch = reg - 0x20;
            st.fnumHi[ch] = val;
            const keyOn = (val & 0x10) !== 0;
            if (keyOn !== (st.keyOn[ch] !== 0)) {
              const fnum = st.fnumLo[ch] | ((val & 0x01) << 8);
              const block = (val >> 1) & 0x07;
              const note = oplFnumToNote(fnum, block, layout.clock);
              events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
              st.keyOn[ch] = keyOn ? 1 : 0;
            }
          }
        }
        continue;
      }

      // ── YMF262 (OPL3) ──────────────────────────────────────────────
      if (layout.type === S98_DEVICE_YMF262) {
        const st = oplStates[deviceIdx]!;
        const chOff = port === 1 ? 9 : 0;
        if (reg >= 0xA0 && reg <= 0xA8) {
          st.fnumLo[chOff + (reg - 0xA0)] = val;
        } else if (reg >= 0xB0 && reg <= 0xB8) {
          const ch = chOff + (reg - 0xB0);
          st.fnumHi[ch] = val;
          const keyOn = (val & 0x20) !== 0;
          if (keyOn !== (st.keyOn[ch] !== 0)) {
            const fnum = st.fnumLo[ch] | ((val & 0x03) << 8);
            const block = (val >> 2) & 0x07;
            const note = oplFnumToNote(fnum, block, layout.clock);
            events.push({ tick, ch: layout.chStart + ch, note, on: keyOn, instIdx: layout.instIdx });
            st.keyOn[ch] = keyOn ? 1 : 0;
          }
        }
        continue;
      }

      // ── SN76489 ────────────────────────────────────────────────────
      if (layout.type === S98_DEVICE_SN76489) {
        // SN76489 writes come as register writes where the "reg" byte is the data
        handleSN76489Write(reg, snStates[deviceIdx]!, layout, tick, events);
        continue;
      }
    }
  }

  return events;
}

/** Handle SSG (AY-compatible) register writes for OPN/OPNA devices. */
function handleSSGWrite(
  reg: number, val: number, st: OPNState, layout: DeviceLayout,
  _deviceIdx: number, tick: number, events: NoteEvent[],
): void {
  // SSG channels are after FM channels in the layout
  const fmChs = layout.type === S98_DEVICE_YM2608 ? 6 : 3;
  const ssgChStart = layout.chStart + fmChs;

  if (reg === 0x00 || reg === 0x02 || reg === 0x04) {
    const ch = reg >> 1;
    st.ssgPeriodLo[ch] = val;
    const period = st.ssgPeriodLo[ch] | ((st.ssgPeriodHi[ch] & 0x0F) << 8);
    if (period > 0 && st.ssgPlaying[ch]) {
      // SSG uses a divided clock: OPN clock / 4 for SSG section
      const ssgClock = layout.clock / 4;
      const note = ayPeriodToNote(period, ssgClock);
      if (note > 0) {
        events.push({ tick, ch: ssgChStart + ch, note: 97, on: false, instIdx: layout.instIdx });
        events.push({ tick, ch: ssgChStart + ch, note, on: true, instIdx: layout.instIdx });
      }
    }
  } else if (reg === 0x01 || reg === 0x03 || reg === 0x05) {
    const ch = (reg - 1) >> 1;
    st.ssgPeriodHi[ch] = val & 0x0F;
  } else if (reg === 0x08 || reg === 0x09 || reg === 0x0A) {
    const ch = reg - 0x08;
    const volume = val & 0x1F;
    const ssgClock = layout.clock / 4;
    if (volume > 0 && !st.ssgPlaying[ch]) {
      const period = st.ssgPeriodLo[ch] | ((st.ssgPeriodHi[ch] & 0x0F) << 8);
      if (period > 0) {
        const note = ayPeriodToNote(period, ssgClock);
        if (note > 0) {
          events.push({ tick, ch: ssgChStart + ch, note, on: true, instIdx: layout.instIdx });
          st.ssgPlaying[ch] = 1;
        }
      }
    } else if (volume === 0 && st.ssgPlaying[ch]) {
      events.push({ tick, ch: ssgChStart + ch, note: 97, on: false, instIdx: layout.instIdx });
      st.ssgPlaying[ch] = 0;
    }
  }
}

/** Handle SN76489 data byte write (comes as the "register" byte in S98). */
function handleSN76489Write(
  data: number, st: SNState, layout: DeviceLayout,
  tick: number, events: NoteEvent[],
): void {
  if (data & 0x80) {
    // Latch byte
    st.latchCh = (data >> 5) & 0x03;
    st.latchTyp = (data >> 4) & 0x01;
    const lo = data & 0x0F;

    if (st.latchTyp === 1) {
      // Volume latch
      const prevVol = st.volume[st.latchCh];
      st.volume[st.latchCh] = lo;
      if (st.latchCh < 3) {
        const outCh = layout.chStart + st.latchCh;
        if (lo === 15 && st.playing[st.latchCh]) {
          events.push({ tick, ch: outCh, note: 97, on: false, instIdx: layout.instIdx });
          st.playing[st.latchCh] = 0;
        } else if (lo < 15 && prevVol === 15 && st.counter[st.latchCh] > 0) {
          const note = sn76489CounterToNote(st.counter[st.latchCh], layout.clock);
          if (note > 0) {
            events.push({ tick, ch: outCh, note, on: true, instIdx: layout.instIdx });
            st.playing[st.latchCh] = 1;
          }
        }
      }
    } else {
      st.counter[st.latchCh] = (st.counter[st.latchCh] & 0x3F0) | lo;
    }
  } else {
    // Data byte
    if (st.latchTyp === 0 && st.latchCh < 3) {
      st.counter[st.latchCh] = ((data & 0x3F) << 4) | (st.counter[st.latchCh] & 0x0F);
      if (st.volume[st.latchCh] < 15 && st.counter[st.latchCh] > 0) {
        const outCh = layout.chStart + st.latchCh;
        const note = sn76489CounterToNote(st.counter[st.latchCh], layout.clock);
        if (note > 0) {
          if (st.playing[st.latchCh]) {
            events.push({ tick, ch: outCh, note: 97, on: false, instIdx: layout.instIdx });
          }
          events.push({ tick, ch: outCh, note, on: true, instIdx: layout.instIdx });
          st.playing[st.latchCh] = 1;
        }
      }
    }
  }
}

// ── Events → Patterns ─────────────────────────────────────────────────────────

const ROWS_PER_PATTERN = 64;

function eventsToPatterns(
  events: NoteEvent[],
  numCh: number,
  tickInterval: number,
  loopOffset: number,
): { patterns: Pattern[]; loopPatternIdx: number } {
  if (events.length === 0) {
    return { patterns: [emptyPattern('p0', 'Pattern 0', numCh, ROWS_PER_PATTERN)], loopPatternIdx: -1 };
  }

  // Convert ticks to rows: target ~60Hz row rate (≈16.67ms per row)
  const rowDuration = 1 / 60; // seconds
  const ticksPerRow = Math.max(1, Math.round(rowDuration / tickInterval));

  // Avoid call stack overflow on large event arrays; iterate manually
  let maxTick = 0;
  for (const e of events) { if (e.tick > maxTick) maxTick = e.tick; }
  const MAX_PATTERNS = 256; // cap to avoid multi-second freezes on long files
  const totalRows = Math.max(ROWS_PER_PATTERN, Math.ceil(maxTick / ticksPerRow) + 1);
  const numPatterns = Math.min(MAX_PATTERNS, Math.ceil(totalRows / ROWS_PER_PATTERN));

  const patterns: Pattern[] = [];
  for (let p = 0; p < numPatterns; p++) {
    patterns.push(emptyPattern(`p${p}`, `Pattern ${p}`, numCh, ROWS_PER_PATTERN));
  }

  for (const ev of events) {
    const absRow = Math.floor(ev.tick / ticksPerRow);
    const patIdx = Math.min(Math.floor(absRow / ROWS_PER_PATTERN), numPatterns - 1);
    const row = Math.min(absRow % ROWS_PER_PATTERN, ROWS_PER_PATTERN - 1);
    const ch = Math.min(ev.ch, numCh - 1);
    const cell = patterns[patIdx].channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97; // note off
    }
  }

  // Determine loop pattern index from loop offset
  // (the loop offset maps to an approximate tick, which maps to a pattern)
  const loopPatternIdx = loopOffset > 0 ? 0 : -1;

  return { patterns, loopPatternIdx };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isS98Format(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 0x53 && b[1] === 0x39 && b[2] === 0x38; // "S98"
}

export function parseS98File(buffer: ArrayBuffer): TrackerSong {
  const buf = new Uint8Array(buffer);
  const header = parseS98Header(buf);

  const tags = parseTags(buf, header.tagOffset);
  const layout = buildInstruments(header.devices);
  const { instruments, deviceLayouts, totalChannels } = layout;

  const events = walkCommands(buf, header.dataOffset, header.loopOffset, deviceLayouts, header.tickInterval);
  const { patterns, loopPatternIdx } = eventsToPatterns(events, totalChannels, header.tickInterval, header.loopOffset);

  const songPositions = patterns.map((_, i) => i);
  const title = tags.title || tags.game || 'S98 File';

  return {
    name: title + (tags.artist ? ` — ${tags.artist}` : ''),
    format: 'S98' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: patterns.length,
    restartPosition: loopPatternIdx >= 0 ? loopPatternIdx : 0,
    numChannels: totalChannels,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
