/**
 * DynamicSynthesizerParser.ts - Dynamic Synthesizer (Chris Huelsbeck game music), dns.* / .dns / .ptc
 * 68k sound routine with its tables. Phase A: the grid is read-only.
 * Decoding lives in dynamicSynthesizerGrid.ts; this file wraps it into a TrackerSong with the
 * byte-exact stream carriers (`uadeVariableLayout.blockRows`). Playback stays on the UADE / nuade engine.
 *
 * UADE eagleplayer.conf: DynamicSynthesizer  prefixes=dns
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { dnsEncoder } from '@/engine/uade/encoders/DynamicSynthesizerEncoder';
import { buildDnsGrid } from './dynamicSynthesizerGrid';

export function isDynamicSynthesizerFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('dns.') || base.endsWith('.dns')) return true;
  }
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 20) return false;
  // BRA.W (0x6000) start pattern common to DNS modules
  return ((buf[0] << 8) | buf[1]) === 0x6000 && ((buf[4] << 8) | buf[5]) === 0x6000;
}

export function parseDynamicSynthesizerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const base = filename.split('/').pop() ?? filename;
  const moduleName = base.replace(/^dns\./i, '').replace(/\.(dns|ptc)$/i, '') || base;
  let patterns: Pattern[] = [];
  let songPositions: number[] = [0];
  let layout: UADEVariablePatternLayout | undefined;
  let unmatched: string | null = null;
  let bpm = 125;
  let speed = 6;

  const grid = buildDnsGrid(buf);
  if (typeof grid === 'string') {
    unmatched = grid;
  } else {
    patterns = grid.patterns;
    songPositions = grid.songPositions;
    bpm = grid.bpm;
    speed = grid.speed;
    layout = {
      formatId: 'dynamicSynthesizer',
      numChannels: 6,
      numFilePatterns: grid.streams.length,
      rowsPerPattern: patterns.map((p) => p.length),
      moduleSize: buf.length,
      encoder: dnsEncoder,
      filePatternAddrs: grid.streams.map((s) => s.offset),
      filePatternSizes: grid.streams.map((s) => s.size),
      trackMap: grid.streamAtStart,
      blockRows: grid.blockRows,
    };
  }

  if (!layout) {
    const emptyRows = (): TrackerCell[] => Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns = [{
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 6 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch & 1) === 0 ? -50 : 50, instrumentId: null, color: null, rows: emptyRows(),
      })),
    }];
  }

  patterns[0].importMetadata = {
    sourceFormat: 'MOD' as const,
    sourceFile: filename,
    importedAt: new Date().toISOString(),
    originalChannelCount: 6,
    originalPatternCount: patterns.length,
    originalInstrumentCount: 0,
  };

  const result: TrackerSong = {
    name: `${moduleName} [Dynamic Synthesizer]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: [],
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 6,
    // one grid row is one replayer step of `speed` ticks; the BPM sets the tick rate (125 = 50 Hz)
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
  };
  if (layout) (result as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout = layout;
  else result.gridUnmatchedReason = unmatched ?? 'the grid was not matched to the replayer';
  return result;
}
