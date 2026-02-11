/**
 * vstbridge-loader.ts - WASM loading utilities for VSTBridge synths
 *
 * Reuses patterns from mame-wasm-loader.ts:
 *  - preprocessEmscriptenJS() for AudioWorklet compatibility
 *  - Module cache per synth ID (no duplicate fetches)
 *  - Worklet dedup (register VSTBridge.worklet.js once per AudioContext)
 *  - Keepalive node to force process() calls
 */

import { preprocessEmscriptenJS } from '../mame/mame-wasm-loader';
import type { VSTBridgeDescriptor } from './synth-registry';

// Cache fetched WASM+JS per synth ID so multiple instances share one fetch
const moduleCache = new Map<string, Promise<{ wasmBinary: ArrayBuffer; jsCode: string }>>();

// Track which AudioContexts have the VSTBridge worklet registered
const workletRegistered = new WeakMap<AudioContext, boolean>();

/**
 * Ensure the VSTBridge worklet module is registered in the AudioContext,
 * then fetch and preprocess the WASM binary + Emscripten JS glue for the
 * given synth descriptor.
 *
 * Results are cached so multiple instances of the same synth don't re-fetch.
 */
export async function ensureVSTBridgeLoaded(
  context: AudioContext,
  descriptor: VSTBridgeDescriptor
): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
  const baseUrl = import.meta.env.BASE_URL || '/';

  // Register the VSTBridge worklet processor (once per AudioContext)
  if (!workletRegistered.get(context)) {
    try {
      await context.audioWorklet.addModule(`${baseUrl}vstbridge/VSTBridge.worklet.js`);
    } catch (_e) {
      // Module might already be added (e.g. hot reload)
    }
    workletRegistered.set(context, true);
  }

  // Fetch WASM + JS for this synth (cached across instances)
  const cacheKey = descriptor.id;
  if (!moduleCache.has(cacheKey)) {
    const promise = (async () => {
      const wasmUrl = `${baseUrl}${descriptor.wasmDir}/${descriptor.wasmFile}.wasm`;
      const jsUrl = `${baseUrl}${descriptor.wasmDir}/${descriptor.wasmFile}.js`;

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(wasmUrl),
        fetch(jsUrl),
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load ${wasmUrl}: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load ${jsUrl}: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text(),
      ]);

      const jsCode = preprocessEmscriptenJS(jsCodeRaw, `${baseUrl}${descriptor.wasmDir}/`);
      return { wasmBinary, jsCode };
    })();

    moduleCache.set(cacheKey, promise);
  }

  return moduleCache.get(cacheKey)!;
}

/**
 * Create an AudioWorkletNode for a VSTBridge synth, send it the WASM
 * binary + JS code, connect keepalive, and return a ready promise.
 */
export function createVSTBridgeNode(
  rawContext: AudioContext,
  descriptor: VSTBridgeDescriptor,
  wasmBinary: ArrayBuffer,
  jsCode: string,
  outputNode: AudioNode
): { workletNode: AudioWorkletNode; readyPromise: Promise<void> } {
  const workletNode = new AudioWorkletNode(rawContext, 'vstbridge-processor', {
    outputChannelCount: [2],
    processorOptions: {
      sampleRate: rawContext.sampleRate,
      synthClassName: descriptor.synthClassName,
      moduleFactoryName: descriptor.moduleFactoryName,
    },
  });

  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`VSTBridge ${descriptor.id} init timeout`)),
      10000
    );

    const originalOnMessage = workletNode.port.onmessage;
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        clearTimeout(timeout);
        resolve();
      } else if (event.data.type === 'error') {
        clearTimeout(timeout);
        reject(new Error(event.data.error || `VSTBridge ${descriptor.id} init error`));
      }
      // Forward to any handler set later
      if (originalOnMessage) originalOnMessage.call(workletNode.port, event);
    };
  });

  // Send init message with WASM binary and preprocessed JS
  workletNode.port.postMessage({
    type: 'init',
    wasmBinary,
    jsCode,
    sampleRate: rawContext.sampleRate,
  });

  // Connect to output
  workletNode.connect(outputNode);

  // CRITICAL: Connect through silent keepalive to destination to force process() calls
  try {
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    workletNode.connect(keepalive);
    keepalive.connect(rawContext.destination);
  } catch (_e) {
    /* keepalive failed */
  }

  return { workletNode, readyPromise };
}
