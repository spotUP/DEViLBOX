/**
 * Shared WASM loading helpers for MAME chip synths.
 *
 * All MAME chip synths follow the same pattern:
 *  1. Main thread fetches .wasm binary + .js Emscripten glue
 *  2. JS is preprocessed for AudioWorklet compatibility
 *  3. Both are sent to the worklet via postMessage
 *  4. Worklet evaluates JS via new Function() and initializes WASM
 */

import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';

// Cache fetched WASM+JS per chip name so multiple instances share one fetch
const moduleCache = new Map<string, Promise<{ wasmBinary: ArrayBuffer; jsCode: string }>>();

// Track which worklet modules have been added per AudioContext
const workletLoadedMap = new WeakMap<AudioContext, Set<string>>();

/**
 * Preprocess Emscripten-generated JS for AudioWorklet compatibility.
 *
 * AudioWorklet scope does not support:
 *  - import.meta.url
 *  - ES module export default
 *  - Node.js dynamic import() blocks
 *
 * We also expose wasmMemory on the Module object so the worklet can
 * regenerate Float32Array views after WASM memory growth.
 */
export function preprocessEmscriptenJS(jsCode: string, baseUrl: string): string {
  return jsCode
    .replace(/import\.meta\.url/g, `"${baseUrl}"`)
    .replace(/export\s+default\s+\w+;?\s*$/, '')
    .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
    .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
}

/**
 * Ensure the worklet module JS file is loaded into the AudioContext,
 * then fetch and preprocess the WASM binary + Emscripten JS glue.
 *
 * Results are cached so multiple synth instances don't re-fetch.
 *
 * @returns { wasmBinary, jsCode } ready to send to the worklet
 */
export async function ensureMAMEModuleLoaded(
  context: AudioContext,
  chipName: string,
  workletFile: string
): Promise<{ wasmBinary: ArrayBuffer; jsCode: string }> {
  const baseUrl = import.meta.env.BASE_URL || '/';

  // Load worklet module file (once per context per chip)
  let loaded = workletLoadedMap.get(context);
  if (!loaded) {
    loaded = new Set();
    workletLoadedMap.set(context, loaded);
  }
  // Load the shared init helper first (sets globalThis.initMAMEWasmModule)
  if (!loaded.has('__mame_init_helper__')) {
    try {
      await context.audioWorklet.addModule(`${baseUrl}mame/mame-worklet-init.js`);
    } catch (_e) {
      // Module might already be added
    }
    loaded.add('__mame_init_helper__');
  }

  // Then load the chip-specific worklet processor
  if (!loaded.has(chipName)) {
    try {
      await context.audioWorklet.addModule(`${baseUrl}mame/${workletFile}`);
    } catch (_e) {
      // Module might already be added
    }
    loaded.add(chipName);
  }

  // Fetch WASM + JS (cached across instances)
  if (!moduleCache.has(chipName)) {
    const promise = (async () => {
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}mame/${chipName}.wasm`),
        fetch(`${baseUrl}mame/${chipName}.js`)
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load ${chipName}.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load ${chipName}.js: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const jsCode = preprocessEmscriptenJS(jsCodeRaw, `${baseUrl}mame/`);
      return { wasmBinary, jsCode };
    })();

    moduleCache.set(chipName, promise);
  }

  return moduleCache.get(chipName)!;
}

/**
 * Create an AudioWorkletNode for a MAME chip synth, send it the WASM
 * binary + JS code, connect keepalive, and return a ready promise.
 */
export function createMAMEWorkletNode(
  rawContext: AudioContext,
  processorName: string,
  wasmBinary: ArrayBuffer,
  jsCode: string,
  outputNode: AudioNode
): { workletNode: AudioWorkletNode; readyPromise: Promise<void> } {
  const workletNode = toneCreateAudioWorkletNode(rawContext, processorName, {
    outputChannelCount: [2],
    processorOptions: {
      sampleRate: rawContext.sampleRate
    }
  });

  const readyPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${processorName} init timeout`)), 10000);

    const originalOnMessage = workletNode.port.onmessage;
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'ready') {
        clearTimeout(timeout);
        resolve();
      } else if (event.data.type === 'error') {
        clearTimeout(timeout);
        reject(new Error(event.data.message || `${processorName} init error`));
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
    sampleRate: rawContext.sampleRate
  });

  // Connect to output
  workletNode.connect(outputNode);

  // CRITICAL: Connect through silent keepalive to destination to force process() calls
  try {
    const keepalive = rawContext.createGain();
    keepalive.gain.value = 0;
    workletNode.connect(keepalive);
    keepalive.connect(rawContext.destination);
  } catch (_e) { /* keepalive failed */ }

  return { workletNode, readyPromise };
}
