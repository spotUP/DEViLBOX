/**
 * Binary codec for the Auto DJ extended analysis (activity timelines, loudness
 * set, spectral balance, chroma), stored in song_analysis.extended.
 *
 * Packed the way the base analysis is (analysisCache.ts): 0..1 timelines are
 * Uint8 (0-255), numbers with a range of their own are Int16 / Float32.
 *
 * Layout (little-endian):
 *   u8   codec format (1)
 *   u16  analysis version (EXTENDED_ANALYSIS_VERSION of the writer)
 *   f32  hopSec, keyHopSec
 *   f32  x6 loudness (integrated, shortTermMax, peak, truePeak, dynamicRange, crest)
 *   f32  x7 spectral (centroidHz, low, mid, high, flatness, brightness, muddiness)
 *   f32  x3 bassSummary subRatio, kickStrength, firstTransient;  u8 melodic
 *   u8   flags (bit0: onsetFlux is the drums timeline - it is, in the writer)
 *   timelines bass, drums, harmonic, vocal, brightness [, onsetFlux]:
 *        u32 length, u8 x length
 *   loudnessShortTermDb: u32 length, i16 x length (0.01 dB)
 *   chroma: u32 rows, u8 x rows*12
 */

export interface ExtendedAnalysisWire {
  version: number;
  hopSec: number;
  bass: number[];
  drums: number[];
  harmonic: number[];
  vocal: number[];
  brightness: number[];
  loudnessShortTermDb: number[];
  onsetFlux: number[];
  keyHopSec: number;
  chroma: number[][];
  loudness: {
    integratedDb: number; shortTermMaxDb: number; peakDb: number;
    truePeakDb: number; dynamicRangeDb: number; crestFactorDb: number;
  };
  spectral: {
    centroidHz: number; lowRatio: number; midRatio: number; highRatio: number;
    flatness: number; brightness: number; muddiness: number;
  };
  bassSummary: { subRatio: number; kickStrength: number; melodic: boolean };
  firstTransient: number;
}

const FORMAT = 1;
const CHROMA_BINS = 12;
const DB_SCALE = 100;

const q8 = (v: number): number => Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * 255);
/** A decoded 0..1 value, kept short so the JSON the lookup returns stays compact; re-encodes to the same byte. */
const d8 = (b: number): number => Math.round((b / 255) * 1e4) / 1e4;
const qDb = (v: number): number => Math.round(Math.min(327, Math.max(-327, Number.isFinite(v) ? v : -100)) * DB_SCALE);

function isNumArray(a: unknown): a is number[] {
  return Array.isArray(a) && a.every((v) => typeof v === 'number');
}

/** Whether an untrusted value has the shape of an ExtendedAnalysis (the POST body is client input). */
export function isExtendedAnalysis(x: unknown): x is ExtendedAnalysisWire {
  const e = x as Partial<ExtendedAnalysisWire> | null;
  if (!e || typeof e !== 'object') return false;
  const num = (o: unknown, keys: string[]): boolean =>
    !!o && typeof o === 'object' && keys.every((k) => typeof (o as Record<string, unknown>)[k] === 'number');
  return Number.isInteger(e.version) && (e.version as number) > 0 && (e.version as number) < 65536
    && typeof e.hopSec === 'number' && typeof e.keyHopSec === 'number' && typeof e.firstTransient === 'number'
    && isNumArray(e.bass) && isNumArray(e.drums) && isNumArray(e.harmonic) && isNumArray(e.vocal)
    && isNumArray(e.brightness) && isNumArray(e.loudnessShortTermDb) && isNumArray(e.onsetFlux)
    && Array.isArray(e.chroma) && e.chroma.every((r) => isNumArray(r) && r.length === CHROMA_BINS)
    && num(e.loudness, ['integratedDb', 'shortTermMaxDb', 'peakDb', 'truePeakDb', 'dynamicRangeDb', 'crestFactorDb'])
    && num(e.spectral, ['centroidHz', 'lowRatio', 'midRatio', 'highRatio', 'flatness', 'brightness', 'muddiness'])
    && num(e.bassSummary, ['subRatio', 'kickStrength']) && typeof e.bassSummary?.melodic === 'boolean';
}

export function packExtended(e: ExtendedAnalysisWire): Buffer {
  const timelines = [e.bass, e.drums, e.harmonic, e.vocal, e.brightness];
  const onsetIsDrums = e.onsetFlux.length === e.drums.length && e.onsetFlux.every((v, i) => q8(v) === q8(e.drums[i]));
  if (!onsetIsDrums) timelines.push(e.onsetFlux);
  const size = 1 + 2 + 8 + 24 + 28 + 12 + 1 + 1
    + timelines.reduce((n, t) => n + 4 + t.length, 0)
    + 4 + e.loudnessShortTermDb.length * 2
    + 4 + e.chroma.length * CHROMA_BINS;
  const buf = Buffer.alloc(size);
  let o = 0;
  const f32 = (v: number): void => { buf.writeFloatLE(v, o); o += 4; };
  buf.writeUInt8(FORMAT, o); o += 1;
  buf.writeUInt16LE(e.version, o); o += 2;
  f32(e.hopSec); f32(e.keyHopSec);
  const l = e.loudness;
  for (const v of [l.integratedDb, l.shortTermMaxDb, l.peakDb, l.truePeakDb, l.dynamicRangeDb, l.crestFactorDb]) f32(v);
  const s = e.spectral;
  for (const v of [s.centroidHz, s.lowRatio, s.midRatio, s.highRatio, s.flatness, s.brightness, s.muddiness]) f32(v);
  f32(e.bassSummary.subRatio); f32(e.bassSummary.kickStrength); f32(e.firstTransient);
  buf.writeUInt8(e.bassSummary.melodic ? 1 : 0, o); o += 1;
  buf.writeUInt8(onsetIsDrums ? 1 : 0, o); o += 1;
  for (const t of timelines) {
    buf.writeUInt32LE(t.length, o); o += 4;
    for (const v of t) buf[o++] = q8(v);
  }
  buf.writeUInt32LE(e.loudnessShortTermDb.length, o); o += 4;
  for (const v of e.loudnessShortTermDb) { buf.writeInt16LE(qDb(v), o); o += 2; }
  buf.writeUInt32LE(e.chroma.length, o); o += 4;
  for (const row of e.chroma) for (let i = 0; i < CHROMA_BINS; i++) buf[o++] = q8(row[i]);
  return buf;
}

/** The analysis version a packed blob was written with, without decoding it; null for a blob that is not one. */
export function extendedVersionOf(buf: Buffer | null | undefined): number | null {
  if (!buf || buf.length < 3 || buf.readUInt8(0) !== FORMAT) return null;
  return buf.readUInt16LE(1);
}

/** Decode a packed blob; null when it is empty, truncated or of another codec format. */
export function unpackExtended(buf: Buffer | null | undefined): ExtendedAnalysisWire | null {
  if (extendedVersionOf(buf) === null || !buf) return null;
  try {
    let o = 1;
    const version = buf.readUInt16LE(o); o += 2;
    const f32 = (): number => { const v = buf.readFloatLE(o); o += 4; return v; };
    const hopSec = f32(), keyHopSec = f32();
    const [integratedDb, shortTermMaxDb, peakDb, truePeakDb, dynamicRangeDb, crestFactorDb] = [f32(), f32(), f32(), f32(), f32(), f32()];
    const [centroidHz, lowRatio, midRatio, highRatio, flatness, brightness, muddiness] = [f32(), f32(), f32(), f32(), f32(), f32(), f32()];
    const subRatio = f32(), kickStrength = f32(), firstTransient = f32();
    const melodic = buf.readUInt8(o++) === 1;
    const onsetIsDrums = (buf.readUInt8(o++) & 1) === 1;
    const timeline = (): number[] => {
      const n = buf.readUInt32LE(o); o += 4;
      if (o + n > buf.length) throw new RangeError('truncated timeline');
      const out = new Array<number>(n);
      for (let i = 0; i < n; i++) out[i] = d8(buf[o++]);
      return out;
    };
    const bass = timeline(), drums = timeline(), harmonic = timeline(), vocal = timeline(), bright = timeline();
    const onsetFlux = onsetIsDrums ? drums.slice() : timeline();
    const nDb = buf.readUInt32LE(o); o += 4;
    if (o + nDb * 2 > buf.length) throw new RangeError('truncated loudness');
    const loudnessShortTermDb = new Array<number>(nDb);
    for (let i = 0; i < nDb; i++) { loudnessShortTermDb[i] = buf.readInt16LE(o) / DB_SCALE; o += 2; }
    const rows = buf.readUInt32LE(o); o += 4;
    if (o + rows * CHROMA_BINS > buf.length) throw new RangeError('truncated chroma');
    const chroma: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row = new Array<number>(CHROMA_BINS);
      for (let i = 0; i < CHROMA_BINS; i++) row[i] = d8(buf[o++]);
      chroma.push(row);
    }
    return {
      version, hopSec, bass, drums, harmonic, vocal, brightness: bright, loudnessShortTermDb, onsetFlux, keyHopSec, chroma,
      loudness: { integratedDb, shortTermMaxDb, peakDb, truePeakDb, dynamicRangeDb, crestFactorDb },
      spectral: { centroidHz, lowRatio, midRatio, highRatio, flatness, brightness, muddiness },
      bassSummary: { subRatio, kickStrength, melodic },
      firstTransient,
    };
  } catch {
    return null;
  }
}
