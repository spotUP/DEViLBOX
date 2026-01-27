/**
 * NeuralEnhancerWorker
 * Handles Audio Super Resolution inference using ONNX Runtime Web.
 */

import * as ort from 'onnxruntime-web';
import { bufferToDataUrl } from './SampleProcessing';
import type { ProcessedResult } from './SampleProcessing';

// Initialize ONNX runtime options
const ORT_OPTIONS: ort.InferenceSession.SessionOptions = {
  executionProviders: ['webgpu', 'wasm'],
  graphOptimizationLevel: 'all',
};

export interface NeuralEnhancementOptions {
  modelType: 'resurrect' | 'denoise';
  strength: number;
}

let session: ort.InferenceSession | null = null;

/**
 * Load the enhancement model
 */
async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session;

  try {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const modelUrl = `${baseUrl}models/enhancement/resurrect.onnx`;
    
    console.log(`[NeuralEnhancer] Loading model from ${modelUrl}...`);
    session = await ort.InferenceSession.create(modelUrl, ORT_OPTIONS);
    console.log('[NeuralEnhancer] Model loaded successfully.');
    return session;
  } catch (err) {
    console.warn('[NeuralEnhancer] Could not load ONNX model. Falling back to high-quality DSP upsampling.');
    throw err;
  }
}

/**
 * Run neural enhancement inference
 */
export async function runNeuralEnhancement(
  inputBuffer: AudioBuffer,
  options: NeuralEnhancementOptions
): Promise<ProcessedResult> {
  const targetSampleRate = Math.max(inputBuffer.sampleRate, 44100);
  
  try {
    const sess = await getSession();
    
    // 1. Pre-processing
    const audioData = inputBuffer.getChannelData(0);
    const tensorInput = new ort.Tensor('float32', audioData, [1, 1, audioData.length]);

    // 2. Inference
    const feeds = { input: tensorInput };
    const results = await sess.run(feeds);
    
    // 3. Post-processing: Create new AudioBuffer from result
    const outputDataRaw = results.output.data;
    const outputData = outputDataRaw instanceof Float32Array ? outputDataRaw : new Float32Array(outputDataRaw as any);
    
    const outputBuffer = new AudioBuffer({
      length: outputData.length,
      numberOfChannels: 1,
      sampleRate: targetSampleRate
    });
    outputBuffer.copyToChannel(outputData, 0);
    const dataUrl = await bufferToDataUrl(outputBuffer);
    return { buffer: outputBuffer, dataUrl };

  } catch (err) {
    // FALLBACK: High-quality DSP Spectral Band Replication (SBR) simulation
    const renderedBuffer = await fallbackDSPUpsample(inputBuffer, options);
    const dataUrl = await bufferToDataUrl(renderedBuffer);
    return { buffer: renderedBuffer, dataUrl };
  }
}

/**
 * Advanced DSP Fallback
 */
async function fallbackDSPUpsample(
  buffer: AudioBuffer,
  options: NeuralEnhancementOptions
): Promise<AudioBuffer> {
  const targetSampleRate = 44100;
  const targetLength = Math.ceil(buffer.duration * targetSampleRate);
  
  const ctx = new OfflineAudioContext(1, targetLength, targetSampleRate);
  
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  
  // Multi-band Harmonic Generator
  // Band 1: 4k - 8k
  const hp1 = ctx.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 4000;
  const ws1 = ctx.createWaveShaper();
  ws1.curve = createHarmonicCurve(0.4) as any;
  
  // Band 2: 8k - 16k
  const hp2 = ctx.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 8000;
  const ws2 = ctx.createWaveShaper();
  ws2.curve = createHarmonicCurve(0.7) as any;
  
  const mix1 = ctx.createGain();
  mix1.gain.value = 0.12 * options.strength;
  const mix2 = ctx.createGain();
  mix2.gain.value = 0.08 * options.strength;
  
  const dry = ctx.createGain();
  dry.gain.value = 1.0;
  
  source.connect(dry);
  dry.connect(ctx.destination);
  
  source.connect(hp1);
  hp1.connect(ws1);
  ws1.connect(mix1);
  mix1.connect(ctx.destination);
  
  source.connect(hp2);
  hp2.connect(ws2);
  ws2.connect(mix2);
  mix2.connect(ctx.destination);
  
  source.start(0);
  return await ctx.startRendering();
}

function createHarmonicCurve(amount: number): Float32Array {
  const size = 4096;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i * 2) / size - 1;
    curve[i] = x + (Math.pow(x, 3) - x) * amount;
  }
  return curve;
}
