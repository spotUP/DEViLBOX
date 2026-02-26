/**
 * SIDParser.ts — Commodore 64 SID file format parser (PSID/RSID)
 *
 * Parses the 124–128 byte header to extract metadata (title, author,
 * song count, SID model flags, dual/triple SID config) and creates
 * FurnaceSID6581 / FurnaceSID8580 instrument stubs per voice.
 * Full pattern extraction requires 6502 CPU emulation — not in scope.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `SID ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && buf[off + i] !== 0; i++) s += String.fromCharCode(buf[off + i]);
  return s.trim();
}

/** Map SID model bits to SynthType. bits[1:0]: 01=6581, 10=8580, 11=both, 00=unknown. */
function sidModelType(flags: number, shift: number): 'FurnaceSID6581' | 'FurnaceSID8580' {
  const model = (flags >> shift) & 0x03;
  return model === 0x02 ? 'FurnaceSID8580' : 'FurnaceSID6581';
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isSIDFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 &&
    ((b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x49 && b[3] === 0x44) || // PSID
     (b[0] === 0x52 && b[1] === 0x53 && b[2] === 0x49 && b[3] === 0x44));  // RSID
}

export async function parseSIDFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isSIDFormat(buffer)) throw new Error('Not a valid SID file');
  const buf = new Uint8Array(buffer);
  const dv  = new DataView(buffer);

  const version    = dv.getUint16(4, false);
  const flags      = version >= 2 && buf.length > 119 ? dv.getUint16(118, false) : 0;
  const has2ndSID  = version >= 2 && buf.length > 120 && buf[120] !== 0;
  const has3rdSID  = version >= 3 && buf.length > 121 && buf[121] !== 0;

  const title  = readStr(buf, 22, 32);
  const author = readStr(buf, 54, 32);

  // SID chip types per chip (bits[3:2] for SID1, [7:6] for SID2)
  const st1 = sidModelType(flags, 2);
  const st2 = has2ndSID ? sidModelType(flags, 6) : st1;

  const instruments: InstrumentConfig[] = [];
  const chips = 1 + (has2ndSID ? 1 : 0) + (has3rdSID ? 1 : 0);
  let id = 1;
  for (let chip = 0; chip < chips; chip++) {
    const st = chip === 0 ? st1 : st2;
    const label = chip > 0 ? `SID${chip + 1}` : 'SID';
    for (let v = 1; v <= 3; v++) {
      instruments.push({
        id: id++,
        name: `${label} Voice ${v}`,
        type: 'synth', synthType: st,
        furnace: { ...DEFAULT_FURNACE, chipType: 3, ops: 2 },
      });
    }
  }

  const numCh = instruments.length;

  return {
    name: (title || filename.replace(/\.sid$/i, '')) + (author ? ` — ${author}` : ''),
    format: 'SID' as TrackerFormat,
    patterns: [emptyPattern(numCh)],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
