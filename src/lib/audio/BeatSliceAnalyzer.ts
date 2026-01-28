/**
 * BeatSliceAnalyzer
 *
 * Automatic beat/transient detection using spectral flux analysis.
 * Supports three modes:
 * - Transient: Automatic detection using spectral flux with adaptive threshold
 * - Grid: Even divisions based on tempo
 * - Manual: User-placed markers (handled by UI)
 */

import type {
  BeatSlice,
  BeatSliceConfig,
  TransientAnalysisResult,
} from '../../types/beatSlicer';

// FFT parameters for spectral analysis
const FFT_SIZE = 2048;
const HOP_SIZE = 512;

/**
 * Generate unique ID for slices
 */
function generateSliceId(): string {
  return `slice_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Compute the magnitude spectrum from FFT data
 */
function computeMagnitudeSpectrum(real: Float32Array<ArrayBufferLike>, imag: Float32Array<ArrayBufferLike>): Float32Array {
  const magnitude = new Float32Array(real.length);
  for (let i = 0; i < real.length; i++) {
    magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return magnitude;
}

/**
 * Apply Hann window to audio frame
 */
function applyHannWindow(frame: Float32Array): Float32Array {
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frame.length - 1)));
    windowed[i] = frame[i] * multiplier;
  }
  return windowed;
}

/**
 * Simple in-place FFT implementation
 * Uses Cooley-Tukey algorithm
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey FFT
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let uReal = 1;
      let uImag = 0;

      for (let jj = 0; jj < halfLen; jj++) {
        const evenIdx = i + jj;
        const oddIdx = i + jj + halfLen;

        const tReal = uReal * real[oddIdx] - uImag * imag[oddIdx];
        const tImag = uReal * imag[oddIdx] + uImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] = real[evenIdx] + tReal;
        imag[evenIdx] = imag[evenIdx] + tImag;

        const newUReal = uReal * wReal - uImag * wImag;
        uImag = uReal * wImag + uImag * wReal;
        uReal = newUReal;
      }
    }
  }
}

/**
 * Compute spectral flux between consecutive frames
 * Uses half-wave rectification (only positive changes count)
 */
function computeSpectralFlux(
  currentSpectrum: Float32Array<ArrayBufferLike>,
  previousSpectrum: Float32Array<ArrayBufferLike>
): number {
  let flux = 0;
  for (let i = 0; i < currentSpectrum.length; i++) {
    const diff = currentSpectrum[i] - previousSpectrum[i];
    if (diff > 0) {
      flux += diff;
    }
  }
  return flux;
}

/**
 * Find nearest zero crossing in audio data
 */
function findNearestZeroCrossing(
  audioData: Float32Array,
  targetFrame: number,
  searchRadius: number = 256
): number {
  const start = Math.max(0, targetFrame - searchRadius);
  const end = Math.min(audioData.length - 1, targetFrame + searchRadius);

  let bestFrame = targetFrame;
  let minDistance = searchRadius + 1;

  for (let i = start; i < end; i++) {
    // Check for zero crossing between samples
    if ((audioData[i] >= 0 && audioData[i + 1] < 0) ||
        (audioData[i] < 0 && audioData[i + 1] >= 0)) {
      const distance = Math.abs(i - targetFrame);
      if (distance < minDistance) {
        minDistance = distance;
        bestFrame = i;
      }
    }
  }

  return bestFrame;
}

/**
 * Convert mono audio buffer to Float32Array
 */
function getMonoData(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Mix stereo to mono
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const mono = new Float32Array(audioBuffer.length);

  for (let i = 0; i < audioBuffer.length; i++) {
    mono[i] = (left[i] + right[i]) * 0.5;
  }

  return mono;
}

/**
 * Detect transients using spectral flux analysis
 */
export function detectTransients(
  audioBuffer: AudioBuffer,
  config: BeatSliceConfig
): TransientAnalysisResult {
  const sampleRate = audioBuffer.sampleRate;
  const monoData = getMonoData(audioBuffer);
  const totalFrames = audioBuffer.length;

  // Calculate number of analysis frames
  const numFrames = Math.floor((totalFrames - FFT_SIZE) / HOP_SIZE) + 1;
  if (numFrames < 2) {
    return {
      slices: [],
      spectralFlux: new Float32Array(0),
      threshold: new Float32Array(0),
      peaks: [],
    };
  }

  // Compute spectral flux for each frame
  const spectralFlux = new Float32Array(numFrames);
  let previousSpectrum: Float32Array<ArrayBufferLike> = new Float32Array(FFT_SIZE / 2);

  for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
    const startSample = frameIdx * HOP_SIZE;

    // Extract and window the frame
    const frame = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE && startSample + i < totalFrames; i++) {
      frame[i] = monoData[startSample + i];
    }
    const windowed = applyHannWindow(frame);

    // Compute FFT
    const real = windowed;
    const imag = new Float32Array(FFT_SIZE);
    fft(real, imag);

    // Get magnitude spectrum (only need positive frequencies)
    const spectrum = computeMagnitudeSpectrum(
      real.subarray(0, FFT_SIZE / 2),
      imag.subarray(0, FFT_SIZE / 2)
    );

    // Compute spectral flux
    spectralFlux[frameIdx] = computeSpectralFlux(spectrum, previousSpectrum);
    previousSpectrum = spectrum;
  }

  // Compute adaptive threshold
  // threshold = mean + k * std, where k is derived from sensitivity
  // sensitivity 0 -> k = 2.0 (less sensitive)
  // sensitivity 1 -> k = 0.5 (more sensitive)
  const k = 2.0 - config.sensitivity * 1.5;

  // Use a sliding window for local statistics
  const windowSize = Math.floor(sampleRate / HOP_SIZE); // ~1 second window
  const threshold = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    const start = Math.max(0, i - windowSize / 2);
    const end = Math.min(numFrames, i + windowSize / 2);
    const windowLength = end - start;

    // Calculate local mean and std
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += spectralFlux[j];
    }
    const mean = sum / windowLength;

    let sumSq = 0;
    for (let j = start; j < end; j++) {
      const diff = spectralFlux[j] - mean;
      sumSq += diff * diff;
    }
    const std = Math.sqrt(sumSq / windowLength);

    threshold[i] = mean + k * std;
  }

  // Peak picking with minimum distance constraint
  const minDistanceFrames = Math.floor(
    (config.minSliceMs / 1000) * sampleRate / HOP_SIZE
  );
  const peaks: number[] = [];

  for (let i = 1; i < numFrames - 1; i++) {
    // Check if this is a local maximum above threshold
    if (
      spectralFlux[i] > threshold[i] &&
      spectralFlux[i] > spectralFlux[i - 1] &&
      spectralFlux[i] >= spectralFlux[i + 1]
    ) {
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistanceFrames) {
        peaks.push(i);
      }
    }
  }

  // Convert peaks to sample frames and create slices
  const slices: BeatSlice[] = [];

  // Always start with a slice at the beginning
  const peakFrames = [0, ...peaks.map(p => p * HOP_SIZE)];

  for (let i = 0; i < peakFrames.length; i++) {
    let startFrame = peakFrames[i];
    let endFrame = i < peakFrames.length - 1 ? peakFrames[i + 1] : totalFrames;

    // Snap to zero crossings if enabled
    if (config.snapToZeroCrossing) {
      startFrame = findNearestZeroCrossing(monoData, startFrame);
      if (i < peakFrames.length - 1) {
        endFrame = findNearestZeroCrossing(monoData, endFrame);
      }
    }

    // Calculate confidence based on spectral flux magnitude
    let confidence = 1.0;
    if (i > 0 && i <= peaks.length) {
      const peakIdx = peaks[i - 1];
      const fluxValue = spectralFlux[peakIdx];
      const threshValue = threshold[peakIdx];
      // Normalize confidence: how much above threshold
      confidence = Math.min(1, Math.max(0, (fluxValue - threshValue) / threshValue + 0.5));
    }

    slices.push({
      id: generateSliceId(),
      startFrame,
      endFrame,
      startTime: startFrame / sampleRate,
      endTime: endFrame / sampleRate,
      confidence,
    });
  }

  return {
    slices,
    spectralFlux,
    threshold,
    peaks,
  };
}

/**
 * Generate evenly-spaced grid slices based on tempo
 */
export function generateGridSlices(
  audioBuffer: AudioBuffer,
  bpm: number,
  division: number,
  config: BeatSliceConfig
): BeatSlice[] {
  const sampleRate = audioBuffer.sampleRate;
  const totalFrames = audioBuffer.length;
  const monoData = getMonoData(audioBuffer);

  // Calculate slice duration in samples
  const beatsPerSecond = bpm / 60;
  const slicesPerBeat = division / 4; // division=4 means quarter notes, 16 means 16th notes
  const slicesPerSecond = beatsPerSecond * slicesPerBeat;
  const framesPerSlice = Math.floor(sampleRate / slicesPerSecond);

  // Minimum frames per slice
  const minFrames = Math.floor((config.minSliceMs / 1000) * sampleRate);
  const effectiveFramesPerSlice = Math.max(minFrames, framesPerSlice);

  const slices: BeatSlice[] = [];
  let currentFrame = 0;

  while (currentFrame < totalFrames) {
    let startFrame = currentFrame;
    let endFrame = Math.min(currentFrame + effectiveFramesPerSlice, totalFrames);

    // Snap to zero crossings if enabled
    if (config.snapToZeroCrossing) {
      if (currentFrame > 0) {
        startFrame = findNearestZeroCrossing(monoData, startFrame);
      }
      if (endFrame < totalFrames) {
        endFrame = findNearestZeroCrossing(monoData, endFrame);
      }
    }

    slices.push({
      id: generateSliceId(),
      startFrame,
      endFrame,
      startTime: startFrame / sampleRate,
      endTime: endFrame / sampleRate,
      confidence: 1.0, // Grid slices always have full confidence
    });

    currentFrame += effectiveFramesPerSlice;
  }

  return slices;
}

/**
 * Add a manual slice at a specific frame position
 */
export function addManualSlice(
  existingSlices: BeatSlice[],
  framePosition: number,
  audioBuffer: AudioBuffer,
  config: BeatSliceConfig
): BeatSlice[] {
  const sampleRate = audioBuffer.sampleRate;
  const monoData = getMonoData(audioBuffer);

  // Snap to zero crossing if enabled
  let sliceFrame = framePosition;
  if (config.snapToZeroCrossing) {
    sliceFrame = findNearestZeroCrossing(monoData, framePosition);
  }

  // Find which existing slice this position falls within
  const sliceIdx = existingSlices.findIndex(
    s => sliceFrame >= s.startFrame && sliceFrame < s.endFrame
  );

  if (sliceIdx === -1) {
    // Position is outside all slices, just return existing
    return existingSlices;
  }

  const targetSlice = existingSlices[sliceIdx];

  // Don't split if too close to existing boundaries
  const minFrames = Math.floor((config.minSliceMs / 1000) * sampleRate);
  if (
    sliceFrame - targetSlice.startFrame < minFrames ||
    targetSlice.endFrame - sliceFrame < minFrames
  ) {
    return existingSlices;
  }

  // Split the slice
  const newSlices = [...existingSlices];

  // Modify existing slice to end at new position
  newSlices[sliceIdx] = {
    ...targetSlice,
    endFrame: sliceFrame,
    endTime: sliceFrame / sampleRate,
  };

  // Insert new slice from position to original end
  const newSlice: BeatSlice = {
    id: generateSliceId(),
    startFrame: sliceFrame,
    endFrame: targetSlice.endFrame,
    startTime: sliceFrame / sampleRate,
    endTime: targetSlice.endTime,
    confidence: 1.0,
  };

  newSlices.splice(sliceIdx + 1, 0, newSlice);

  return newSlices;
}

/**
 * Remove a slice and merge with previous
 */
export function removeSlice(
  slices: BeatSlice[],
  sliceId: string
): BeatSlice[] {
  const idx = slices.findIndex(s => s.id === sliceId);
  if (idx === -1 || slices.length <= 1) {
    return slices;
  }

  const newSlices = [...slices];
  const removedSlice = newSlices[idx];

  if (idx > 0) {
    // Merge with previous slice
    newSlices[idx - 1] = {
      ...newSlices[idx - 1],
      endFrame: removedSlice.endFrame,
      endTime: removedSlice.endTime,
    };
  } else if (idx < newSlices.length - 1) {
    // First slice - extend next slice backwards
    newSlices[idx + 1] = {
      ...newSlices[idx + 1],
      startFrame: removedSlice.startFrame,
      startTime: removedSlice.startTime,
    };
  }

  newSlices.splice(idx, 1);
  return newSlices;
}

/**
 * Estimate BPM from transient positions
 * Uses inter-onset interval (IOI) histogram method
 */
export function estimateBPM(
  slices: BeatSlice[],
  sampleRate: number
): number {
  if (slices.length < 3) {
    return 120; // Default BPM
  }

  // Calculate all inter-onset intervals
  const intervals: number[] = [];
  for (let i = 1; i < slices.length; i++) {
    const interval = (slices[i].startFrame - slices[i - 1].startFrame) / sampleRate;
    if (interval > 0.1 && interval < 2) {
      // Only consider intervals between 100ms and 2s
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    return 120;
  }

  // Find median interval (more robust than mean)
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];

  // Convert to BPM, assuming intervals represent beat divisions
  const beatsPerSecond = 1 / medianInterval;
  let bpm = beatsPerSecond * 60;

  // Normalize to reasonable BPM range (60-200)
  while (bpm < 60) bpm *= 2;
  while (bpm > 200) bpm /= 2;

  return Math.round(bpm);
}

/**
 * Extract audio data for a single slice
 */
export function extractSliceAudio(
  audioBuffer: AudioBuffer,
  slice: BeatSlice,
  options?: { fadeInMs?: number; fadeOutMs?: number; normalize?: boolean }
): AudioBuffer {
  const { fadeInMs = 0, fadeOutMs = 0, normalize = false } = options || {};

  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const sliceLength = slice.endFrame - slice.startFrame;

  // Create new AudioBuffer for the slice
  // Note: This requires an AudioContext, so we use OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(numChannels, sliceLength, sampleRate);
  const sliceBuffer = offlineCtx.createBuffer(numChannels, sliceLength, sampleRate);

  // Calculate fade samples
  const fadeInSamples = Math.floor((fadeInMs / 1000) * sampleRate);
  const fadeOutSamples = Math.floor((fadeOutMs / 1000) * sampleRate);

  // Find peak for normalization
  let peak = 0;
  if (normalize) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = audioBuffer.getChannelData(ch);
      for (let i = slice.startFrame; i < slice.endFrame; i++) {
        peak = Math.max(peak, Math.abs(sourceData[i]));
      }
    }
  }
  const normalizationGain = normalize && peak > 0 ? 1 / peak : 1;

  // Copy and process audio data
  for (let ch = 0; ch < numChannels; ch++) {
    const sourceData = audioBuffer.getChannelData(ch);
    const destData = sliceBuffer.getChannelData(ch);

    for (let i = 0; i < sliceLength; i++) {
      let sample = sourceData[slice.startFrame + i] * normalizationGain;

      // Apply fade in
      if (fadeInSamples > 0 && i < fadeInSamples) {
        sample *= i / fadeInSamples;
      }

      // Apply fade out
      const samplesFromEnd = sliceLength - i - 1;
      if (fadeOutSamples > 0 && samplesFromEnd < fadeOutSamples) {
        sample *= samplesFromEnd / fadeOutSamples;
      }

      destData[i] = sample;
    }
  }

  return sliceBuffer;
}

/**
 * Main analyzer class for beat slicing
 */
export class BeatSliceAnalyzer {
  private audioBuffer: AudioBuffer | null = null;

  constructor(audioBuffer?: AudioBuffer) {
    this.audioBuffer = audioBuffer || null;
  }

  setAudioBuffer(buffer: AudioBuffer): void {
    this.audioBuffer = buffer;
  }

  /**
   * Analyze the audio buffer and return slices based on config
   */
  analyze(config: BeatSliceConfig, bpm?: number): BeatSlice[] {
    if (!this.audioBuffer) {
      return [];
    }

    switch (config.mode) {
      case 'transient':
        const result = detectTransients(this.audioBuffer, config);
        return result.slices;

      case 'grid':
        const effectiveBpm = bpm || 120;
        return generateGridSlices(
          this.audioBuffer,
          effectiveBpm,
          config.gridDivision,
          config
        );

      case 'manual':
        // Manual mode starts with single slice covering whole sample
        return [{
          id: generateSliceId(),
          startFrame: 0,
          endFrame: this.audioBuffer.length,
          startTime: 0,
          endTime: this.audioBuffer.length / this.audioBuffer.sampleRate,
          confidence: 1.0,
        }];

      default:
        return [];
    }
  }

  /**
   * Get detailed analysis results (for visualization)
   */
  analyzeWithDetails(config: BeatSliceConfig): TransientAnalysisResult | null {
    if (!this.audioBuffer || config.mode !== 'transient') {
      return null;
    }
    return detectTransients(this.audioBuffer, config);
  }

  /**
   * Estimate BPM from current slices
   */
  estimateBPM(slices: BeatSlice[]): number {
    if (!this.audioBuffer) return 120;
    return estimateBPM(slices, this.audioBuffer.sampleRate);
  }

  /**
   * Extract a single slice as a new AudioBuffer
   */
  extractSlice(
    slice: BeatSlice,
    options?: { fadeInMs?: number; fadeOutMs?: number; normalize?: boolean }
  ): AudioBuffer | null {
    if (!this.audioBuffer) return null;
    return extractSliceAudio(this.audioBuffer, slice, options);
  }
}

export default BeatSliceAnalyzer;
