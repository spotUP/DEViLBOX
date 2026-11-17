/**
 * ProTracker4Parser.ts - ProTracker 4.1 songs (https://github.com/akustikrausch/protracker4).
 *
 * A PT 4.1 file is a MOD with up to three additions: a "PT4X" block of extra
 * samples (32..63) after sample 31, a dynamic-loop envelope after the data of
 * a sample whose finetune byte has bit 7 set, and an 8-byte "PT41" footer.
 * The file walk here follows libpt4's loader (protracker4-wasm/libpt4/src/load.c),
 * which is also the player (ProTracker4Engine). A file with none of the three
 * additions is a plain MOD and stays on the MOD path.
 *
 * The grid and samples 1..31 come from the one MOD parser, fed the file with
 * the additions taken out; the PT4X samples are appended. The song keeps
 * format 'MOD' (same cells, same effect meanings); its layout id 'pt41' is
 * what routes edits and export to the PT4 file.
 */
import type { ParsedInstrument } from '@/types/tracker';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { convertParsedInstruments } from '../InstrumentConverter';
import { parseMODFile } from './MODParser';

const HEADER_SIZE = 1084;
const SAMPLE_HEADER_SIZE = 30;

interface Pt4Sample { header: number; data: number; length: number }

export interface ProTracker4Scan {
  channels: number;
  /** Samples in file order: 31 MOD slots, then the PT4X entries. `header` and `data` are file offsets. */
  samples: Pt4Sample[];
  /** A footer, a PT4X block or a valid dynamic-loop envelope is present. */
  extended: boolean;
}

/** Channel count by module id, as libpt4 reads it. Null: not a module the PT4 path takes (FLT8, 15-sample). */
function channelsForId(id: string): number | null {
  if (['M.K.', 'M!K!', '!PM!', 'FLT4', 'EXO4'].includes(id)) return 4;
  if (['8CHN', 'OCTA', 'CD81'].includes(id)) return 8;
  if (id === 'CD61') return 6;
  const narrow = id.match(/^TDZ([1-4])$/) ?? id.match(/^([1-9])CHN$/);
  if (narrow) return parseInt(narrow[1], 10);
  const wide = id.match(/^(\d\d)C[HN]$/);
  if (wide) { const n = parseInt(wide[1], 10); if (n >= 9 && n <= 32) return n; }
  return null;
}

const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** Walk the file the way libpt4's loader does. Null when it is not a 31-sample module or is cut short. */
export function scanProTracker4(buffer: ArrayBuffer): ProTracker4Scan | null {
  const b = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (b.length < HEADER_SIZE) return null;
  const channels = channelsForId(tag(b, 1080));
  if (channels === null) return null;

  let len = b.length;
  let extended = false;
  if (len >= 608 && tag(b, len - 8) === 'PT41' && b[len - 4] === 0x04) { len -= 8; extended = true; }

  let numPatterns = 0;
  for (let i = 0; i < 128; i++) numPatterns = Math.max(numPatterns, b[952 + i]);
  numPatterns += 1;

  const headers: number[] = Array.from({ length: 31 }, (_, i) => 20 + i * SAMPLE_HEADER_SIZE);
  const samples: Pt4Sample[] = [];
  let at = HEADER_SIZE + numPatterns * channels * 256;
  for (let cur = 0; cur < headers.length; cur++) {
    const header = headers[cur];
    const length = view.getUint16(header + 22, false) * 2;
    if (at + length > len) return null;
    samples.push({ header, data: at, length });
    at += length;
    if (length && (b[header + 24] & 0x80) && at + 4 <= len) {
      const L = view.getUint32(at, false);
      if (L === 0) at += 4;
      else if (L >= 8 && L <= 65536 && !(L & 1) && at + 4 + L <= len) {
        const segments = view.getInt16(at + 4, false);
        let ok = segments > 0 && segments <= (L - 4) / 4;
        for (let k = 0; ok && k < segments; k++) if (view.getUint16(at + 8 + k * 4 + 2, false) > 64) ok = false;
        if (ok) { at += 4 + L; extended = true; }
      }
    }
    if (cur === 30 && at + 8 <= len && tag(b, at) === 'PT4X') {
      const count = view.getUint32(at + 4, false);
      if (count >= 1 && count <= 32 && at + 8 + count * SAMPLE_HEADER_SIZE <= len) {
        for (let i = 0; i < count; i++) headers.push(at + 8 + i * SAMPLE_HEADER_SIZE);
        at += 8 + count * SAMPLE_HEADER_SIZE;
        extended = true;
      }
    }
  }
  return { channels, samples, extended };
}

/** True for a file with a PT 4.1 addition. A plain MOD is false: it stays on the MOD path. */
export function isProTracker4Format(buffer: ArrayBuffer): boolean {
  return scanProTracker4(buffer)?.extended === true;
}

/** The module id the MOD parser reads this channel count from. */
function plainModId(channels: number): string {
  if (channels === 4) return 'M.K.';
  return channels < 10 ? `${channels}CHN` : `${channels}CH`;
}

export async function parseProTracker4File(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const scan = scanProTracker4(buffer);
  if (!scan) throw new Error('Not a ProTracker 4 module');
  const b = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // The same song as a plain MOD: header, patterns, then the data of samples
  // 1..31 back to back (envelopes, PT4X block and footer left out).
  const first31 = scan.samples.slice(0, 31);
  const patternsEnd = first31[0].data;
  const plain = new Uint8Array(patternsEnd + first31.reduce((n, s) => n + s.length, 0));
  plain.set(b.subarray(0, patternsEnd));
  const id = plainModId(scan.channels);
  for (let i = 0; i < 4; i++) plain[1080 + i] = id.charCodeAt(i);
  let at = patternsEnd;
  for (const s of first31) { plain.set(b.subarray(s.data, s.data + s.length), at); at += s.length; }

  const song = await parseMODFile(plain.buffer, filename);

  const extra: ParsedInstrument[] = scan.samples.slice(31).map((s, i) => {
    const slot = 32 + i;
    const name = String.fromCharCode(...b.subarray(s.header, s.header + 22)).replace(/\0.*$/, '').trim();
    const finetune = b[s.header + 24] & 0x0f;
    const loopLength = view.getUint16(s.header + 28, false);
    return {
      id: slot,
      name,
      samples: s.length === 0 ? [] : [{
        id: slot,
        name,
        pcmData: b.slice(s.data, s.data + s.length).buffer,
        loopStart: view.getUint16(s.header + 26, false) * 2,
        loopLength: loopLength * 2,
        loopType: loopLength > 1 ? 'forward' as const : 'none' as const,
        volume: Math.min(b[s.header + 25], 64),
        finetune: finetune > 7 ? finetune - 16 : finetune,
        relativeNote: 0,
        panning: 128,
        bitDepth: 8 as const,
        sampleRate: 8363,
        length: s.length,
      }],
      fadeout: 0,
      volumeType: 'none' as const,
      panningType: 'none' as const,
    };
  });

  return {
    ...song,
    instruments: [...song.instruments, ...convertParsedInstruments(extra, 'MOD')],
    uadePatternLayout: { ...song.uadePatternLayout!, formatId: 'pt41', moduleSize: buffer.byteLength },
    // The bytes a saved song is reopened from are the PT4 file, not the plain MOD built above.
    originalModuleData: undefined,
    protracker4FileData: buffer.slice(0),
  };
}
