/**
 * SilmarilsParser.ts — Silmarils Amiga music format (3-voice MIDI clone)
 *
 * Used in Silmarils games from "Targhan" to "Ishar I" (ECS), 1989-92.
 * 3-voice format with built-in sample depacking routine.
 *
 * Some modules use an external "main file" (Boston Bomb Club: MOK.BostonBombClub + _??? suffix).
 *
 * UADE eagleplayer.conf: Silmarils  prefixes=mok
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

export function isSilmarilsFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('mok.') || base.endsWith('.mok')) return true;
  }
  return false;
}

export function parseSilmarilsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mok\./i, '').replace(/\.mok$/i, '') || baseName;

  // Silmarils is a 3-voice MIDI clone with packed samples.
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 3; i++) {
    instruments.push({
      id: i + 1, name: `Silmarils ${i + 1}`,
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Silmarils]`,
    format: 'MOD' as TrackerFormat,
    patterns: [{ id: 'pattern-0', name: 'Pattern 0', length: 64, channels: Array.from({ length: 3 }, (_, ch) => ({ id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: ch === 0 ? -50 : ch === 1 ? 0 : 50, instrumentId: null, color: null, rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) }],
    instruments, songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 3, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
