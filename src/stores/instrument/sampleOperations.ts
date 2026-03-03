/**
 * Pure helper functions for sample-related operations.
 * These are called by useInstrumentStore actions — the store remains
 * the single Zustand store and the only export at its original path.
 */

import { WaveformProcessor } from '@/lib/audio/WaveformProcessor';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { BeatSlice } from '@typedefs/beatSlicer';
import { DEFAULT_ENVELOPE, DEFAULT_DRUMKIT } from '@typedefs/instrument';
import type { DrumKitKeyMapping } from '@typedefs/instrument/drums';

// Minimal engine interface so callers can pass getToneEngine() without importing it here
export interface AudioEngine {
  decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer>;
  encodeAudioData(buffer: AudioBuffer): Promise<ArrayBuffer>;
  bakeInstrument?(config: InstrumentConfig, duration: number, note: string): Promise<AudioBuffer>;
}

// ---------------------------------------------------------------------------
// Destructive editing helpers
// ---------------------------------------------------------------------------

export async function processSampleReverse(
  rawBuffer: ArrayBuffer,
  engine: AudioEngine,
): Promise<ArrayBuffer> {
  const audioBuffer = await engine.decodeAudioData(rawBuffer);
  const newBuffer = WaveformProcessor.reverse(audioBuffer);
  return engine.encodeAudioData(newBuffer);
}

export async function processSampleNormalize(
  rawBuffer: ArrayBuffer,
  engine: AudioEngine,
): Promise<ArrayBuffer> {
  const audioBuffer = await engine.decodeAudioData(rawBuffer);
  const newBuffer = WaveformProcessor.normalize(audioBuffer);
  return engine.encodeAudioData(newBuffer);
}

export async function processSampleInvertLoop(
  rawBuffer: ArrayBuffer,
  loopStart: number,
  loopEnd: number,
  engine: AudioEngine,
): Promise<ArrayBuffer> {
  const audioBuffer = await engine.decodeAudioData(rawBuffer);
  const newBuffer = WaveformProcessor.invertLoop(audioBuffer, loopStart, loopEnd);
  return engine.encodeAudioData(newBuffer);
}

// ---------------------------------------------------------------------------
// Beat-slice helpers
// ---------------------------------------------------------------------------

/** Compute the new slices array after removing a slice (merging neighbours). */
export function computeSliceRemoval(
  slices: BeatSlice[],
  sliceId: string,
): BeatSlice[] | null {
  const idx = slices.findIndex((s) => s.id === sliceId);
  if (idx === -1 || slices.length <= 1) return null;

  const result = slices.map((s) => ({ ...s }));
  const removedSlice = result[idx];

  if (idx > 0) {
    result[idx - 1].endFrame = removedSlice.endFrame;
    result[idx - 1].endTime = removedSlice.endTime;
  } else if (idx < result.length - 1) {
    result[idx + 1].startFrame = removedSlice.startFrame;
    result[idx + 1].startTime = removedSlice.startTime;
  }

  result.splice(idx, 1);
  return result;
}

/** Build individual sliced-instrument configs from source + slices. */
export function buildSlicedInstruments(
  sourceInstrument: InstrumentConfig,
  slices: BeatSlice[],
  newIds: number[],
  sampleRate: number,
  namePrefix = 'Slice',
): InstrumentConfig[] {
  return slices.map((slice, i) => {
    const sliceLength = slice.endFrame - slice.startFrame;
    const sliceName = slice.label || `${namePrefix} ${i + 1}`;
    const instrumentName = sourceInstrument.name
      ? `${sourceInstrument.name} - ${sliceName}`
      : sliceName;

    return {
      id: newIds[i],
      name: instrumentName.slice(0, 22),
      type: 'sample' as const,
      synthType: 'Sampler' as const,
      sample: {
        url: sourceInstrument.sample!.url,
        sourceInstrumentId: sourceInstrument.id,
        sliceStart: slice.startFrame,
        sliceEnd: slice.endFrame,
        baseNote: sourceInstrument.sample?.baseNote || 'C-4',
        detune: sourceInstrument.sample?.detune || 0,
        loop: false,
        loopStart: 0,
        loopEnd: sliceLength,
        sampleRate,
        reverse: false,
        playbackRate: 1,
      },
      envelope: sourceInstrument.envelope || { ...DEFAULT_ENVELOPE },
      effects: [],
      volume: sourceInstrument.volume || -6,
      pan: sourceInstrument.pan || 0,
    } as InstrumentConfig;
  });
}

/** Build a DrumKit instrument + its individual slice instruments. */
export async function buildDrumKitFromSlices(
  sourceInstrument: InstrumentConfig,
  slices: BeatSlice[],
  audioBuffer: AudioBuffer,
  sliceIds: number[],
  drumKitId: number,
  engine: AudioEngine,
  namePrefix = 'Kit',
): Promise<{ kit: InstrumentConfig; sliceInstruments: InstrumentConfig[] }> {
  const sliceInstruments: InstrumentConfig[] = [];
  const keymap: DrumKitKeyMapping[] = [];

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const sliceLength = slice.endFrame - slice.startFrame;
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    const offlineCtx = new OfflineAudioContext(numChannels, sliceLength, sampleRate);
    const sliceBuffer = offlineCtx.createBuffer(numChannels, sliceLength, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = audioBuffer.getChannelData(ch);
      const destData = sliceBuffer.getChannelData(ch);
      for (let j = 0; j < sliceLength; j++) {
        destData[j] = sourceData[slice.startFrame + j];
      }
    }

    const sliceArrayBuffer = await engine.encodeAudioData(sliceBuffer);
    const blob = new Blob([sliceArrayBuffer], { type: 'audio/wav' });
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    const sliceName = slice.label || `Slice ${i + 1}`;

    sliceInstruments.push({
      id: sliceIds[i],
      name: `(Slice ${i + 1})`.slice(0, 22),
      type: 'sample',
      synthType: 'Sampler',
      sample: {
        url: dataUrl,
        audioBuffer: sliceArrayBuffer,
        baseNote: 'C-4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: sliceLength,
        sampleRate,
        reverse: false,
        playbackRate: 1,
      },
      envelope: { ...DEFAULT_ENVELOPE, sustain: 100 },
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig);

    const midiNote = 36 + i;
    if (midiNote <= 127) {
      keymap.push({
        id: `mapping-${sliceIds[i]}`,
        noteStart: midiNote,
        noteEnd: midiNote,
        sampleId: String(sliceIds[i]),
        sampleUrl: dataUrl,
        sampleName: sliceName,
        pitchOffset: 0,
        fineTune: 0,
        volumeOffset: 0,
        panOffset: 0,
        baseNote: 'C-4',
      });
    }
  }

  const kitName = sourceInstrument.name
    ? `${sourceInstrument.name} ${namePrefix}`
    : `Sliced ${namePrefix}`;

  const kit: InstrumentConfig = {
    id: drumKitId,
    name: kitName.slice(0, 22),
    type: 'synth',
    synthType: 'DrumKit',
    drumKit: { ...DEFAULT_DRUMKIT, keymap },
    envelope: { ...DEFAULT_ENVELOPE, sustain: 100 },
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig;

  return { kit, sliceInstruments };
}
