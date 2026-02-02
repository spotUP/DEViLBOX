// Cache native constructor for performance
const NativeBaseAudioContext = (globalThis as any).BaseAudioContext || 
                               (globalThis as any).AudioContext || 
                               (globalThis as any).webkitAudioContext;

/**
 * Robustly retrieve the native BaseAudioContext/AudioContext from any wrapper.
 * CRITICAL: This must return the browser's true native context object.
 */
export function getNativeContext(context: any): AudioContext {
  if (!context) return null as any;

  // Faster direct check
  if (NativeBaseAudioContext && (context instanceof NativeBaseAudioContext)) {
    return context;
  }

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
    if (NativeBaseAudioContext && (current instanceof NativeBaseAudioContext)) {
      return current;
    }

    // Check known properties
    if (current.rawContext) queue.push(current.rawContext);
    if (current._nativeAudioContext) queue.push(current._nativeAudioContext);
    if (current.nativeContext) queue.push(current.nativeContext);
    if (current.baseAudioContext) queue.push(current.baseAudioContext);
    if (current.context) queue.push(current.context);
    if (current._context) queue.push(current._context);
  }

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
