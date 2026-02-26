/**
 * SawteethParser.ts — Sawteeth native parser
 *
 * Sawteeth is a software-synthesizer-based Amiga/PC music format.
 * Files use extension .st and begin with the mark "SWTD" (binary) or
 * "SWTT" (text/ASCII). This parser handles only the binary ("SWTD") variant.
 *
 * The format stores independent per-channel song sequences (each a list of
 * [partIndex, transpose, DAmp] steps), plus Parts (each a list of
 * [instrument, effect, note] steps) and synthesiser instruments.
 *
 * Reference: NostalgicPlayer SawteethWorker.cs (authoritative loader)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Sawteeth/
 *
 * Binary file layout (big-endian except where noted):
 *   0x000   4 bytes  Magic "SWTD" (or "SWTT" for text variant)
 *   +0      2 bytes  stVersion  (uint16 BE)
 *   +2      2 bytes  spsPal     (uint16 BE; only if stVersion >= 900; else 882)
 *   +4      1 byte   channelCount
 *   ...     per-channel ChannelInfo records
 *   ...     1 byte   partCount
 *   ...     per-part Part records
 *   ...     1 byte   instrumentCount - 1 (actual count = value + 1; index 0 is dummy)
 *   ...     per-instrument Ins records  (starting at index 1)
 *   ...     1 byte   breakPCount
 *   ...     per-break BreakPoint records (4+4 bytes each)
 *   ...     null-terminated / 0x0a-terminated strings: name, author,
 *             part[0..partCount-1].name, ins[1..instrumentCount-1].name
 *
 * ChannelInfo (one per channel):
 *   1 byte  Left (panning left)
 *   1 byte  Right (panning right)
 *   2 bytes Len  (step count; 1..8192)
 *   2 bytes LLoop (loop start; only if stVersion >= 910; else 0)
 *   2 bytes RLoop (right loop; only if stVersion >= 1200; else Len-1)
 *   Len × ChStep[]: { Part(1), Transp(1 signed), DAmp(1) }
 *
 * Part:
 *   1 byte  Sps  (steps per second; >= 1)
 *   1 byte  Len  (row count; >= 1)
 *   Len × Step[]: { Ins(1), Eff(1), Note(1) }
 *
 * Instrument (starting at index 1):
 *   1 byte  FilterPoints (>= 1)
 *   FilterPoints × { Time(1), Lev(1) }
 *   1 byte  AmpPoints (>= 1)
 *   AmpPoints × { Time(1), Lev(1) }
 *   1 byte  FilterMode
 *   1 byte  ClipMode_Boost  → Boost = low nibble, ClipMode = high nibble >> 4
 *   1 byte  VibS
 *   1 byte  VibD
 *   1 byte  PwmS
 *   1 byte  PwmD
 *   1 byte  Res
 *   1 byte  Sps  (>= 1)
 *   if stVersion < 900:
 *     1 byte combined: Len = tmp & 127; Loop = (tmp & 1) ? 0 : Len-1
 *   else:
 *     1 byte  Len (>= 1)
 *     1 byte  Loop (must be < Len)
 *   Len × InsStep[]: { combined(1) + Note(1) }
 *     combined: bit7 = Relative, bits[3:0] = WForm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CHAN = 12;
const CHN_STEPS = 8192;

// ── Utility ────────────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

/**
 * Read a null/LF/CR-terminated ASCII string from buf starting at off.
 * Returns { str, nextOff }.
 */
function readString(buf: Uint8Array, off: number): { str: string; nextOff: number } {
  let str = '';
  while (off < buf.length) {
    const c = buf[off++];
    if (c === 0x00 || c === 0x0a) break; // null or LF = end
    if (c === 0x0d) continue;            // CR = skip (like the C# code)
    str += String.fromCharCode(c);
  }
  return { str, nextOff: off };
}

// ── Internal types ─────────────────────────────────────────────────────────

interface SawteethChStep {
  part: number;
  transp: number; // signed
  dAmp: number;
}

interface SawteethChannelInfo {
  left: number;
  right: number;
  len: number;
  lLoop: number;
  rLoop: number;
  steps: SawteethChStep[];
}

interface SawteethStep {
  ins: number;
  eff: number;
  note: number;
}

interface SawteethPart {
  sps: number;
  len: number;
  steps: SawteethStep[];
  name: string;
}

interface SawteethInsStep {
  relative: boolean;
  wForm: number;
  note: number;
}

interface SawteethTimeLev {
  time: number;
  lev: number;
}

interface SawteethIns {
  filterPoints: number;
  filter: SawteethTimeLev[];
  ampPoints: number;
  amp: SawteethTimeLev[];
  filterMode: number;
  clipMode: number;
  boost: number;
  vibS: number;
  vibD: number;
  pwmS: number;
  pwmD: number;
  res: number;
  sps: number;
  len: number;
  loop: number;
  steps: SawteethInsStep[];
  name: string;
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` looks like a Sawteeth binary (SWTD) file.
 * Text variant (SWTT) is not supported by this parser.
 */
export function isSawteethFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;
  // Only accept binary "SWTD" variant
  return (
    bytes[0] === 0x53 && // 'S'
    bytes[1] === 0x57 && // 'W'
    bytes[2] === 0x54 && // 'T'
    bytes[3] === 0x44    // 'D'
  );
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sawteeth .st file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseSawteethFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isSawteethFormat(bytes)) return null;

  let off = 4; // skip "SWTD"

  // Version
  if (off + 2 > bytes.length) return null;
  const stVersion = u16BE(bytes, off); off += 2;
  if (stVersion > 1200) return null; // CurrentFileVersion

  // spsPal
  let spsPal: number;
  if (stVersion < 900) {
    spsPal = 882;
  } else {
    if (off + 2 > bytes.length) return null;
    spsPal = u16BE(bytes, off); off += 2;
  }

  // Position length check (stVersion >= 900)
  // Already validated by Identify, but we read it inline above when stVersion >= 900
  // The spsPal value doubles as the "position list length" check (>= 1)
  if (stVersion >= 900 && spsPal < 1) return null;

  // ── Channels ──────────────────────────────────────────────────────────
  if (off >= bytes.length) return null;
  const channelCount = u8(bytes, off++);
  if (channelCount < 1 || channelCount > MAX_CHAN) return null;

  const channels: SawteethChannelInfo[] = [];

  for (let i = 0; i < channelCount; i++) {
    if (off + 4 > bytes.length) return null;
    const left = u8(bytes, off++);
    const right = u8(bytes, off++);
    const len = u16BE(bytes, off); off += 2;

    let lLoop: number;
    if (stVersion < 910) {
      lLoop = 0;
    } else {
      if (off + 2 > bytes.length) return null;
      lLoop = u16BE(bytes, off); off += 2;
    }

    let rLoop: number;
    if (stVersion < 1200) {
      rLoop = len - 1;
    } else {
      if (off + 2 > bytes.length) return null;
      rLoop = u16BE(bytes, off); off += 2;
    }

    if (len < 1 || len > CHN_STEPS) return null;

    // Clamp rLoop
    const rLoopClamped = rLoop >= len ? len - 1 : rLoop;

    // Read steps
    const steps: SawteethChStep[] = [];
    for (let j = 0; j < len; j++) {
      if (off + 3 > bytes.length) return null;
      const part = u8(bytes, off++);
      const transp = s8(bytes[off++]);
      const dAmp = u8(bytes, off++);
      steps.push({ part, transp, dAmp });
    }

    channels.push({ left, right, len, lLoop, rLoop: rLoopClamped, steps });
  }

  // ── Parts ──────────────────────────────────────────────────────────────
  if (off >= bytes.length) return null;
  const partCount = u8(bytes, off++);
  if (partCount < 1) return null;

  const parts: SawteethPart[] = [];

  for (let i = 0; i < partCount; i++) {
    if (off + 2 > bytes.length) return null;
    const sps = u8(bytes, off++);
    if (sps < 1) return null;
    const len = u8(bytes, off++);
    if (len < 1) return null;

    const steps: SawteethStep[] = [];
    for (let j = 0; j < len; j++) {
      if (off + 3 > bytes.length) return null;
      const ins = u8(bytes, off++);
      const eff = u8(bytes, off++);
      const note = u8(bytes, off++);
      steps.push({ ins, eff, note });
    }

    parts.push({ sps, len, steps, name: '' });
  }

  // Fix up channel part references (clamp to valid range)
  for (let i = 0; i < channelCount; i++) {
    for (let j = 0; j < channels[i].len; j++) {
      if (channels[i].steps[j].part >= partCount) {
        channels[i].steps[j].part = partCount - 1;
      }
    }
  }

  // ── Instruments ────────────────────────────────────────────────────────
  if (off >= bytes.length) return null;
  const instrumentCountRaw = u8(bytes, off++);
  const instrumentCount = instrumentCountRaw + 1; // actual count = value + 1
  if (instrumentCount < 2) return null;

  // Dummy instrument 0
  const dummyIns: SawteethIns = {
    filterPoints: 1,
    filter: [{ time: 0, lev: 0 }],
    ampPoints: 1,
    amp: [{ time: 0, lev: 0 }],
    filterMode: 0,
    clipMode: 0,
    boost: 1,
    vibS: 1,
    vibD: 1,
    pwmS: 1,
    pwmD: 1,
    res: 0,
    sps: 30,
    len: 1,
    loop: 0,
    steps: [{ relative: false, wForm: 0, note: 0 }],
    name: '',
  };

  const instruments: SawteethIns[] = [dummyIns];

  for (let i = 1; i < instrumentCount; i++) {
    if (off >= bytes.length) return null;
    const filterPoints = u8(bytes, off++);
    if (filterPoints < 1) return null;

    const filter: SawteethTimeLev[] = [];
    for (let j = 0; j < filterPoints; j++) {
      if (off + 2 > bytes.length) return null;
      filter.push({ time: u8(bytes, off++), lev: u8(bytes, off++) });
    }

    if (off >= bytes.length) return null;
    const ampPoints = u8(bytes, off++);
    if (ampPoints < 1) return null;

    const amp: SawteethTimeLev[] = [];
    for (let j = 0; j < ampPoints; j++) {
      if (off + 2 > bytes.length) return null;
      amp.push({ time: u8(bytes, off++), lev: u8(bytes, off++) });
    }

    if (off + 8 > bytes.length) return null;
    const filterMode = u8(bytes, off++);
    const clipModeBoost = u8(bytes, off++);
    const boost = clipModeBoost & 0x0f;
    const clipMode = (clipModeBoost >> 4) & 0x0f;
    const vibS = u8(bytes, off++);
    const vibD = u8(bytes, off++);
    const pwmS = u8(bytes, off++);
    const pwmD = u8(bytes, off++);
    const res = u8(bytes, off++);
    const sps = u8(bytes, off++);
    if (sps < 1) return null;

    let len: number;
    let loop: number;

    if (stVersion < 900) {
      if (off >= bytes.length) return null;
      const tmp = u8(bytes, off++);
      len = tmp & 0x7f;
      loop = (tmp & 1) !== 0 ? 0 : (len > 0 ? len - 1 : 0);
    } else {
      if (off + 2 > bytes.length) return null;
      len = u8(bytes, off++);
      loop = u8(bytes, off++);
      if (len < 1 || loop >= len) return null;
    }

    if (len < 1) return null;

    const insSteps: SawteethInsStep[] = [];
    for (let j = 0; j < len; j++) {
      if (off + 2 > bytes.length) return null;
      const combined = u8(bytes, off++);
      const note = u8(bytes, off++);
      insSteps.push({
        relative: (combined & 0x80) !== 0,
        wForm: combined & 0x0f,
        note,
      });
    }

    instruments.push({
      filterPoints, filter, ampPoints, amp,
      filterMode, clipMode, boost,
      vibS, vibD, pwmS, pwmD, res, sps, len, loop,
      steps: insSteps,
      name: '',
    });
  }

  // ── Break points ───────────────────────────────────────────────────────
  if (off >= bytes.length) return null;
  const breakPCount = u8(bytes, off++);
  for (let i = 0; i < breakPCount; i++) {
    if (off + 8 > bytes.length) break;
    // pal(4) + command(4) — skip for parser
    off += 8;
  }

  // ── Names ──────────────────────────────────────────────────────────────
  let moduleName = filename.replace(/\.[^/.]+$/, '');
  let author = '';

  if (off < bytes.length) {
    const r1 = readString(bytes, off);
    if (r1.str) moduleName = r1.str;
    off = r1.nextOff;
  }
  if (off < bytes.length) {
    const r2 = readString(bytes, off);
    author = r2.str;
    off = r2.nextOff;
  }

  for (let i = 0; i < partCount && off < bytes.length; i++) {
    const r = readString(bytes, off);
    parts[i].name = r.str;
    off = r.nextOff;
  }

  for (let i = 1; i < instrumentCount && off < bytes.length; i++) {
    const r = readString(bytes, off);
    instruments[i].name = r.str;
    off = r.nextOff;
  }

  // ── Build InstrumentConfig[] ──────────────────────────────────────────
  // Sawteeth is fully synthesized — no PCM samples. Map each instrument as a
  // placeholder synth instrument. Instrument 0 is the dummy (skip for devilbox).
  const instrConfigs: InstrumentConfig[] = [];
  for (let i = 1; i < instrumentCount; i++) {
    const inst = instruments[i];
    instrConfigs.push({
      id: i,
      name: inst.name || `Instrument ${i}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Build patterns ─────────────────────────────────────────────────────
  // Sawteeth: each channel has its own independent step sequence. Each step
  // in a channel points to a Part; each Part has Len rows with { ins, eff, note }.
  // We flatten by taking each channel's step sequence and expanding all parts inline.
  // Song position = per-channel step index; rows within a step = part rows.
  //
  // Since channels are independent and have different total lengths we produce
  // one DEViLBOX pattern per "song position slot" where we zip channels:
  // Pattern P has as many rows as the maximum part.Len across all channel's
  // part reference at that position.
  //
  // To keep it simple: for each channel, pre-expand to a flat row list and
  // then emit one pattern per 16 (or per part boundary) rows.

  // Pre-expand each channel to a flat array of { ins, eff, note } rows.
  const expandedChannels: Array<Array<SawteethStep & { partIdx: number }>> = [];

  for (let ch = 0; ch < channelCount; ch++) {
    const chInfo = channels[ch];
    const flat: Array<SawteethStep & { partIdx: number }> = [];

    for (let si = 0; si <= chInfo.rLoop; si++) {
      const step = chInfo.steps[si];
      const partIdx = step.part < partCount ? step.part : partCount - 1;
      const part = parts[partIdx];

      for (let row = 0; row < part.len; row++) {
        const s = part.steps[row];
        // Apply note transpose from channel step
        let note = s.note;
        if (note > 0) {
          note = Math.max(1, Math.min(96, note + step.transp));
        }
        flat.push({ ins: s.ins, eff: s.eff, note, partIdx });
      }
    }

    expandedChannels.push(flat);
  }

  // Determine total row count
  const maxRows = Math.max(...expandedChannels.map(c => c.length), 1);
  const ROWS_PER_PATTERN = 64;
  const numPatterns = Math.ceil(maxRows / ROWS_PER_PATTERN);

  const trackerPatterns: Pattern[] = [];

  for (let p = 0; p < numPatterns; p++) {
    const startRow = p * ROWS_PER_PATTERN;
    const endRow = Math.min(startRow + ROWS_PER_PATTERN, maxRows);
    const patLen = endRow - startRow;

    const channelRows: TrackerCell[][] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const rows: TrackerCell[] = [];
      const chExpanded = expandedChannels[ch];

      for (let r = 0; r < patLen; r++) {
        const globalRow = startRow + r;
        if (globalRow >= chExpanded.length) {
          rows.push(emptyCell());
          continue;
        }

        const s = chExpanded[globalRow];
        const xmNote = s.note; // already 1-based XM note or 0
        const instrId = s.ins > 0 && s.ins < instrumentCount ? s.ins : 0;

        rows.push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channelRows.push(rows);
    }

    // Compute Amiga hard-pan based on channel left/right
    trackerPatterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: patLen,
      channels: channelRows.map((rows, ch) => {
        const chInfo = channels[ch];
        // Amiga-style pan: derive from left/right balance
        // left=255,right=0 → full left; left=0,right=255 → full right
        const panValue = Math.round(((chInfo.right - chInfo.left) / 255) * 50);
        return {
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: panValue,
          instrumentId: null,
          color: null,
          rows,
        };
      }),
      importMetadata: {
        sourceFormat: 'SAW',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: channelCount,
        originalPatternCount: partCount,
        originalInstrumentCount: instrumentCount - 1,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, channelCount, ROWS_PER_PATTERN));
  }

  void author;

  return {
    name: moduleName,
    format: 'SAW' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: channelCount,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(filename: string, numChannels: number, rowsPerPattern: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowsPerPattern,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowsPerPattern }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'SAW',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
