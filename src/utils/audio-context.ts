// Cache native constructor for performance
const NativeBaseAudioContext = (globalThis as any).BaseAudioContext ||
                               (globalThis as any).AudioContext ||
                               (globalThis as any).webkitAudioContext;

// ── DEViLBOX-owned AudioContext ──────────────────────────────────────────
// Module-level registration: ToneEngine sets this in its constructor,
// and any synth (WAM, WASM, etc.) can read it without importing ToneEngine
// (avoiding circular dependency issues).
let _devilboxAudioContext: AudioContext | null = null;

/**
 * Register the DEViLBOX-owned native AudioContext.
 * Called once by ToneEngine constructor before any Tone.js nodes are created.
 */
export function setDevilboxAudioContext(ctx: AudioContext): void {
  _devilboxAudioContext = ctx;
}

/**
 * Get the DEViLBOX-owned native AudioContext.
 * Available after ToneEngine is instantiated. Synths should use this
 * instead of extracting rawContext from Tone.js.
 */
export function getDevilboxAudioContext(): AudioContext {
  if (!_devilboxAudioContext) {
    throw new Error('[audio-context] AudioContext not initialized — ToneEngine must be created first');
  }
  return _devilboxAudioContext;
}

/**
 * Robustly retrieve the native BaseAudioContext/AudioContext from any wrapper.
 * CRITICAL: This must return the browser's true native context object.
 */
export function getNativeContext(context: any): AudioContext {
  if (!context) {
    throw new Error('[audio-context] getNativeContext called with null/undefined context');
  }

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

// ── Tone.js-free audio utilities ──────────────────────────────────────
// Thin replacements for Tone.Frequency(), Tone.now(), Tone.Time() so synths
// don't need to import Tone.js just for note/time conversions.

const NOTE_REGEX = /^([A-Ga-g])([#b]?)(-?\d+)$/;
const NOTE_SEMITONES: Record<string, number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

/**
 * Convert a note name (e.g. "C4") or Hz frequency to a MIDI note number.
 * Replaces Tone.Frequency(note).toMidi() and Tone.Frequency(freq, 'hz').toMidi().
 */
export function noteToMidi(note: string | number): number {
  if (typeof note === 'number') {
    return Math.max(0, Math.min(127, Math.round(12 * Math.log2(note / 440) + 69)));
  }
  const match = note.match(NOTE_REGEX);
  if (!match) return 60; // default C4
  const [, letter, accidental, octaveStr] = match;
  const base = NOTE_SEMITONES[letter.toUpperCase()] ?? 0;
  const acc = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const octave = parseInt(octaveStr);
  return Math.max(0, Math.min(127, (octave + 1) * 12 + base + acc));
}

/**
 * Convert a note name (e.g. "C4") or MIDI number to a frequency in Hz.
 * Replaces Tone.Frequency(note).toFrequency().
 */
export function noteToFrequency(note: string | number): number {
  if (typeof note === 'number') {
    // If it looks like a MIDI note (0-127), convert; otherwise assume Hz
    if (note >= 0 && note <= 127 && Number.isInteger(note)) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }
    return note; // already Hz
  }
  const midi = noteToMidi(note);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get the current audio context time.
 * Replaces Tone.now().
 */
export function audioNow(): number {
  if (!_devilboxAudioContext) return 0;
  return _devilboxAudioContext.currentTime;
}

/**
 * Convert a duration value to seconds.
 * Supports numeric seconds (pass-through) and Tone.js time notation strings.
 * Replaces Tone.Time(duration).toSeconds().
 */
export function timeToSeconds(duration: number | string, bpm: number = 120): number {
  if (typeof duration === 'number') return duration;
  // Handle basic time notation: "4n", "8n", "16n", etc.
  const notationMatch = duration.match(/^(\d+)n$/);
  if (notationMatch) {
    const div = parseInt(notationMatch[1]);
    return (4 / div) * (60 / bpm);
  }
  // Try parsing as float (e.g. "0.5")
  const parsed = parseFloat(duration);
  return isNaN(parsed) ? 0 : parsed;
}
