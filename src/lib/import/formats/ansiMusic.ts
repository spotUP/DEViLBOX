/**
 * ANSI music: byte scanner and BASIC PLAY interpreter (plan items B1, B2).
 *
 * Pure TypeScript, no DOM, no engine imports. Rules follow GW-BASIC PLAY
 * (GWSTS.ASM) and are pinned by the shared golden vectors in
 * __tests__/fixtures/ansi-music/vectors.json (decisions D3, D5, D6, D8).
 */

const ESC = 0x1b;
const CAN = 0x18;
const SUB = 0x1a;
const SO = 0x0e;
const LBRACKET = 0x5b;

export type AnsiMusicIntro = 'M' | 'N' | '|';

export interface AnsiMusicBlock {
  /** Offset of the ESC that starts the intro. */
  start: number;
  /** Offset one past the last byte the block consumed (terminator included when swallowed). */
  end: number;
  intro: AnsiMusicIntro;
  /** PLAY payload. For ESC[M it starts with the 'M' of the MB/MF/ML/MN/MS command when the intro letter was one. */
  payload: Uint8Array;
  /** Payload contains ';': a SMILE sound effect, yields no notes. */
  smile: boolean;
}

export interface AnsiMusicScan {
  blocks: AnsiMusicBlock[];
  /** Bytes outside every block (what a terminal would still print or interpret). */
  text: Uint8Array;
}

export interface PlayEvent {
  /** Whole Hz after the GW round-up; 0 for a rest. */
  hz: number;
  /** Full length in milliseconds, 3 decimals. */
  ms: number;
  /** Milliseconds of sound (articulation), 3 decimals. */
  gate: number;
  rest: boolean;
}

const isDigit = (b: number): boolean => b >= 0x30 && b <= 0x39;
const upper = (b: number): number => (b >= 0x61 && b <= 0x7a ? b - 0x20 : b);

/** CSI M is music only when the first non-space byte starts a PLAY command (plan B1 / vector about). */
function csiMStartsMusic(bytes: Uint8Array, from: number): { music: boolean; prefixM: boolean; at: number } {
  let i = from;
  while (i < bytes.length && bytes[i] === 0x20) i++;
  if (i >= bytes.length) return { music: false, prefixM: false, at: i };
  const c = upper(bytes[i]);
  if (c === SO) return { music: true, prefixM: false, at: i };
  if (c === 0x42 || c === 0x46 || c === 0x4c || c === 0x53) return { music: true, prefixM: true, at: i }; // B F L S
  if (c === 0x4e) {
    // N + digit is a note, bare N is MN
    const digit = i + 1 < bytes.length && isDigit(bytes[i + 1]);
    return { music: true, prefixM: !digit, at: i };
  }
  if (c >= 0x41 && c <= 0x47) return { music: true, prefixM: false, at: i }; // A-G
  if (c === 0x4f || c === 0x50 || c === 0x54 || c === 0x3c || c === 0x3e) return { music: true, prefixM: false, at: i }; // O P T < >
  return { music: false, prefixM: false, at: i };
}

export function scanAnsiMusicBlocks(bytes: Uint8Array): AnsiMusicScan {
  const blocks: AnsiMusicBlock[] = [];
  const text: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === ESC && i + 2 < bytes.length + 0 && bytes[i + 1] === LBRACKET) {
      const k = bytes[i + 2];
      let intro: AnsiMusicIntro | null = null;
      let payloadStart = i + 3;
      let prefixM = false;
      if (k === 0x4e || k === 0x7c) {
        intro = k === 0x4e ? 'N' : '|';
      } else if (k === 0x4d) {
        const r = csiMStartsMusic(bytes, i + 3);
        if (r.music) {
          intro = 'M';
          payloadStart = r.at;
          prefixM = r.prefixM;
        }
      }
      if (intro) {
        let j = payloadStart;
        while (j < bytes.length && bytes[j] !== SO && bytes[j] !== ESC && bytes[j] !== CAN && bytes[j] !== SUB) j++;
        const raw = bytes.subarray(payloadStart, j);
        let payload: Uint8Array;
        if (prefixM) {
          payload = new Uint8Array(raw.length + 1);
          payload[0] = 0x4d;
          payload.set(raw, 1);
        } else {
          payload = raw.slice();
        }
        // SO, CAN and SUB are swallowed; ESC starts the next escape sequence.
        const end = j < bytes.length && bytes[j] !== ESC ? j + 1 : j;
        blocks.push({ start: i, end, intro, payload, smile: payload.includes(0x3b) });
        i = end;
        continue;
      }
    }
    text.push(b);
    i++;
  }
  return { blocks, text: Uint8Array.from(text) };
}

/** GW-BASIC NOTTAB, octave 6, whole Hz, C..B. Lower octaves shift right with round-half-up. */
const OCTAVE6_HZ = [4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040, 7459, 7902];
const NOTE_INDEX: Record<number, number> = { 0x43: 0, 0x44: 2, 0x45: 4, 0x46: 5, 0x47: 7, 0x41: 9, 0x42: 11 };

/** Semitone index 0 (O0 C) .. 83 (O6 B) to whole Hz. */
export function semitoneToHz(semi: number): number {
  const s = Math.max(0, Math.min(83, semi));
  const octave = Math.floor(s / 12);
  const shift = 6 - octave;
  const base = OCTAVE6_HZ[s % 12];
  return shift === 0 ? base : (base + (1 << (shift - 1))) >> shift;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function interpretPlay(payload: Uint8Array): PlayEvent[] {
  const events: PlayEvent[] = [];
  let octave = 4;
  let defLen = 4;
  let tempo = 120;
  let gateFrac = 7 / 8;
  let i = 0;
  const n = payload.length;

  const peek = (): number => (i < n ? upper(payload[i]) : -1);
  const readNumber = (): number | null => {
    let j = i;
    let v = 0;
    let any = false;
    while (j < n && isDigit(payload[j])) {
      v = Math.min(v * 10 + (payload[j] - 0x30), 100000);
      j++;
      any = true;
    }
    if (!any) return null;
    i = j;
    return v;
  };
  const readDots = (): number => {
    let f = 1;
    while (i < n && payload[i] === 0x2e) {
      f *= 1.5;
      i++;
    }
    return f;
  };
  const lengthMs = (len: number, dots: number): number => (240000 / (tempo * len)) * dots;
  const push = (hz: number, ms: number, rest: boolean): void => {
    events.push({ hz, ms: round3(ms), gate: rest ? 0 : round3(ms * gateFrac), rest });
  };

  while (i < n) {
    const c = peek();
    i++;
    if (c >= 0x41 && c <= 0x47) {
      let semi = octave * 12 + NOTE_INDEX[c];
      while (i < n && (payload[i] === 0x23 || payload[i] === 0x2b || payload[i] === 0x2d)) {
        semi += payload[i] === 0x2d ? -1 : 1;
        i++;
      }
      const len = readNumber();
      const l = len === null ? defLen : clamp(len, 1, 64);
      push(semitoneToHz(semi), lengthMs(l, readDots()), false);
    } else if (c === 0x4e) {
      const v = readNumber();
      if (v === null || v > 84) continue;
      const dots = readDots();
      if (v === 0) push(0, lengthMs(defLen, dots), true);
      else push(semitoneToHz(v - 1), lengthMs(defLen, dots), false);
    } else if (c === 0x50) {
      const len = readNumber();
      const l = len === null ? defLen : clamp(len, 1, 64);
      push(0, lengthMs(l, readDots()), true);
    } else if (c === 0x4f) {
      const v = readNumber();
      if (v !== null) octave = clamp(v, 0, 6);
    } else if (c === 0x3e) {
      octave = Math.min(6, octave + 1);
    } else if (c === 0x3c) {
      octave = Math.max(0, octave - 1);
    } else if (c === 0x4c) {
      const v = readNumber();
      if (v !== null) defLen = clamp(v, 1, 64);
    } else if (c === 0x54) {
      const v = readNumber();
      if (v !== null) tempo = clamp(v, 32, 255);
    } else if (c === 0x4d) {
      const m = peek();
      if (m === 0x4e) {
        gateFrac = 7 / 8;
        i++;
      } else if (m === 0x53) {
        gateFrac = 3 / 4;
        i++;
      } else if (m === 0x4c) {
        gateFrac = 1;
        i++;
      } else if (m === 0x42 || m === 0x46) {
        i++; // background / foreground: ignored
      }
    }
    // every other byte (spaces, CR, LF, '"', unknown letters) is skipped
  }
  return events;
}
