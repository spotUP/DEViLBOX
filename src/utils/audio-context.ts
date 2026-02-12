// Cache native constructor for performance
const _globalThis = globalThis as unknown as Record<string, unknown>;
const NativeBaseAudioContext = (_globalThis.BaseAudioContext ||
                               _globalThis.AudioContext ||
                               _globalThis.webkitAudioContext) as (new (...args: unknown[]) => AudioContext) | undefined;

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
/** Audio context wrapper type - Tone.js and SAC wrap contexts with various internal properties */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AudioContextLike = { [key: string]: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNativeContext(context: any): AudioContext {
  if (!context) {
    throw new Error('[audio-context] getNativeContext called with null/undefined context');
  }

  // Faster direct check
  if (NativeBaseAudioContext && (context instanceof NativeBaseAudioContext)) {
    return context;
  }

  // BFS/DFS search for the hidden native context
  const queue = [context];
  const visited = new Set();
  
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

  return context as AudioContext;
}

/**
 * Create an AudioWorkletNode using the correct context.
 *
 * IMPORTANT: Tone.js uses standardized-audio-context which wraps the native AudioContext.
 * We must use Tone.js's context methods to ensure compatibility.
 */
export function createAudioWorkletNode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  name: string,
  options?: AudioWorkletNodeOptions
): AudioWorkletNode {
  // Try the context's own createAudioWorkletNode method first
  // This works for both Tone.js contexts (uses standardized-audio-context internally)
  // and native AudioContexts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (context && typeof (context as any).createAudioWorkletNode === 'function') {
    try {
      return (context as any).createAudioWorkletNode(name, options);
    } catch (e) {
      console.warn(`[audio-context] context.createAudioWorkletNode failed for "${name}":`, e);
    }
  }

  // For Tone.js Context wrapper, try rawContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCtx = (context as any).rawContext;
  if (context && rawCtx && typeof rawCtx.createAudioWorkletNode === 'function') {
    try {
      return rawCtx.createAudioWorkletNode(name, options);
    } catch (e) {
      console.warn(`[audio-context] rawContext.createAudioWorkletNode failed for "${name}":`, e);
    }
  }

  // Last resort: try native browser constructor
  const NativeNode = _globalThis.AudioWorkletNode as (new (ctx: AudioContext, name: string, options?: AudioWorkletNodeOptions) => AudioWorkletNode) | undefined;
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
 * Check if an object is a true browser-native AudioNode.
 *
 * IMPORTANT: Tone.js v14 uses standardized-audio-context (SAC) internally.
 * SAC creates wrapper classes (e.g. GainNode) that look like native nodes
 * (same constructor name, same interface) but are NOT actual browser AudioNodes.
 * Connecting a native node to a SAC wrapper via the browser's native connect()
 * will silently fail or throw, breaking the audio chain.
 *
 * We use `instanceof` against the browser's real AudioNode class to distinguish
 * native nodes from SAC wrappers. This is reliable because:
 * - SAC wrappers do NOT extend the browser's native AudioNode
 * - Tone.js wrappers also do NOT extend native AudioNode
 * - Only actual browser-created nodes pass this check
 */
/** Audio node wrapper type - Tone.js and SAC wrap nodes with various internal properties */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AudioNodeLike = { [key: string]: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isNativeAudioNode(obj: any): obj is AudioNode {
  if (!obj || typeof obj !== 'object') return false;

  // Primary check: use the browser's native AudioNode class
  const NativeAudioNode = _globalThis.AudioNode as (new (...args: unknown[]) => AudioNode) | undefined;
  if (NativeAudioNode && obj instanceof NativeAudioNode) {
    // Exclude Tone.js wrappers that might extend native AudioNode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = obj as any;
    const isToneWrapper = typeof o.toDestination === 'function' || typeof o.toMaster === 'function';
    return !isToneWrapper;
  }

  return false;
}

/**
 * Unwrap a standardized-audio-context (SAC) node to get the real native AudioNode.
 * SAC stores the browser's native node in `_nativeAudioNode`.
 * Returns the node itself if it's already native, or null if unwrapping fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapToNative(obj: any): AudioNode | null {
  if (!obj || typeof obj !== 'object') return null;

  // Already a native node
  if (isNativeAudioNode(obj)) return obj;

  // SAC wrapper: the real native node is stored in _nativeAudioNode
  if (obj._nativeAudioNode && isNativeAudioNode(obj._nativeAudioNode)) {
    return obj._nativeAudioNode;
  }

  return null;
}

/**
 * Get the native AudioNode from a Tone.js ToneAudioNode wrapper.
 * This is needed when connecting native AudioWorkletNodes to Tone.js nodes.
 *
 * The unwrapping chain for Tone.js v14 + standardized-audio-context v24:
 *   Tone.Gain → .input (SAC GainNode) → ._nativeAudioNode (native GainNode)
 *
 * @param toneNode - A Tone.js audio node (e.g., Tone.Gain, or any ToneAudioNode)
 * @returns The native AudioNode, or null if not found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNativeAudioNode(toneNode: any): AudioNode | null {
  if (!toneNode) return null;

  // If it's already a native AudioNode, return it directly
  if (isNativeAudioNode(toneNode)) {
    return toneNode;
  }

  // Check direct properties: input, output, and internal node references.
  // For each candidate, try unwrapping SAC wrappers to find the real native node.
  const directCandidates = [
    toneNode.input,
    toneNode.output,
    toneNode._gainNode,        // Tone.Gain stores its GainNode here
    toneNode._node,            // Some Tone.js nodes use _node
    toneNode._input,           // Or _input
    toneNode._output,          // Or _output
    toneNode._nativeNode,      // Possible internal property
    toneNode._nativeAudioNode, // SAC wrapper property
  ];

  for (const candidate of directCandidates) {
    const native = unwrapToNative(candidate);
    if (native) return native;
  }

  // Handle nested wrappers (e.g., Tone.js InputNode/OutputNode that wrap SAC nodes)
  if (toneNode.input && typeof toneNode.input === 'object') {
    const inputObj = toneNode.input;
    const innerCandidates = [
      inputObj._gainNode,
      inputObj._node,
      inputObj.input,
      inputObj._nativeAudioNode,
    ];
    for (const inner of innerCandidates) {
      const native = unwrapToNative(inner);
      if (native) return native;
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
