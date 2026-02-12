/**
 * DevilboxSynth - Universal synth interface for DEViLBOX
 *
 * All synths (native Web Audio, WASM, WAM) implement this interface.
 * Tone.js synths satisfy it via duck-typing (they already have these methods).
 * This decouples synth implementations from Tone.js's ToneAudioNode base class.
 */

export interface DevilboxSynth {
  /** Native Web Audio output node — connects into the effect chain */
  readonly output: AudioNode;
  /** Human-readable synth name */
  readonly name: string;
  /** Clean up all resources */
  dispose(): void;
  /** Trigger a note attack */
  triggerAttack?(note: string | number, time?: number, velocity?: number): void;
  /** Trigger a note release */
  triggerRelease?(note?: string | number, time?: number): void;
  /** Trigger attack then release after duration */
  triggerAttackRelease?(note: string | number, duration: number, time?: number, velocity?: number): void;
  /** Set a named parameter */
  set?(param: string, value: number): void;
  /** Get a named parameter value */
  get?(param: string): number | undefined;
}

/**
 * Type guard: is this a DevilboxSynth (native AudioNode output) rather than a ToneAudioNode?
 * ToneAudioNodes have toDestination/toMaster methods; DevilboxSynths do not.
 */
export function isDevilboxSynth(synth: unknown): synth is DevilboxSynth {
  if (!synth || typeof synth !== 'object') return false;
  const obj = synth as Record<string, unknown>;
  // Must have a native AudioNode output
  if (!obj.output || typeof obj.output !== 'object') return false;
  // Native AudioNodes have connect/disconnect as functions and numberOfOutputs as number
  const out = obj.output as Record<string, unknown>;
  const isNativeNode = (
    typeof out.connect === 'function' &&
    typeof out.disconnect === 'function' &&
    typeof out.numberOfOutputs === 'number' &&
    // Tone.js wrappers have toDestination — native AudioNodes don't
    typeof out.toDestination !== 'function'
  );
  // Also must NOT be a ToneAudioNode itself (those have toDestination on the synth object)
  const isToneNode = typeof obj.toDestination === 'function';
  return isNativeNode && !isToneNode;
}
