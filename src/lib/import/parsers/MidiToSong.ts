/**
 * MidiToSong — MIDI → TrackerSong conversion
 *
 * Handles quantization, channel merging, and velocity-to-volume mapping.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';

export interface MidiImportOptions {
  quantize?: number;
  velocityToVolume?: boolean;
  defaultPatternLength?: number;
}

export async function parseMIDIFile(file: File, options?: MidiImportOptions): Promise<TrackerSong> {
  const { importMIDIFile } = await import('@lib/import/MIDIImporter');
  const result = await importMIDIFile(file, {
    quantize: options?.quantize ?? 1,
    velocityToVolume: options?.velocityToVolume ?? true,
    defaultPatternLength: options?.defaultPatternLength ?? 64,
  });

  const order = result.patterns.map((_, i) => i);
  const maxChannels = result.patterns.reduce((max, p) => Math.max(max, p.channels.length), 1);
  return {
    name: result.metadata.name,
    format: 'XM' as TrackerFormat,
    patterns: result.patterns,
    instruments: result.instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: maxChannels,
    initialSpeed: 6,
    initialBPM: result.bpm,
  };
}
