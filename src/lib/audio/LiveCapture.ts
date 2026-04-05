// src/lib/audio/LiveCapture.ts

import { getDevilboxAudioContext } from '@/utils/audio-context';

/** Silence detection parameters */
const CHUNK_SIZE = 4096;
const SILENCE_THRESHOLD = 0.001; // RMS < -60dB
const SILENCE_CHUNKS_REQUIRED = 2; // ~186ms confirmation
const MAX_DURATION_S = 4;
const MIN_DURATION_S = 0.5;
const FADE_TAIL_MS = 50;

/** Mono synth types that must use sequential chord baking */
export const MONO_WASM_SYNTHS = new Set([
  'TB303', 'Buzz3o3', 'DB303', 'RaffoSynth', 'CalfMono', 'VL1',
]);

/**
 * Capture raw PCM audio from a live AudioNode in real-time.
 * Uses ScriptProcessorNode to collect Float32 chunks with silence detection.
 *
 * @param synthOutput - The AudioNode to tap (e.g. DevilboxSynth.output GainNode)
 * @param triggerFn - Called after capture chain is connected. Start playing notes here.
 * @param releaseFn - Called after MIN_DURATION_S to release notes and capture release tail.
 * @param maxDuration - Maximum capture duration in seconds (default 4)
 * @returns AudioBuffer with trimmed audio (mono, 44100 or context sample rate)
 */
export function captureLiveAudio(
  synthOutput: AudioNode,
  triggerFn: () => void,
  releaseFn: () => void,
  maxDuration: number = MAX_DURATION_S,
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const ctx = getDevilboxAudioContext();
    const sampleRate = ctx.sampleRate;
    const maxSamples = Math.ceil(maxDuration * sampleRate);
    const minSamples = Math.ceil(MIN_DURATION_S * sampleRate);

    const chunks: Float32Array[] = [];
    let totalSamples = 0;
    let silentChunks = 0;
    let released = false;
    let done = false;

    // Create capture chain: synthOutput → scriptNode → silentGain(0) → destination
    // ScriptProcessorNode must be connected to destination to process audio
    const scriptNode = ctx.createScriptProcessor(CHUNK_SIZE, 1, 1);
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0; // mute output — user hears nothing

    synthOutput.connect(scriptNode);
    scriptNode.connect(silentGain);
    silentGain.connect(ctx.destination);

    const cleanup = () => {
      if (done) return;
      done = true;
      scriptNode.onaudioprocess = null;
      try { synthOutput.disconnect(scriptNode); } catch { /* already disconnected */ }
      try { scriptNode.disconnect(silentGain); } catch { /* already disconnected */ }
      try { silentGain.disconnect(ctx.destination); } catch { /* already disconnected */ }
    };

    // Safety timeout
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(buildAudioBuffer(chunks, sampleRate));
    }, (maxDuration + 0.5) * 1000);

    // Release timer — release notes after 1 second to capture attack+sustain+release
    const releaseDelay = Math.max(1.0, MIN_DURATION_S);
    const releaseTimer = setTimeout(() => {
      if (!done) {
        released = true;
        releaseFn();
      }
    }, releaseDelay * 1000);

    scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (done) return;

      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      totalSamples += input.length;

      // Calculate RMS for silence detection
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSq / input.length);

      if (rms < SILENCE_THRESHOLD) {
        silentChunks++;
      } else {
        silentChunks = 0;
      }

      // Stop conditions: silence detected (after min duration + release) OR max reached
      const pastMin = totalSamples >= minSamples;
      const silenceConfirmed = silentChunks >= SILENCE_CHUNKS_REQUIRED;

      if ((pastMin && released && silenceConfirmed) || totalSamples >= maxSamples) {
        clearTimeout(timeoutId);
        clearTimeout(releaseTimer);
        cleanup();
        resolve(buildAudioBuffer(chunks, sampleRate));
      }
    };

    // Start playing — trigger AFTER capture chain is connected
    try {
      triggerFn();
    } catch (err) {
      clearTimeout(timeoutId);
      clearTimeout(releaseTimer);
      cleanup();
      reject(err);
    }
  });
}

/**
 * Assemble Float32 chunks into a mono AudioBuffer with trailing silence trimmed
 * and a short fade-to-zero applied at the end.
 */
function buildAudioBuffer(chunks: Float32Array[], sampleRate: number): AudioBuffer {
  // Concatenate chunks
  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  const pcm = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }

  // Trim trailing silence
  const trimmed = trimTrailingSilence(pcm, sampleRate);

  // Create AudioBuffer
  const buffer = new AudioBuffer({
    length: Math.max(1, trimmed.length),
    numberOfChannels: 1,
    sampleRate,
  });
  buffer.copyToChannel(trimmed as Float32Array<ArrayBuffer>, 0);
  return buffer;
}

/**
 * Remove trailing silence and apply a short linear fade-to-zero.
 */
function trimTrailingSilence(pcm: Float32Array, sampleRate: number): Float32Array {
  // Find last sample above threshold
  let lastAudible = pcm.length - 1;
  for (let i = pcm.length - 1; i >= 0; i--) {
    if (Math.abs(pcm[i]) > SILENCE_THRESHOLD) {
      lastAudible = i;
      break;
    }
  }

  // Keep a small tail for the fade
  const fadeSamples = Math.ceil((FADE_TAIL_MS / 1000) * sampleRate);
  const endIndex = Math.min(pcm.length, lastAudible + fadeSamples + 1);
  const trimmed = pcm.slice(0, endIndex);

  // Apply linear fade-to-zero on the tail
  const fadeStart = Math.max(0, endIndex - fadeSamples);
  for (let i = fadeStart; i < trimmed.length; i++) {
    const fadePos = (i - fadeStart) / fadeSamples; // 0→1
    trimmed[i] *= (1 - fadePos);
  }

  return trimmed;
}

/**
 * Mix multiple AudioBuffers (mono) into one, normalizing to prevent clipping.
 * Used for sequential chord baking of monophonic synths.
 */
export function mixAndNormalize(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) throw new Error('No buffers to mix');
  if (buffers.length === 1) return buffers[0];

  const sampleRate = buffers[0].sampleRate;
  const maxLength = Math.max(...buffers.map(b => b.length));
  const mixed = new Float32Array(maxLength);

  for (const buf of buffers) {
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      mixed[i] += data[i];
    }
  }

  // Normalize peak
  let peak = 0;
  for (let i = 0; i < mixed.length; i++) {
    const abs = Math.abs(mixed[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const scale = 1.0 / peak;
    for (let i = 0; i < mixed.length; i++) {
      mixed[i] *= scale;
    }
  }

  const output = new AudioBuffer({
    length: maxLength,
    numberOfChannels: 1,
    sampleRate,
  });
  output.copyToChannel(mixed, 0);
  return output;
}
