/**
 * Tone.js AudioWorklet nodes on a native AudioContext.
 *
 * DEViLBOX hands Tone.js a RAW native AudioContext (Tone.setContext in
 * ToneEngine), bypassing standardized-audio-context (SAC). Tone's
 * Context.createAudioWorkletNode always builds the node through SAC's
 * AudioWorkletNode, and SAC only accepts contexts it created itself: on our
 * native context it throws InvalidStateError inside ToneAudioWorklet's
 * module-loaded callback, an unhandled rejection. Every Tone worklet node
 * then never gets its `_worklet` and stays silent for good:
 * FeedbackCombFilter (PluckSynth, JCReverb, and Freeverb via
 * LowpassCombFilter) and BitCrusher.
 *
 * At the same boundary as shimAudioListenerParams, Tone's Context learns to
 * build worklet nodes natively when its raw context is native. Modules are
 * loaded once per raw context: Tone.setContext(native) wraps the same native
 * context in a fresh Tone.Context each call (ToneEngine.getInstrument,
 * TrackerReplayer), and each wrapper's own module map would load Tone's
 * processor bundle again.
 */
import * as Tone from 'tone';

interface ToneWorkletContext {
  readonly rawContext: unknown;
  createAudioWorkletNode(name: string, options?: Partial<AudioWorkletNodeOptions>): AudioWorkletNode;
  addAudioWorkletModule(url: string, name: string): Promise<void>;
}

type PatchedProto = ToneWorkletContext & { _nativeWorklets?: boolean };

const modulesByContext = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/** True for a browser (or node-web-audio-api) context, false for a SAC wrapper. */
export function isNativeAudioContext(raw: unknown): raw is BaseAudioContext {
  return typeof BaseAudioContext !== 'undefined' && raw instanceof BaseAudioContext;
}

/** Patch Tone's Context once so its worklet nodes work on a native raw context. */
export function installNativeContextWorklets(): void {
  const proto = Tone.Context.prototype as unknown as PatchedProto;
  if (proto._nativeWorklets) return;
  const createNode = proto.createAudioWorkletNode;
  const addModule = proto.addAudioWorkletModule;

  proto.createAudioWorkletNode = function (this: ToneWorkletContext, name, options) {
    const raw = this.rawContext;
    if (!isNativeAudioContext(raw)) return createNode.call(this, name, options);
    return new AudioWorkletNode(raw, name, options);
  };

  proto.addAudioWorkletModule = function (this: ToneWorkletContext, url, name) {
    const raw = this.rawContext;
    if (!isNativeAudioContext(raw)) return addModule.call(this, url, name);
    let modules = modulesByContext.get(raw);
    if (!modules) {
      modules = new Map();
      modulesByContext.set(raw, modules);
    }
    let loaded = modules.get(name);
    if (!loaded) {
      loaded = raw.audioWorklet.addModule(url);
      modules.set(name, loaded);
    }
    return loaded;
  };

  proto._nativeWorklets = true;
}
