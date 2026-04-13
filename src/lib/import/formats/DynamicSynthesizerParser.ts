/**
 * DynamicSynthesizerParser.ts — Dynamic Synthesizer (Chris Huelsbeck, pre-TFMX)
 *
 * Two-file format: DNS.* (sequence data) + SMP.* (sample data).
 * "Loaded module runs at 100Hz" — uses double-speed CIA timer.
 *
 * The module file is an AmigaOS HUNK executable containing the player code
 * and sequence data. The sample file is separate raw PCM.
 *
 * UADE eagleplayer.conf: DynamicSynthesizer  prefixes=dns
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isDynamicSynthesizerFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('dns.') || base.endsWith('.dns')) return true;
  }
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 20) return false;
  // HUNK executable with specific BRA pattern
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x03 && buf[3] === 0xF3) return false; // valid but not enough to confirm
  // Check for BRA.W (0x6000) start pattern common to DNS modules
  return u16BE(buf, 0) === 0x6000 && u16BE(buf, 4) === 0x6000;
}

export function parseDynamicSynthesizerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dns\./i, '').replace(/\.dns$/i, '') || baseName;

  // DNS modules are compiled 68k binaries. Extract what we can.
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < 4; i++) {
    instruments.push({
      id: i + 1, name: `DNS ${i + 1}`,
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Dynamic Synthesizer]`,
    format: 'MOD' as TrackerFormat,
    patterns: [{ id: 'pattern-0', name: 'Pattern 0', length: 64, channels: Array.from({ length: 4 }, (_, ch) => ({ id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null, rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) }],
    instruments, songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 3, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
