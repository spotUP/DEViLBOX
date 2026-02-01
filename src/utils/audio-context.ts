import * as Tone from 'tone';

/**
 * Robustly retrieve the native BaseAudioContext/AudioContext from a Tone.js context.
 * Handles both Tone.Context objects and raw AudioContext objects.
 */
export function getNativeContext(context: any): AudioContext {
  if (!context) {
    return Tone.getContext().rawContext as AudioContext;
  }
  return (context.rawContext || context) as AudioContext;
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
  return new AudioWorkletNode(nativeCtx, name, options);
}
