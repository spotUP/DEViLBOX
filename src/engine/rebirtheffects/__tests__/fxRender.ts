/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Offline render helper: builds a ReBirth effect through the registry (as the effect chooser does)
 * and renders a source through it on a real OfflineAudioContext.
 */
import type * as ToneNS from 'tone';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type { Rendered } from '@/engine/tone/__tests__/toneKnobRender';
import type { RebirthEffectNode } from '../rebirthEffects';

export const SR = 44100;

export type SourceFill = (i: number) => number;

export interface RenderOptions {
  type: string;
  parameters: Record<string, number>;
  seconds: number;
  source: SourceFill;
  bpm?: number;
  /** Runs after the node exists, before rendering (knob moves, scheduled steps). */
  setup?: (node: RebirthEffectNode, Tone: typeof ToneNS) => void;
}

export async function renderEffect(o: RenderOptions): Promise<Rendered> {
  installRealWebAudio();
  const Tone = await import('tone');
  await import('@engine/registry/effects/rebirth');
  const { EffectRegistry } = await import('@engine/registry/EffectRegistry');
  const ctx = new OfflineAudioContext(1, Math.round(SR * o.seconds), SR);
  Tone.setContext(ctx);
  if (o.bpm !== undefined) Tone.getTransport().bpm.value = o.bpm;
  const desc = EffectRegistry.get(o.type);
  if (!desc) throw new Error(`effect ${o.type} not registered`);
  const node = (await desc.create({
    id: 'fx', type: o.type, category: 'wasm', enabled: true, wet: 100, parameters: o.parameters,
  } as never)) as unknown as RebirthEffectNode;
  o.setup?.(node, Tone);
  const n = Math.round(SR * o.seconds);
  const buf = ctx.createBuffer(1, n, SR);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = o.source(i);
  buf.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  Tone.connect(src as never, node as never);
  Tone.connect(node as never, ctx.destination as never);
  src.start();
  const out = await ctx.startRendering();
  return { samples: out.getChannelData(0), sampleRate: SR };
}

export const sine = (hz: number, amp: number): SourceFill => (i) => amp * Math.sin((2 * Math.PI * hz * i) / SR);
