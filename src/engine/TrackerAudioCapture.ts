/**
 * TrackerAudioCapture - Background audio capture for analysis
 *
 * Taps into ToneEngine's masterChannel to capture stereo PCM data 
 * during playback. When enough audio is captured, it can be sent 
 * to the analysis worker for genre/mood detection.
 *
 * Uses ScriptProcessorNode (deprecated but widely supported) for
 * side-branch capture that doesn't affect the audio path.
 */

import * as Tone from 'tone';
import { useTrackerAnalysisStore } from '@/stores/useTrackerAnalysisStore';
import { getToneEngine } from '@/engine/ToneEngine';
import { getNativeAudioNode } from '@/utils/audio-context';

// ── Configuration ────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const TARGET_SECONDS = 45;
const TARGET_SAMPLES = SAMPLE_RATE * TARGET_SECONDS;
const BUFFER_SIZE = 4096; // ScriptProcessor buffer size

// ── Types ────────────────────────────────────────────────────────────────────

export interface CapturedAudio {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  durationMs: number;
}

// ── Singleton State ──────────────────────────────────────────────────────────

let scriptProcessor: ScriptProcessorNode | null = null;
let captureBufferL: Float32Array | null = null;
let captureBufferR: Float32Array | null = null;
let capturedSamples = 0;
let isCapturing = false;
let currentFileHash: string | null = null;
let onCaptureComplete: ((audio: CapturedAudio) => void) | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start capturing audio from the master output.
 * @param fileHash - Hash of the current file (for tracking)
 * @param onComplete - Callback when capture reaches target duration
 */
export function startCapture(
  fileHash: string,
  onComplete: (audio: CapturedAudio) => void,
): void {
  // Stop any existing capture
  stopCapture();
  
  // Initialize buffers
  captureBufferL = new Float32Array(TARGET_SAMPLES);
  captureBufferR = new Float32Array(TARGET_SAMPLES);
  capturedSamples = 0;
  isCapturing = true;
  currentFileHash = fileHash;
  onCaptureComplete = onComplete;
  
  // Update store
  useTrackerAnalysisStore.getState().startCapture(fileHash);
  
  // Get the audio context
  const toneCtx = Tone.getContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (toneCtx as any).rawContext ?? (toneCtx as any)._context ?? toneCtx;
  
  if (!ctx || typeof ctx.createScriptProcessor !== 'function') {
    console.warn('[TrackerAudioCapture] AudioContext not available');
    useTrackerAnalysisStore.getState().setError('AudioContext not available');
    return;
  }
  
  // Create ScriptProcessor for capture (side-branch, doesn't affect audio)
  const processor = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
  scriptProcessor = processor;
  
  let debugCounter = 0;
  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!isCapturing || !captureBufferL || !captureBufferR) return;
    
    const inputL = event.inputBuffer.getChannelData(0);
    const inputR = event.inputBuffer.numberOfChannels > 1 
      ? event.inputBuffer.getChannelData(1) 
      : inputL;
    
    // Debug: log every ~2 seconds
    debugCounter++;
    if (debugCounter % 20 === 1) {
      const maxSample = Math.max(...Array.from(inputL).map(Math.abs));
      console.log(`[TrackerAudioCapture] Capturing... ${capturedSamples} samples, max amplitude: ${maxSample.toFixed(4)}`);
    }
    
    // Copy samples to capture buffer
    const samplesToCapture = Math.min(
      inputL.length,
      TARGET_SAMPLES - capturedSamples,
    );
    
    if (samplesToCapture > 0) {
      captureBufferL.set(inputL.subarray(0, samplesToCapture), capturedSamples);
      captureBufferR.set(inputR.subarray(0, samplesToCapture), capturedSamples);
      capturedSamples += samplesToCapture;
      
      // Update progress
      const progress = (capturedSamples / TARGET_SAMPLES) * 100;
      useTrackerAnalysisStore.getState().setCaptureProgress(progress);
    }
    
    // Check if capture complete
    if (capturedSamples >= TARGET_SAMPLES) {
      finishCapture();
    }
    
    // Output goes to silent gain node, no need to pass through audio
    // (leaving output buffer zeroed avoids any potential audio artifacts)
  };
  
  // Connect to ToneEngine's masterChannel (where all audio flows through)
  try {
    const toneEngine = getToneEngine();
    const masterChannel = toneEngine.masterChannel;
    
    // Get the native AudioNode from the Tone.Channel using the utility
    const masterNode = getNativeAudioNode(masterChannel);
    
    console.log('[TrackerAudioCapture] masterChannel:', masterChannel);
    console.log('[TrackerAudioCapture] masterNode:', masterNode, 'constructor:', masterNode?.constructor?.name);
    
    if (masterNode && typeof masterNode.connect === 'function' && scriptProcessor) {
      // Create a silent gain node to terminate the scriptProcessor
      // (ScriptProcessor requires being connected to work, but we don't want to re-route audio)
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(ctx.destination);
      
      masterNode.connect(scriptProcessor);
      scriptProcessor.connect(silentGain); // Connect to silent node, not destination
      console.log(`[TrackerAudioCapture] Started capturing (target: ${TARGET_SECONDS}s)`);
    } else {
      throw new Error('Could not find masterChannel native node to tap');
    }
  } catch (err) {
    console.error('[TrackerAudioCapture] Failed to connect:', err);
    useTrackerAnalysisStore.getState().setError('Failed to connect audio capture');
    stopCapture();
  }
}

/**
 * Stop capturing audio and discard buffers.
 */
export function stopCapture(): void {
  if (scriptProcessor) {
    try {
      scriptProcessor.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    scriptProcessor = null;
  }
  
  captureBufferL = null;
  captureBufferR = null;
  capturedSamples = 0;
  isCapturing = false;
  currentFileHash = null;
  onCaptureComplete = null;
}

/**
 * Manually finish capture early (e.g., when playback stops).
 * Returns the captured audio if any, or null if not enough data.
 */
export function finishCaptureEarly(): CapturedAudio | null {
  if (!isCapturing || !captureBufferL || !captureBufferR) {
    return null;
  }
  
  // Need at least 10 seconds for meaningful analysis
  const MIN_SAMPLES = SAMPLE_RATE * 10;
  if (capturedSamples < MIN_SAMPLES) {
    console.log(`[TrackerAudioCapture] Not enough audio captured (${(capturedSamples / SAMPLE_RATE).toFixed(1)}s < 10s)`);
    return null;
  }
  
  return finishCapture();
}

/**
 * Check if currently capturing.
 */
export function isCurrentlyCapturing(): boolean {
  return isCapturing;
}

/**
 * Get current capture progress (0-100).
 */
export function getCaptureProgress(): number {
  if (!isCapturing || capturedSamples === 0) return 0;
  return (capturedSamples / TARGET_SAMPLES) * 100;
}

/**
 * Get the current file hash being captured.
 */
export function getCurrentFileHash(): string | null {
  return currentFileHash;
}

// ── Internal ─────────────────────────────────────────────────────────────────

function finishCapture(): CapturedAudio | null {
  if (!captureBufferL || !captureBufferR || capturedSamples === 0) {
    stopCapture();
    return null;
  }
  
  // Trim to actual captured length
  const left = captureBufferL.slice(0, capturedSamples);
  const right = captureBufferR.slice(0, capturedSamples);
  const durationMs = (capturedSamples / SAMPLE_RATE) * 1000;
  
  console.log(`[TrackerAudioCapture] Capture complete: ${capturedSamples} samples (${(durationMs / 1000).toFixed(1)}s)`);
  
  const result: CapturedAudio = {
    left,
    right,
    sampleRate: SAMPLE_RATE,
    durationMs,
  };
  
  // Call completion callback
  if (onCaptureComplete) {
    onCaptureComplete(result);
  }
  
  // Cleanup
  stopCapture();
  
  return result;
}
