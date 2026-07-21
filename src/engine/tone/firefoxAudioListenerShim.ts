/**
 * Firefox AudioListener param shim.
 *
 * DEViLBOX hands Tone.js a RAW native AudioContext (Tone.setContext in
 * ToneEngine), bypassing standardized-audio-context's compatibility layer.
 * Tone's Listener (constructed for every new context via onContextInit)
 * wraps the nine AudioListener AudioParams — positionX/Y/Z, forwardX/Y/Z,
 * upX/Y/Z. Firefox has never implemented these params (bugzilla 1283029),
 * so `listener.positionX` is undefined there and Tone's Param constructor
 * throws `param must be an AudioParam` — a boot-time crash for every
 * Firefox user.
 *
 * Standardized-audio-context solves the same gap by donating
 * ConstantSourceNode.offset params; we do the identical thing at the one
 * boundary where the native context is given to Tone. DEViLBOX uses no 3D
 * panning, so the donor params only need to exist and behave like
 * AudioParams (settable, automatable), which ConstantSource offsets do.
 */

interface ListenerParamSpec {
  name: string;
  defaultValue: number;
}

export const LISTENER_PARAMS: readonly ListenerParamSpec[] = [
  { name: 'positionX', defaultValue: 0 },
  { name: 'positionY', defaultValue: 0 },
  { name: 'positionZ', defaultValue: 0 },
  { name: 'forwardX', defaultValue: 0 },
  { name: 'forwardY', defaultValue: 0 },
  { name: 'forwardZ', defaultValue: -1 },
  { name: 'upX', defaultValue: 0 },
  { name: 'upY', defaultValue: 1 },
  { name: 'upZ', defaultValue: 0 },
] as const;

/** Minimal structural types so the shim is testable without a real context. */
interface ConstantSourceLike {
  offset: { value: number };
}
export interface ShimmableAudioContext {
  listener: object;
  createConstantSource(): ConstantSourceLike;
}

/**
 * Ensure all nine AudioListener params exist on `ctx.listener`, donating
 * ConstantSourceNode.offset params for any the browser lacks (Firefox).
 * Returns the number of params shimmed (0 on Chrome/Safari).
 */
export function shimAudioListenerParams(ctx: ShimmableAudioContext): number {
  const listener = ctx.listener as Record<string, unknown>;
  let shimmed = 0;
  for (const { name, defaultValue } of LISTENER_PARAMS) {
    if (listener[name] !== undefined) continue;
    const donor = ctx.createConstantSource();
    donor.offset.value = defaultValue;
    Object.defineProperty(listener, name, {
      value: donor.offset,
      configurable: true,
      enumerable: true,
    });
    shimmed++;
  }
  return shimmed;
}
