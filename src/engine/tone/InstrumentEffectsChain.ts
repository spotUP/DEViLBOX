import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { isDevilboxSynth } from '@typedefs/synth';
import { InstrumentFactory } from '../InstrumentFactory';
import { InstrumentAnalyser } from '../InstrumentAnalyser';

export interface InstrumentEffectsContext {
  instrumentEffectChains: Map<number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
    bridge?: Tone.Gain;
  }>;
  instrumentEffectNodes: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }>;
  instrumentAnalysers: Map<number, InstrumentAnalyser>;
  instrumentOutputOverrides: Map<number, Tone.ToneAudioNode>;
  instruments: Map<number, Tone.ToneAudioNode | DevilboxSynth>;
  masterInput: Tone.Gain;
  synthBus: Tone.Gain;
  connectNativeSynth: (output: AudioNode, destination: Tone.ToneAudioNode) => void;
  getInstrumentOutputDestination: (instrumentId: number, isNative: boolean) => Tone.ToneAudioNode;
  getInstrumentKey: (instrumentId: number, channel: number) => number;
}

/**
 * Build or rebuild an instrument's effect chain (now async for neural effects)
 * Route: instrument → effects → masterInput
 * Supports both Tone.js ToneAudioNodes and native DevilboxSynths.
 * @param key - Composite key (instrumentId-channelIndex) for per-channel chains
 */
export async function buildInstrumentEffectChain(
  ctx: InstrumentEffectsContext,
  key: number,
  effects: EffectConfig[],
  instrument: Tone.ToneAudioNode | DevilboxSynth
): Promise<void> {
  // Dispose existing effect chain if any
  const existing = ctx.instrumentEffectChains.get(key);
  if (existing) {
    // Clean up per-node registry entries
    for (const [effectId, entry] of ctx.instrumentEffectNodes) {
      if (existing.effects.includes(entry.node)) {
        ctx.instrumentEffectNodes.delete(effectId);
      }
    }
    existing.effects.forEach((fx) => {
      try {
        fx.disconnect();
        fx.dispose();
      } catch {
        // Node may already be disposed
      }
    });
    if (existing.bridge) {
      try {
        existing.bridge.disconnect();
        existing.bridge.dispose();
      } catch {
        // Bridge may already be disposed
      }
    }
    existing.output.disconnect();
    existing.output.dispose();
  }

  // Create output gain node
  const output = new Tone.Gain(1);

  // Detect if this is a native DevilboxSynth (non-Tone.js) or a Tone.js node
  const isNativeSynth = isDevilboxSynth(instrument);

  // Helper: connect instrument to a Tone.js destination node
  const connectInstrumentTo = (dest: Tone.ToneAudioNode) => {
    if (isNativeSynth) {
      // Native AudioNode → Tone.js node bridge
      ctx.connectNativeSynth((instrument as DevilboxSynth).output, dest);
    } else {
      // Tone.js → Tone.js (existing path)
      (instrument as Tone.ToneAudioNode).connect(dest);
    }
  };

  // Filter to only enabled effects
  const enabledEffects = effects.filter((fx) => fx.enabled);

  if (enabledEffects.length === 0) {
    // No effects - direct connection
    connectInstrumentTo(output);

    // Determine destination: use instrument analyser if active, otherwise master input
    const instrumentId = key >>> 16;
    const activeAnalyser = ctx.instrumentAnalysers.get(instrumentId);

    if (activeAnalyser) {
      output.connect(activeAnalyser.input);
    } else {
      output.connect(ctx.getInstrumentOutputDestination(instrumentId, isNativeSynth));
    }

    ctx.instrumentEffectChains.set(key, { effects: [], output });
    return;
  }

  // Create effect nodes (async for neural effects)
  const effectNodes = (await Promise.all(
    enabledEffects.map((config) => InstrumentFactory.createEffect(config))
  )) as Tone.ToneAudioNode[];

  // Build full chain: instrument → [bridge?] → effect[0] → ... → effect[N-1] → output → destination
  let bridge: Tone.Gain | undefined;
  if (effectNodes.length > 0) {
    if (isNativeSynth) {
      // Native synths can't connect directly to Tone.js effects (CrossFade input).
      // Insert a Tone.Gain bridge whose .input IS a native GainNode.
      bridge = new Tone.Gain(1);
      connectInstrumentTo(bridge);
      bridge.connect(effectNodes[0] as Tone.ToneAudioNode);
    } else {
      (instrument as Tone.ToneAudioNode).connect(effectNodes[0] as Tone.ToneAudioNode);
    }
    // Chain effects together
    for (let i = 0; i < effectNodes.length - 1; i++) {
      (effectNodes[i] as Tone.ToneAudioNode).connect(effectNodes[i + 1] as Tone.ToneAudioNode);
    }
    // Connect last effect to output
    (effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode).connect(output);
  } else {
    connectInstrumentTo(output);
  }

  // Determine destination: use instrument analyser if active, otherwise master input
  const instrumentId2 = key >>> 16;
  const activeAnalyser = ctx.instrumentAnalysers.get(instrumentId2);

  if (activeAnalyser) {
    output.connect(activeAnalyser.input);
  } else {
    output.connect(ctx.getInstrumentOutputDestination(instrumentId2, isNativeSynth));
  }

  ctx.instrumentEffectChains.set(key, { effects: effectNodes as Tone.ToneAudioNode[], output, bridge });

  // Register individual effect nodes for real-time parameter updates
  enabledEffects.forEach((config, i) => {
    ctx.instrumentEffectNodes.set(config.id, { node: effectNodes[i] as Tone.ToneAudioNode, config });
  });
}

/**
 * Rebuild an instrument's effect chain (public method for store to call, now async)
 */
export async function rebuildInstrumentEffects(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  effects: EffectConfig[]
): Promise<void> {
  const key = ctx.getInstrumentKey(instrumentId, -1);
  const instrument = ctx.instruments.get(key);
  if (!instrument) {
    console.warn('[ToneEngine] Cannot rebuild effects - instrument not found:', instrumentId);
    return;
  }

  // Disconnect instrument from current chain
  try {
    if (isDevilboxSynth(instrument)) {
      // Native synth — disconnect the AudioNode output
      instrument.output.disconnect();
    } else {
      instrument.disconnect();
    }
  } catch {
    // May not be connected
  }

  // Build new effect chain (await for neural effects)
  await buildInstrumentEffectChain(ctx, key, effects, instrument);
}

/**
 * Override the output destination for an instrument's effect chain and voice routing.
 * Used by DJ mode to route audio through deck gain → EQ → filter → crossfader.
 */
export function setInstrumentOutputOverride(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  destination: Tone.ToneAudioNode
): void {
  ctx.instrumentOutputOverrides.set(instrumentId, destination);
}

export function removeInstrumentOutputOverride(
  ctx: InstrumentEffectsContext,
  instrumentId: number
): void {
  ctx.instrumentOutputOverrides.delete(instrumentId);
}

/**
 * Momentarily "throw" an instrument into an effect (e.g. Dub Delay Throw)
 * Ramps the wet level of a specific effect type in the instrument's chain
 */
export function throwInstrumentToEffect(
  ctx: InstrumentEffectsContext,
  instrumentId: number,
  effectType: string,
  wetAmount: number = 1.0,
  durationMs: number = 0
): void {
  // Find the chain - for throws, we typically look at the base instrument chain (-1)
  // or iterate all channels if it's a live instrument
  const chains: Array<{ effects: Tone.ToneAudioNode[]; output: Tone.Gain }> = [];
  ctx.instrumentEffectChains.forEach((chain, chainKey) => {
    if ((chainKey >> 16) === instrumentId) {
      chains.push(chain);
    }
  });

  if (chains.length === 0) return;

  chains.forEach(chain => {
    // Find the target effect node in the chain
    const targetFx = chain.effects.find((fx) => (fx as unknown as { _fxType?: string })._fxType === effectType);

    if (targetFx && 'wet' in targetFx) {
      const wetParam = (targetFx as unknown as { wet: Tone.Param<"normalRange"> }).wet;
      const now = Tone.immediate();
      
      // Ramp up instantly (10ms)
      wetParam.cancelScheduledValues(now);
      wetParam.rampTo(wetAmount, 0.01, now);
      
      // If duration is provided, ramp back down after that time
      if (durationMs > 0) {
        wetParam.rampTo(0, 0.1, now + durationMs / 1000);
      }
    }
  });
}

/**
 * Dispose instrument effect chain
 */
export function disposeInstrumentEffectChain(
  ctx: InstrumentEffectsContext,
  key: number
): void {
  const chain = ctx.instrumentEffectChains.get(key);
  if (chain) {
    chain.effects.forEach((fx) => {
      try {
        fx.dispose();
      } catch {
        // Node may already be disposed
      }
    });
    try {
      chain.output.dispose();
    } catch {
      // Node may already be disposed
    }
    ctx.instrumentEffectChains.delete(key);
  }
}
