import { b$ as registerPatternEncoder } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function encodeKlysCell(cell) {
  const out = new Uint8Array(6);
  const note = cell.note ?? 0;
  out[0] = note & 255;
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? instr - 1 & 255 : 255;
  out[2] = 0;
  out[3] = (cell.volume ?? 0) & 255;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const command = (effTyp & 255) << 8 | eff & 255;
  out[4] = command & 255;
  out[5] = command >> 8 & 255;
  return out;
}
registerPatternEncoder("klystrack", () => encodeKlysCell);
const SONG_SIG = "cyd!song";
const MUS_VERSION = 27;
function isKlystrack(buf) {
  if (buf.byteLength < 9) return false;
  const view = new DataView(buf);
  let sig = "";
  for (let i = 0; i < 8; i++) sig += String.fromCharCode(view.getUint8(i));
  return sig === SONG_SIG;
}
class BinaryReader {
  view;
  pos;
  constructor(buf) {
    this.view = new DataView(buf);
    this.pos = 0;
  }
  get offset() {
    return this.pos;
  }
  get remaining() {
    return this.view.byteLength - this.pos;
  }
  readU8() {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }
  readS8() {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }
  readU16LE() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  readU32LE() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readS32LE() {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readString(len) {
    let s = "";
    for (let i = 0; i < len; i++) {
      const c = this.view.getUint8(this.pos + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    this.pos += len;
    return s;
  }
  readBytes(len) {
    const arr = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return new Uint8Array(arr);
  }
  skip(n) {
    this.pos += n;
  }
}
function parseKlystrack(buf) {
  const r = new BinaryReader(buf);
  const sig = r.readString(8);
  if (sig !== SONG_SIG) {
    throw new Error(`Not a klystrack file (sig: ${sig})`);
  }
  const version = r.readU8();
  if (version > MUS_VERSION) {
    throw new Error(`Unsupported klystrack version ${version} (max: ${MUS_VERSION})`);
  }
  let numChannels;
  if (version >= 6) {
    numChannels = r.readU8();
  } else {
    numChannels = version > 3 ? 4 : 3;
  }
  r.readU8();
  if (version >= 17) {
    r.readU8();
  }
  const numInstruments = r.readU8();
  const numPatterns = r.readU16LE();
  const numSequences = [];
  for (let i = 0; i < numChannels; i++) {
    numSequences.push(r.readU16LE());
  }
  const songLength = r.readU16LE();
  const loopPoint = r.readU16LE();
  let masterVolume = 128;
  if (version >= 12) {
    masterVolume = r.readU8();
  }
  const songSpeed = r.readU8();
  const songSpeed2 = r.readU8();
  const songRate = r.readU16LE();
  let flags = 0;
  if (version > 2) flags = r.readU16LE();
  if (version >= 9) r.readU8();
  if (version >= 16) r.readU8();
  let titleLen = 17;
  if (version >= 11) {
    titleLen = r.readU8();
  }
  let title = "";
  if (version >= 5) {
    title = r.readString(Math.min(titleLen, 64));
  }
  if (version >= 10) {
    r.readU8();
  }
  const patterns = [];
  const defaultSteps = 64;
  for (let i = 0; i < numPatterns; i++) {
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      for (let row = 0; row < defaultSteps; row++) {
        rows.push({ note: 0, instrument: -1, volume: -1, effect: "", effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      channels.push({
        id: `p${i}-ch${ch}`,
        name: `Ch ${ch + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null
      });
    }
    patterns.push({ id: `pat-${i}`, name: `Pattern ${i}`, length: defaultSteps, channels });
  }
  const instruments = [];
  for (let i = 0; i < numInstruments; i++) {
    instruments.push({
      id: i + 1,
      name: `Inst ${i.toString(16).toUpperCase().padStart(2, "0")}`,
      type: "Klystrack",
      synthType: "KlysSynth",
      volume: -6
    });
  }
  const songPositions = Array.from({ length: Math.max(1, songLength) }, (_, i) => i % Math.max(1, numPatterns));
  const bpm = songRate > 0 ? Math.round(songRate * 60 / (songSpeed + songSpeed2 || 6)) : 125;
  const nativePatterns = patterns.map((p) => ({
    numSteps: p.length,
    steps: Array.from({ length: p.length }, () => ({
      note: 0,
      instrument: 255,
      ctrl: 0,
      volume: 0,
      command: 0
    }))
  }));
  const nativeSequences = Array.from(
    { length: numChannels },
    (_) => ({
      entries: songPositions.map((pat, pos) => ({
        position: pos,
        pattern: pat,
        noteOffset: 0
      }))
    })
  );
  const nativeInstruments = instruments.map((i) => ({
    name: i.name,
    adsr: { a: 0, d: 0, s: 127, r: 0 },
    flags: 0,
    cydflags: 0,
    baseNote: 60,
    finetune: 0,
    slideSpeed: 0,
    pw: 128,
    volume: 100,
    progPeriod: 0,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    pwmSpeed: 0,
    pwmDepth: 0,
    cutoff: 255,
    resonance: 0,
    flttype: 0,
    ymEnvShape: 0,
    buzzOffset: 0,
    fxBus: 0,
    vibShape: 0,
    vibDelay: 0,
    pwmShape: 0,
    lfsrType: 0,
    wavetableEntry: 0,
    ringMod: 0,
    syncSource: 0,
    fm: { flags: 0, modulation: 0, feedback: 0, wave: 0, harmonic: 0, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
    program: []
  }));
  const klysNative = {
    channels: numChannels,
    songLength,
    loopPoint,
    songSpeed,
    songSpeed2,
    songRate,
    masterVolume,
    flags,
    patterns: nativePatterns,
    sequences: nativeSequences,
    instruments: nativeInstruments
  };
  const format = "KT";
  const bytesPerCell = 6;
  const defaultStepsPerPat = 64;
  const uadePatternLayout = {
    formatId: "klystrack",
    patternDataFileOffset: 0,
    bytesPerCell,
    rowsPerPattern: defaultStepsPerPat,
    numChannels,
    numPatterns,
    moduleSize: buf.byteLength,
    encodeCell: encodeKlysCell
  };
  return {
    name: title || "Untitled",
    format,
    patterns,
    instruments,
    songPositions,
    songLength: songLength || 1,
    restartPosition: loopPoint,
    numChannels,
    initialSpeed: songSpeed,
    initialBPM: bpm,
    speed2: songSpeed2,
    hz: songRate,
    klysNative,
    klysFileData: buf.slice(0),
    // copy for WASM
    uadePatternLayout
  };
}
export {
  isKlystrack,
  parseKlystrack
};
