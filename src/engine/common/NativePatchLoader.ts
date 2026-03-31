/**
 * NativePatchLoader — Atomic state loading/saving for WASM synth worklets
 *
 * Provides loadPatch(Float32Array) and getState() for any synth whose
 * worklet supports the 'loadPatch' / 'getState' message protocol.
 *
 * Presets stored as number[] (complete engine state snapshots) instead
 * of partial TypeScript config objects.
 */

/** A native preset: complete engine state as a float array */
export interface NativePatch {
  name: string;
  /** Complete engine state — values[i] = param i's value */
  values: number[];
}

/**
 * Send a complete state snapshot to a worklet via loadPatch message.
 * Returns a promise that resolves when the worklet confirms loading.
 */
export function loadNativePatch(
  worklet: AudioWorkletNode,
  values: number[],
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('loadPatch timeout'));
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.data.type === 'patchLoaded') {
        cleanup();
        resolve();
      }
    }

    function cleanup() {
      clearTimeout(timer);
      worklet.port.removeEventListener('message', handler);
    }

    worklet.port.addEventListener('message', handler);
    worklet.port.postMessage({ type: 'loadPatch', values });
  });
}

/**
 * Capture the complete current state from a worklet via getState message.
 * Returns the float array of all parameter values.
 */
export function captureNativeState(
  worklet: AudioWorkletNode,
  timeoutMs = 2000,
): Promise<{ values: number[]; numParams: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('getState timeout'));
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (event.data.type === 'state') {
        cleanup();
        resolve({
          values: event.data.values,
          numParams: event.data.numParams,
        });
      }
    }

    function cleanup() {
      clearTimeout(timer);
      worklet.port.removeEventListener('message', handler);
    }

    worklet.port.addEventListener('message', handler);
    worklet.port.postMessage({ type: 'getState' });
  });
}

/**
 * Encode a native patch as a compact base64 string for storage.
 * Format: Float32Array → Uint8Array → base64
 */
export function encodePatch(values: number[]): string {
  const f32 = new Float32Array(values);
  const bytes = new Uint8Array(f32.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode a base64 patch string back to number[].
 */
export function decodePatch(base64: string): number[] {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const f32 = new Float32Array(bytes.buffer);
  return Array.from(f32);
}
