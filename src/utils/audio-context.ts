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
 * Create an AudioWorkletNode using the correct context.
 *
 * IMPORTANT: Tone.js uses standardized-audio-context which wraps the native AudioContext.
 * We must use Tone.js's context methods to ensure compatibility.
 */
export function createAudioWorkletNode(
  context: any,
  name: string,
  options?: AudioWorkletNodeOptions
): AudioWorkletNode {
  // Try the context's own createAudioWorkletNode method first
  // This works for both Tone.js contexts (uses standardized-audio-context internally)
  // and native AudioContexts
  if (context && typeof context.createAudioWorkletNode === 'function') {
    try {
      return context.createAudioWorkletNode(name, options);
    } catch (e) {
      console.warn(`[audio-context] context.createAudioWorkletNode failed for "${name}":`, e);
    }
  }

  // For Tone.js Context wrapper, try rawContext
  if (context && context.rawContext && typeof context.rawContext.createAudioWorkletNode === 'function') {
    try {
      return context.rawContext.createAudioWorkletNode(name, options);
    } catch (e) {
      console.warn(`[audio-context] rawContext.createAudioWorkletNode failed for "${name}":`, e);
    }
  }

  // Last resort: try native browser constructor
  const NativeNode = (globalThis as any).AudioWorkletNode;
  const nativeCtx = getNativeContext(context);

  if (NativeNode && nativeCtx) {
    try {
      return new NativeNode(nativeCtx, name, options);
    } catch (err) {
      console.warn(`[audio-context] Native AudioWorkletNode construction failed for "${name}":`, err);
    }
  }

  throw new Error(`AudioWorkletNode "${name}" could not be created in any context`);
}

/**
 * Check if an object is a native AudioNode using duck-typing.
 * This is more reliable than instanceof checks which can fail across contexts.
 */
function isNativeAudioNode(obj: any): obj is AudioNode {
  if (!obj || typeof obj !== 'object') return false;

  // Check for core AudioNode properties
  // All AudioNodes have: context, numberOfInputs, numberOfOutputs, connect, disconnect
  const hasAudioNodeProperties = (
    typeof obj.connect === 'function' &&
    typeof obj.disconnect === 'function' &&
    typeof obj.numberOfInputs === 'number' &&
    typeof obj.numberOfOutputs === 'number' &&
    obj.context !== undefined
  );

  if (!hasAudioNodeProperties) return false;

  // Distinguish native AudioNode from Tone.js wrapper:
  // - Native nodes: constructor.name ends with "Node" (GainNode, AudioWorkletNode, etc.)
  // - Tone.js nodes: have a 'name' property that's a specific string like "Gain", "Oscillator"
  //   AND they have toDestination/toMaster methods
  const constructorName = obj.constructor?.name || '';
  const isNativeByConstructor = constructorName.endsWith('Node') || constructorName === 'AudioNode';

  // Tone.js nodes have these methods that native nodes don't
  const isToneWrapper = typeof obj.toDestination === 'function' || typeof obj.toMaster === 'function';

  return isNativeByConstructor && !isToneWrapper;
}

/**
 * Get the native AudioNode from a Tone.js ToneAudioNode wrapper.
 * This is needed when connecting native AudioWorkletNodes to Tone.js nodes.
 *
 * Tone.js wraps native AudioNodes in various ways:
 * - Gain: the `input` and `output` properties ARE the native GainNode directly
 * - Other nodes: various internal properties
 *
 * @param toneNode - A Tone.js audio node (e.g., Tone.Gain, or any ToneAudioNode)
 * @returns The native AudioNode, or null if not found
 */
export function getNativeAudioNode(toneNode: any): AudioNode | null {
  if (!toneNode) return null;

  // If it's already a native AudioNode, return it directly
  if (isNativeAudioNode(toneNode)) {
    return toneNode;
  }

  // For Tone.Gain, the input/output properties ARE the native GainNode
  // Check these first as they're the most common case
  if (toneNode.input && isNativeAudioNode(toneNode.input)) {
    return toneNode.input;
  }
  if (toneNode.output && isNativeAudioNode(toneNode.output)) {
    return toneNode.output;
  }

  // Check other common Tone.js internal properties for native nodes
  const candidates = [
    toneNode._gainNode,        // Tone.Gain stores native GainNode here
    toneNode._node,            // Some Tone.js nodes use _node
    toneNode._input,           // Or _input
    toneNode._output,          // Or _output
    toneNode._nativeNode,      // Possible internal property
  ];

  for (const candidate of candidates) {
    if (isNativeAudioNode(candidate)) {
      return candidate;
    }
  }

  // Handle nested wrappers (e.g., Tone.js InputNode/OutputNode)
  if (toneNode.input && typeof toneNode.input === 'object' && !isNativeAudioNode(toneNode.input)) {
    const innerCandidates = [
      toneNode.input._gainNode,
      toneNode.input._node,
      toneNode.input.input,
    ];
    for (const inner of innerCandidates) {
      if (isNativeAudioNode(inner)) {
        return inner;
      }
    }
  }

  return null;
}
