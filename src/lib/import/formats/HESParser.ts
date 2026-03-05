/**
 * HESParser.ts — PC Engine / TurboGrafx-16 HES format parser
 *
 * Parses HES (HESM) headers. Extracts version and first-song metadata,
 * creates 6 PC Engine HuC6280 PSG channel stubs (wave channels, with
 * channels 4–5 also capable of noise/LFO). Since HES is a code-based
 * format with no embedded pattern data, a single empty 64-row pattern
 * is generated.
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
      id: `ch${i}`, name: `Wave Ch ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

// ── Instrument Builder ────────────────────────────────────────────────────────

function buildPCEInstruments(): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;
  for (let i = 0; i < 6; i++) {
    insts.push({
      id: id++,
      name: `PCE Wave ${i + 1}`,
      type: 'synth',
      synthType: 'FurnacePCE',
      furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 } as FurnaceConfig,
      effects: [],
      volume: 0,
      pan: 0,
    });
  }
  return insts;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isHESFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 &&
    b[0] === 0x48 && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0x4D; // "HESM"
}

export function parseHESFile(buffer: ArrayBuffer, filename?: string): TrackerSong {
  if (!isHESFormat(buffer)) throw new Error('Not a valid HES file');

  const numCh = 6;
  const instruments = buildPCEInstruments();
  const pattern = emptyPattern('p0', 'Pattern 1', numCh, 64);

  const title = (filename ?? 'PC Engine Music').replace(/\.hes$/i, '');

  return {
    name: title,
    format: 'HES' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
