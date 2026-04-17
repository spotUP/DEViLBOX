/**
 * VoodooSupremeSynthesizerParser.ts — Voodoo Supreme Synthesizer
 *
 * Created by Tomas Partl / Voodoo Software in 1993.
 * Synthesis-based format (waveform generation, no PCM samples).
 *
 * UADE eagleplayer.conf: VoodooSupremeSynthesizer  prefixes=vss
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

export function isVoodooSupremeSynthesizerFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('vss.') || base.endsWith('.vss')) return true;
  }
  return false;
}

export function parseVoodooSupremeSynthesizerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^vss\./i, '').replace(/\.vss$/i, '') || baseName;

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 4; i++) {
    instruments.push({
      id: i + 1, name: `VSS Synth ${i + 1}`,
      type: 'synth' as const, synthType: 'VoodooWasmSynth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Voodoo Supreme]`,
    format: 'MOD' as TrackerFormat,
    patterns: [{ id: 'pattern-0', name: 'Pattern 0', length: 64, channels: Array.from({ length: 4 }, (_, ch) => ({ id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null, rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) }],
    instruments, songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
