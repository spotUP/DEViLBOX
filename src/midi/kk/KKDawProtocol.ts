/**
 * KKDawProtocol — Byte-exact Native Instruments Komplete Kontrol DAW MIDI Protocol
 *
 * Protocol reverse-engineered and documented by reaKontrol (jcsteh / brummbrum).
 * All command bytes, SysEx structure, and encoding rules are transcribed verbatim
 * from niMidi.cpp in both forks.
 *
 * Transport layer:
 *   - Regular commands:  BF <CMD> <VALUE>  (CC on channel 16)
 *   - Rich commands:     F0 00 21 09 00 00 44 43 01 00 <CMD> <VALUE> <SLOT> [TEXT] F7
 *
 * Device identification (MIDI port name suffixes):
 *   MK1/MK2:        "Komplete Kontrol DAW - 1"
 *   A-series:       "Komplete Kontrol A DAW"
 *   M-series:       "Komplete Kontrol M DAW"
 *   S MK3 (Win):    "2 (KONTROL S49 MK3)" / "2 (KONTROL S61 MK3)" / "2 (KONTROL S88 MK3)"
 *   S MK3 (macOS):  "MK3 - DAW"
 */

// ── SysEx header ─────────────────────────────────────────────────────────────

const SYSEX_HDR = Uint8Array.from([
  0xF0,             // SysEx start
  0x00, 0x21, 0x09, // NI manufacturer ID
  0x00, 0x00,       // device/sub-type (always 0x00, 0x00)
  0x44, 0x43,       // "DC" identifier
  0x01, 0x00,       // version/type
]);

const SYSEX_END = 0xF7;
const CC_CH16   = 0xBF; // CC on channel 16

// ── Command constants ─────────────────────────────────────────────────────────

export const CMD = {
  // Connection
  HELLO:          0x01,
  GOODBYE:        0x02,
  SURFACE_CONFIG: 0x03,
  BANK_MAPPING:   0x05,
  USE_SYSEX_PARAM:0x06,

  // Transport (CC bidirectional)
  PLAY:           0x10,
  RESTART:        0x11,
  REC:            0x12,
  COUNT:          0x13,
  STOP:           0x14,
  LOOP:           0x16,
  METRO:          0x17,
  TEMPO:          0x18,
  SET_TEMPO:      0x19,

  // Edit
  UNDO:           0x20,
  REDO:           0x21,
  QUANTIZE:       0x22,
  AUTO:           0x23,

  // Navigation (CC bidirectional)
  NAV_TRACKS:     0x30,
  NAV_BANKS:      0x31,
  NAV_CLIPS:      0x32,
  MOVE_TRANSPORT: 0x34,
  MOVE_LOOP:      0x35,
  NAV_PRESET:     0x36,

  // Track state (SysEx outbound)
  TRACK_AVAIL:    0x40,
  SEL_TRACK_PARAMS_CHANGED: 0x41,
  TRACK_SELECTED: 0x42,
  TRACK_MUTED:    0x43,
  TRACK_SOLOED:   0x44,
  TRACK_ARMED:    0x45,
  TRACK_VOLUME_TEXT: 0x46,
  TRACK_PAN_TEXT: 0x47,
  TRACK_NAME:     0x48,
  TRACK_VU:       0x49,

  // Knobs 0-7: CC for ring positions
  KNOB_VOLUME0:   0x50, // ..0x57 for slots 0–7
  KNOB_PAN0:      0x58, // ..0x5F for slots 0–7

  // Selected-track encoder (inbound CC)
  CHANGE_VOLUME:  0x64,
  CHANGE_PAN:     0x65,
  TOGGLE_MUTE:    0x66,
  TOGGLE_SOLO:    0x67,

  // FX/Plugin parameters
  KNOB_PARAM0:    0x70, // ..0x77 for params 0–7
  SELECT_PLUGIN:  0x70,
  PLUGIN_NAMES:   0x71,
  PARAM_NAME:     0x72,
  PARAM_VALUE_TEXT: 0x73,
  PARAM_PAGE:     0x74,
  PARAM_SECTION:  0x75,
  PRESET_NAME:    0x76,
  PARAM_HIGH_RES: 0x7F,
} as const;

// Track availability types (value byte for TRACK_AVAIL)
export const TRTYPE = {
  UNAVAILABLE: 0,
  GENERIC:     1,
  MIDI:        2,
  AUDIO:       3,
  GROUP:       4,
  BUS:         5,
  MASTER:      6,
} as const;

// Parameter visualization hints (value byte for PARAM_NAME)
export const PARAM_VIS = {
  UNIPOLAR: 0,  // 0–100% arc
  BIPOLAR:  1,  // center-out arc (e.g. pan)
  SWITCH:   2,  // toggle
  DISCRETE: 3,  // stepped
} as const;

// Protocol versions reported by keyboard in HELLO ACK
export const PROTO_VERSION = {
  A_SERIES: 1,
  S_MK2_OLD: 2,
  S_MK2_NEW: 3,
  S_MK3:    4,
} as const;

// ── Device name matching ──────────────────────────────────────────────────────

const KK_DAW_SUFFIXES = [
  'Komplete Kontrol DAW - 1',   // MK1 / MK2
  'Komplete Kontrol A DAW',     // A-series
  'Komplete Kontrol M DAW',     // M-series
  '2 (KONTROL S49 MK3)',        // Windows MK3
  '2 (KONTROL S61 MK3)',
  '2 (KONTROL S88 MK3)',
  'MK3 - DAW',                  // macOS MK3
];

export function isKKDawPort(name: string): boolean {
  return KK_DAW_SUFFIXES.some(s => name.endsWith(s) || name.includes(s));
}

// ── Message builders ──────────────────────────────────────────────────────────

/** Build a 3-byte CC message: BF CMD VALUE */
export function buildCc(cmd: number, value: number): Uint8Array {
  return Uint8Array.from([CC_CH16, cmd & 0x7F, value & 0x7F]);
}

/** Build a SysEx message: F0 HDR CMD VALUE SLOT TEXT F7 */
export function buildSysex(
  cmd: number,
  value: number,
  slot: number,
  text = '',
): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  const buf = new Uint8Array(
    SYSEX_HDR.length + 3 + textBytes.length + 1,
  );
  let p = 0;
  buf.set(SYSEX_HDR, p); p += SYSEX_HDR.length;
  buf[p++] = cmd   & 0xFF;
  buf[p++] = value & 0xFF;
  buf[p++] = slot  & 0xFF;
  buf.set(textBytes, p); p += textBytes.length;
  buf[p]   = SYSEX_END;
  return buf;
}

// ── Tempo encoding (5 × 7-bit LE, quarter-note in 10ns units) ────────────────

const TEN_NS = 1e-8; // 10 nanoseconds in seconds

export function encodeTempo(bpm: number): Uint8Array {
  const quarterNs = Math.round(60 / bpm / TEN_NS);
  const data = new Uint8Array(5);
  let n = quarterNs;
  for (let b = 0; b < 5; b++) {
    data[b] = n & 0x7F;
    n >>= 7;
  }
  return data;
}

export function decodeTempo(data: Uint8Array): number {
  let n = 0;
  for (let b = 0; b < Math.min(5, data.length); b++) {
    n += data[b] << (b * 7);
  }
  return 60 / (n * TEN_NS);
}

// ── Encoder value decoding ───────────────────────────────────────────────────

/** MIDI 7-bit signed: 1–63 = +1..+63; 65–127 = -63..-1; 64 = 0 */
export function decodeSignedMidi(value: number): number {
  if (value <= 63) return value;
  return value - 128;
}

/** High-res 14-bit signed delta from MK3 (CMD_PARAM_HIGH_RES) */
export function decodeHighResDelta(lsb: number, msb: number): number {
  let v = (lsb & 0x7F) | ((msb & 0x7F) << 7);
  if (v > 8192) v -= 16384;
  return v / 8191;
}

// ── Volume / pan CC encoding ──────────────────────────────────────────────────

/** Normalized 0–1 volume → MIDI 0–127 (logarithmic) */
export function encodeVolume(v: number): number {
  const db = v > 0 ? 20 * Math.log10(v) : -150;
  const slider = Math.max(0, Math.min(1000, (db + 60) / 60 * 1000));
  return Math.round(Math.min(127, slider * 127 / 1000));
}

/** Normalized -1..+1 pan → MIDI 0–127 (center = 63) */
export function encodePan(pan: number): number {
  return Math.round(Math.min(127, Math.max(0, (pan + 1) / 2 * 127)));
}

/** 0–1 normalized param value → MIDI 0–127 */
export function encodeParam(v: number): number {
  return Math.round(Math.min(127, Math.max(0, v * 127)));
}

// ── Inbound SysEx parser ─────────────────────────────────────────────────────

export interface KKCcEvent {
  type: 'cc';
  cmd:  number;
  value: number;
}

export interface KKSysexEvent {
  type:  'sysex';
  cmd:   number;
  value: number;
  slot:  number;
  text:  string;
  raw:   Uint8Array;
}

export type KKEvent = KKCcEvent | KKSysexEvent;

export function parseMidiMessage(data: Uint8Array): KKEvent | null {
  if (data.length < 2) return null;

  // CC on channel 16
  if (data[0] === CC_CH16 && data.length >= 3) {
    return { type: 'cc', cmd: data[1], value: data[2] };
  }

  // SysEx from keyboard
  if (data[0] === 0xF0 && data.length >= SYSEX_HDR.length + 3) {
    // Verify NI header (skip F0)
    const match =
      data[1] === 0x00 && data[2] === 0x21 && data[3] === 0x09 &&
      data[4] === 0x00 && data[5] === 0x00 &&
      data[6] === 0x44 && data[7] === 0x43 &&
      data[8] === 0x01 && data[9] === 0x00;
    if (!match) return null;
    const cmd   = data[10];
    const value = data[11];
    const slot  = data[12];
    const endIdx = data[data.length - 1] === SYSEX_END ? data.length - 1 : data.length;
    const textBytes = data.slice(13, endIdx);
    const text = new TextDecoder().decode(textBytes);
    return { type: 'sysex', cmd, value, slot, text, raw: data };
  }

  return null;
}

// ── Helpers for bank initialization ─────────────────────────────────────────

/** Returns bitmask for CMD_NAV_TRACKS: bit0=hasPrev, bit1=hasNext */
export function navLightsMask(hasPrev: boolean, hasNext: boolean): number {
  return (hasPrev ? 1 : 0) | (hasNext ? 2 : 0);
}
