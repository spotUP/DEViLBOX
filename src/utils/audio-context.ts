/**
 * Robustly retrieve the native BaseAudioContext/AudioContext from any wrapper.
 * CRITICAL: This must return the browser's true native context object.
 */
export function getNativeContext(context: any): AudioContext {
  if (!context) return null as any;

  // The true native BaseAudioContext constructor
  const NativeBaseAudioContext = (globalThis as any).BaseAudioContext || 
                                 (globalThis as any).AudioContext || 
                                 (globalThis as any).webkitAudioContext;

  // Helper to check if an object is a true native context
  const isNative = (obj: any) => {
    try {
      return NativeBaseAudioContext && (obj instanceof NativeBaseAudioContext);
    } catch (e) {
      return false;
    }
  };

  if (isNative(context)) return context;

  // BFS/DFS search for the hidden native context
  let queue = [context];
  let visited = new Set();
  
  // Limit depth/breadth to avoid hangs
  let iterations = 0;
  
  while (queue.length > 0 && iterations < 50) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    iterations++;

    // Check if THIS is the native context
    if (isNative(current)) return current;

    // Check known properties
    const candidates = [
      current.rawContext,
      current._nativeAudioContext,
      current._nativeContext,
      current.nativeContext,
      current.baseAudioContext,
      current.context, // standardized-audio-context nodes
      current._context // Tone.js nodes sometimes
    ];

    for (const candidate of candidates) {
      if (candidate) {
        if (isNative(candidate)) return candidate;
        queue.push(candidate);
      }
    }
  }

  // If we couldn't find a native context, we might be in a weird environment.
  // Fallback: assume the passed context IS the native one (e.g. if instanceof check failed across frames)
  // BUT: The error says "parameter 1 is not of type BaseAudioContext", so this assumption is likely wrong.
  console.warn('[audio-context] Could not find native BaseAudioContext inside wrapper', context);
  return context;
}

/**
 * Create an AudioWorkletNode using the correct native context.
 */
export function createAudioWorkletNode(
  context: any,
  name: string,
  options?: AudioWorkletNodeOptions
): AudioWorkletNode {
  const nativeCtx = getNativeContext(context);
  const NativeNode = (globalThis as any).AudioWorkletNode;

  // 1. Try the browser's NATIVE constructor first. 
  // This is the most reliable way when we've added the module to the native context.
  if (NativeNode && nativeCtx) {
    try {
      return new NativeNode(nativeCtx, name, options);
    } catch (err) {
      // Fall through to other methods if native constructor fails
      console.warn(`[audio-context] Native construction failed for "${name}", trying fallbacks:`, err);
    }
  }
  
  // 2. Try the passed context's own factory method (might be a wrapper)
  if (context && typeof context.createAudioWorkletNode === 'function') {
    try {
      return context.createAudioWorkletNode(name, options);
    } catch (e) { /* Fall through */ }
  }

  // 3. Try the Tone.js rawContext's factory method
  if (context && context.rawContext && typeof context.rawContext.createAudioWorkletNode === 'function') {
    try {
      return context.rawContext.createAudioWorkletNode(name, options);
    } catch (e) { /* Fall through */ }
  }

  // 4. Try the unwrapped context's factory method
  if (nativeCtx && typeof (nativeCtx as any).createAudioWorkletNode === 'function') {
    try {
      return (nativeCtx as any).createAudioWorkletNode(name, options);
    } catch (e) { /* Fall through */ }
  }

  throw new Error(`AudioWorkletNode "${name}" could not be created in any context`);
}
