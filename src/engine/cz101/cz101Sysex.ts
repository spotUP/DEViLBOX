/**
 * Casio CZ-101 / CZ-1000 / CZ-3000 / CZ-5000 single-tone SysEx: decoder and encoder.
 *
 * Message (264 bytes):  F0 44 00 00 7<ch> <function> <program> <256 nibble bytes> F7
 *  - function 0x20 = tone data sent by the synth, 0x10 = tone data sent to the synth
 *  - program 0x60 = the edit buffer; 0x00-0x0F presets / 0x20-0x2F internal / 0x40-0x4F cartridge
 *  - the 128 tone bytes travel as nibble pairs, LOW nibble first (0x5F is sent 0F 05)
 *
 * Tone layout (128 bytes), verified against real dumps (the sizes, the nibble order, the
 * 17-byte envelope blocks with end-step byte first, the value ranges of every used step):
 *   0 PFLAG   bits 1-0 line select (0 = 1, 1 = 2, 2 = 1+1', 3 = 1+2'), bits 3-2 octave (0, +1, -1)
 *   1 PDS     detune direction (0 up, 1 down)
 *   2 PDL     detune fine, in steps of 4: PDL >> 2 is 0-60 (1/60 semitone each)
 *   3 PDH     detune in semitones (octave * 12 + note, 0-47)
 *   4 PVK     vibrato waveform          5-7 vibrato delay   8-10 vibrato rate   11-13 vibrato depth
 *  14.. line 1, 71.. line 2 (57 bytes each):
 *     +0,+1 MFW  the UPD933 waveform register image: w1 bits 15-13, w2 bits 12-10, bit 9 = alternate
 *                waveform enabled, bits 8-6 window (resonance I/II/III = window 1/2/3),
 *                bits 5-3 modulation (100 ring, 011 noise), bits 2-0 zero
 *     +2..+5 key follow (amplitude and waveform depth/velocity tables)
 *     +6  DCA end step (0-7), +7..+22 eight (rate, level) steps
 *     +23 DCW end step,       +24..+39 eight steps
 *     +40 DCO end step,       +41..+56 eight steps
 *  Step bytes: rate bit 7 = this step falls; level bit 7 = sustain point (hold here until key-off).
 *  DCA/DCW level 0-127 (panel 0-99), DCO level 0-0x3F fine (6.25 cent) or 0x40 | n coarse (n * 2 semitones);
 *  rate bytes are the chip's own 7-bit rate field (exponent * 8 + mantissa).
 *
 * Sources: the Casio CZ MIDI implementation as summarised by Young Monkey's CZ sysex outline
 * and the Coffeeshopped CZ editor's byte converters; layout and ranges re-checked on real
 * dumps. Not verified against hardware: the fine detune unit (1/60 semitone) and the
 * DCW rate offset (taken as the chip rate itself).
 *
 * What the UPD933 voice model cannot represent is dropped, and reported in `ignored`:
 *  - vibrato (PVK/PVDL/PVSD/PVDD): the synth has no LFO
 *  - keyboard tracking of amplitude and waveform depth (MAMD..MWMV): no per-key envelope scaling
 *  - detune on a single-line patch (the CZ detunes line 2 against line 1; with one line there is nothing to detune)
 *  - ring-only silencing of line 1 (not stored in a CZ dump; the patch plays line 1 as well)
 */
import { CZWaveform, CZWindow } from './cz101Types';
import type { CZEnvelopeStage, CZLine, CZPatch } from './cz101Types';

export const CZ_SYSEX_LENGTH = 264;
export const CZ_TONE_BYTES = 128;
const HEADER = 7;
const LINE_SIZE = 57;
const LINE_START = [14, 14 + LINE_SIZE] as const;
const FINE_STEPS_PER_SEMITONE = 60;
/** Program byte of the edit buffer. */
export const CZ_EDIT_BUFFER = 0x60;

export class CZSysexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CZSysexError';
  }
}

/** Instrument parameter keys that make a CZ-101 instrument carry its own patch (strings in `instrument.parameters`). */
export const CZ101_TONE_PARAM = '_cz101Tone';
export const CZ101_TONE_NAME_PARAM = '_cz101Name';

export interface CZDecoded {
  patch: CZPatch;
  /** The 128 tone bytes the patch was decoded from: what an instrument stores, so nothing the dump holds is lost. */
  tone: Uint8Array;
  /** Features present in the dump that the chip voice model cannot play. */
  ignored: string[];
}

// ---------------------------------------------------------------------------
// Decoder

/** The tone bytes of one message, or throws CZSysexError saying what is wrong. */
export function czToneBytes(message: Uint8Array): Uint8Array {
  if (message.length !== CZ_SYSEX_LENGTH) throw new CZSysexError(`Expected ${CZ_SYSEX_LENGTH} bytes, got ${message.length}`);
  if (message[0] !== 0xf0 || message[message.length - 1] !== 0xf7) throw new CZSysexError('Not a SysEx message (missing F0 / F7)');
  if (message[1] !== 0x44 || message[2] !== 0x00 || message[3] !== 0x00) throw new CZSysexError('Not a Casio CZ message (manufacturer 44 00 00)');
  if ((message[4] & 0xf0) !== 0x70) throw new CZSysexError('Not a Casio CZ message (channel byte is not 7n)');
  if (message[5] !== 0x20 && message[5] !== 0x10) {
    throw new CZSysexError(`Not a tone data message (function ${message[5].toString(16).padStart(2, '0')}, expected 20)`);
  }
  const tone = new Uint8Array(CZ_TONE_BYTES);
  for (let i = 0; i < CZ_TONE_BYTES; i++) {
    const low = message[HEADER + 2 * i];
    const high = message[HEADER + 2 * i + 1];
    if (low > 0x0f || high > 0x0f) throw new CZSysexError(`Data byte ${i} is not a nibble`);
    tone[i] = low | (high << 4);
  }
  return tone;
}

function decodeLevel(byte: number, kind: 'amplitude' | 'waveform' | 'pitch'): { level: number; coarse: boolean } {
  const value = byte & 0x7f;
  if (kind === 'pitch') return value >= 0x40 ? { level: value & 0x3f, coarse: true } : { level: value, coarse: false };
  return { level: Math.min(99, (value * 99) / 127), coarse: false };
}

/** One envelope block (end step + 8 steps) -> stages, a sustain flag becoming a rate-0 stage. */
function decodeEnvelope(tone: Uint8Array, offset: number, kind: 'amplitude' | 'waveform' | 'pitch'): CZEnvelopeStage[] {
  const end = tone[offset];
  if (end > 7) throw new CZSysexError(`Envelope end step ${end} is out of range (0-7)`);
  const stages: CZEnvelopeStage[] = [];
  for (let step = 0; step <= end; step++) {
    const rateByte = tone[offset + 1 + 2 * step];
    const levelByte = tone[offset + 2 + 2 * step];
    const { level, coarse } = decodeLevel(levelByte, kind);
    // Rate 0 is the worklet's sustain marker, so a literal 0 becomes the slowest real rate
    const rate = Math.max(1, rateByte & 0x7f);
    stages.push(coarse ? { rate, level, coarse: true } : { rate, level });
    if (levelByte & 0x80) stages.push(coarse ? { rate: 0, level, coarse: true } : { rate: 0, level });
  }
  return stages;
}

function decodeLine(tone: Uint8Array, start: number): { line: CZLine; modulation: number } {
  const word = (tone[start] << 8) | tone[start + 1];
  const waveform1 = (word >> 13) & 7;
  const waveform2 = (word >> 10) & 7;
  const alternate = ((word >> 9) & 1) === 1;
  const window = (word >> 6) & 7;
  const modulation = (word >> 3) & 7;
  const dco = decodeEnvelope(tone, start + 40, 'pitch');
  const line: CZLine = {
    waveform1: waveform1 as CZWaveform,
    waveform2: alternate && waveform2 !== waveform1 ? (waveform2 as CZWaveform) : undefined,
    window: (window <= CZWindow.DOUBLE_SAW ? window : 0) as CZWindow,
    dcaEnvelope: decodeEnvelope(tone, start + 6, 'amplitude'),
    dcwEnvelope: decodeEnvelope(tone, start + 23, 'waveform'),
    // an all-zero pitch envelope is "no pitch envelope"
    dcoEnvelope: dco.some((stage) => stage.level > 0) ? dco : undefined,
  };
  return { line, modulation };
}

/** Decode one 264-byte tone message into a patch. */
export function decodeCzSysex(message: Uint8Array, name?: string): CZDecoded {
  return decodeCzTone(czToneBytes(message), name);
}

/** The tone bytes of a patch (what encodeCzSysex would send), for storing a patch that was not imported from a dump. */
export function czToneFromPatch(patch: CZPatch): Uint8Array {
  return czToneBytes(encodeCzSysex(patch));
}

export function czToneToBase64(tone: Uint8Array): string {
  let binary = '';
  tone.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export function czToneFromBase64(text: string): Uint8Array {
  let binary: string;
  try { binary = atob(text); } catch { throw new CZSysexError('Stored tone is not base64'); }
  if (binary.length !== CZ_TONE_BYTES) throw new CZSysexError(`Stored tone is ${binary.length} bytes, expected ${CZ_TONE_BYTES}`);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Decode the 128 tone bytes into a patch. */
export function decodeCzTone(tone: Uint8Array, name?: string): CZDecoded {
  if (tone.length !== CZ_TONE_BYTES) throw new CZSysexError(`Expected ${CZ_TONE_BYTES} tone bytes, got ${tone.length}`);
  const ignored: string[] = [];
  const lineSelect = tone[0] & 3;
  const octaveBits = (tone[0] >> 2) & 3;
  const octave = octaveBits === 1 ? 1 : octaveBits === 2 ? -1 : 0;

  if (tone[11] !== 0 || tone[12] !== 0 || tone[13] !== 0) ignored.push('vibrato');

  // Line select 1 plays line 2's data alone
  const first = decodeLine(tone, LINE_START[lineSelect === 1 ? 1 : 0]);
  let line2: CZLine | undefined;
  if (lineSelect >= 2) {
    const second = lineSelect === 2 ? { ...first.line } : decodeLine(tone, LINE_START[1]).line;
    const fine = tone[2] >> 2;
    const semitones = tone[3] + fine / FINE_STEPS_PER_SEMITONE;
    const cents = (tone[1] & 1 ? -1 : 1) * semitones * 100;
    line2 = { ...second, detune: cents === 0 ? undefined : cents };
  } else if (tone[3] !== 0 || tone[2] >> 2 !== 0) {
    ignored.push('detune (single line patch)');
  }
  ignored.push('keyboard tracking');

  const ring = first.modulation === 0b100;
  const noise = first.modulation === 0b011;
  const patch: CZPatch = {
    name,
    line1: first.line,
    line2,
    octave: octave === 0 ? undefined : octave,
    ringMod: ring || undefined,
    noiseMode: noise || undefined,
  };
  return { patch, ignored, tone: tone.slice() };
}

/** Split a .syx file into its F0..F7 messages (a file may hold several tones). */
export function splitSysex(file: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i < file.length; i++) {
    if (file[i] === 0xf0) start = i;
    else if (file[i] === 0xf7 && start >= 0) {
      messages.push(file.slice(start, i + 1));
      start = -1;
    }
  }
  return messages;
}

export interface CZFileResult {
  patches: CZDecoded[];
  errors: string[];
}

/**
 * Decode every tone message in a .syx file. CZ dumps carry no name, so the file name
 * (without extension) names the patch; a file holding several tones numbers them.
 */
export function decodeCzSysexFile(file: Uint8Array, fileName: string): CZFileResult {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '') || 'CZ patch';
  const messages = splitSysex(file);
  const result: CZFileResult = { patches: [], errors: [] };
  if (messages.length === 0) result.errors.push(`${fileName}: no SysEx message found`);
  messages.forEach((message, index) => {
    try {
      const name = messages.length > 1 ? `${base} ${index + 1}` : base;
      result.patches.push(decodeCzSysex(message, name));
    } catch (error) {
      result.errors.push(`${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// Encoder

function encodeEnvelope(tone: Uint8Array, offset: number, stages: CZEnvelopeStage[] | undefined, kind: 'amplitude' | 'waveform' | 'pitch'): void {
  const steps: { rate: number; level: number; coarse: boolean; sustain: boolean }[] = [];
  for (let i = 0; i < (stages?.length ?? 0); i++) {
    const stage = stages![i];
    if (i > 0 && stage.rate === 0) {
      if (steps.length > 0) steps[steps.length - 1].sustain = true;
      continue;
    }
    steps.push({ rate: stage.rate, level: stage.level, coarse: !!stage.coarse, sustain: false });
  }
  if (steps.length > 8) throw new CZSysexError(`Envelope has ${steps.length} steps; the CZ holds 8`);
  if (steps.length === 0) steps.push({ rate: 0, level: 0, coarse: false, sustain: false });
  tone[offset] = steps.length - 1;
  let previous = 0;
  steps.forEach((step, i) => {
    let levelByte: number;
    if (kind === 'pitch') {
      const field = Math.max(0, Math.min(63, Math.round(step.level)));
      levelByte = step.coarse ? 0x40 | Math.max(4, field) : field;
    } else {
      levelByte = Math.max(0, Math.min(127, Math.round((step.level * 127) / 99)));
    }
    const falling = kind !== 'pitch' && levelByte < previous;
    previous = levelByte;
    tone[offset + 1 + 2 * i] = Math.max(0, Math.min(127, Math.round(step.rate))) | (falling ? 0x80 : 0);
    tone[offset + 2 + 2 * i] = levelByte | (step.sustain ? 0x80 : 0);
  });
}

function encodeLine(tone: Uint8Array, start: number, line: CZLine, modulation: number): void {
  const word = (line.waveform1 << 13) | ((line.waveform2 ?? line.waveform1) << 10) | (1 << 9) | ((line.window ?? 0) << 6) | (modulation << 3);
  tone[start] = word >> 8;
  tone[start + 1] = word & 0xff;
  encodeEnvelope(tone, start + 6, line.dcaEnvelope, 'amplitude');
  encodeEnvelope(tone, start + 23, line.dcwEnvelope, 'waveform');
  encodeEnvelope(tone, start + 40, line.dcoEnvelope, 'pitch');
}

/**
 * Encode a patch as a 264-byte tone message. A patch with ring modulation or noise always
 * plays a pair, so it is written as line 2 present. Vibrato and key follow are written as "off".
 */
export function encodeCzSysex(patch: CZPatch, channel = 0, program = CZ_EDIT_BUFFER): Uint8Array {
  const tone = new Uint8Array(CZ_TONE_BYTES);
  const pair = !!patch.line2 || !!patch.ringMod || !!patch.noiseMode;
  const octaveBits = patch.octave === 1 ? 1 : patch.octave === -1 ? 2 : 0;
  tone[0] = (pair ? 3 : 0) | (octaveBits << 2);
  const cents = patch.line2?.detune ?? 0;
  const fineTotal = Math.round((Math.abs(cents) / 100) * FINE_STEPS_PER_SEMITONE);
  tone[1] = cents < 0 ? 1 : 0;
  tone[2] = (fineTotal % FINE_STEPS_PER_SEMITONE) << 2;
  tone[3] = Math.min(47, Math.floor(fineTotal / FINE_STEPS_PER_SEMITONE));
  tone[4] = 0x08; // vibrato waveform 1; its depth bytes stay 0 = no vibrato
  const modulation = patch.ringMod ? 0b100 : patch.noiseMode ? 0b011 : 0;
  encodeLine(tone, LINE_START[0], patch.line1, modulation);
  encodeLine(tone, LINE_START[1], patch.line2 ?? patch.line1, 0);

  const message = new Uint8Array(CZ_SYSEX_LENGTH);
  message.set([0xf0, 0x44, 0x00, 0x00, 0x70 | (channel & 0x0f), 0x20, program & 0x7f]);
  tone.forEach((byte, i) => {
    message[HEADER + 2 * i] = byte & 0x0f;
    message[HEADER + 2 * i + 1] = byte >> 4;
  });
  message[CZ_SYSEX_LENGTH - 1] = 0xf7;
  return message;
}
