/**
 * MidiToSong — MIDI → TrackerSong conversion
 *
 * Handles quantization, channel merging, and velocity-to-volume mapping.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';

export interface MidiImportOptions {
  quantize?: number;
  mergeChannels?: boolean;
  velocityToVolume?: boolean;
  defaultPatternLength?: number;
}

export async function parseMIDIFile(file: File, options?: MidiImportOptions): Promise<TrackerSong> {
  const { importMIDIFile } = await import('@lib/import/MIDIImporter');
  const result = await importMIDIFile(file, {
    quantize: options?.quantize ?? 1,
    mergeChannels: options?.mergeChannels ?? false,
    velocityToVolume: options?.velocityToVolume ?? true,
    defaultPatternLength: options?.defaultPatternLength ?? 64,
  });

  const order = result.patterns.map((_, i) => i);
  return {
    name: result.metadata.name,
    format: 'XM' as TrackerFormat,
    patterns: result.patterns,
    instruments: result.instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: result.patterns[0]?.channels?.length || 1,
    initialSpeed: 6,
    initialBPM: result.bpm,
  };
}
