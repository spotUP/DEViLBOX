/**
 * Connect two nodes of an effect chain, whatever each one is.
 *
 * A chain mixes three kinds of node: Tone.js nodes, raw Web Audio nodes, and
 * native effects (Buzzmachine, WASM effects) that expose `.input` / `.output`
 * GainNodes but are not ToneAudioNodes. `src.connect(dst)` works only between
 * Tone nodes; given a native effect it throws "parameter 1 is not of type
 * 'AudioNode'". The tracker's master chain and the per-channel chains each
 * carried their own copy of this bridge; the DJ mixer's master chain had
 * none, so any native effect in it failed the whole rebuild ("FX chain
 * connection failed, keeping old chain").
 */
import * as Tone from 'tone';
import { getNativeAudioNode } from '@utils/audio-context';

type Native = { input: AudioNode; output: AudioNode };

/** A native effect: `.input` / `.output` nodes, not a ToneAudioNode. */
function isNativeEffect(n: unknown): n is Native {
  const x = n as Partial<Native> | null;
  return !!(x && x.input && x.output && !(n instanceof Tone.ToneAudioNode));
}

const isRawNode = (n: unknown): n is AudioNode =>
  typeof AudioNode !== 'undefined' && n instanceof AudioNode;

export function connectAudio(src: unknown, dst: unknown): void {
  const srcIsNative = isNativeEffect(src) || isRawNode(src);
  const dstIsNative = isNativeEffect(dst) || isRawNode(dst);
  const srcOut = (): AudioNode => (isRawNode(src) ? src : (src as Native).output);
  const dstIn = (): AudioNode => (isRawNode(dst) ? dst : (dst as Native).input);

  if (!srcIsNative && !dstIsNative) {
    // Both Tone.js: Tone's connect keeps its internal routing.
    (src as Tone.ToneAudioNode).connect(dst as Tone.InputNode);
  } else if (srcIsNative && dstIsNative) {
    srcOut().connect(dstIn());
  } else if (srcIsNative) {
    const dstNative = getNativeAudioNode(dst as never);
    srcOut().connect((dstNative ?? dst) as AudioNode);
  } else {
    const srcNative = getNativeAudioNode(src as never);
    if (srcNative) srcNative.connect(dstIn());
    else (src as Tone.ToneAudioNode).connect(dstIn() as unknown as Tone.InputNode);
  }
}
