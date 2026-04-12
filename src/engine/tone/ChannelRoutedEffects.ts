/**
 * ChannelRoutedEffects — Per-channel effect routing via multi-output worklet.
 *
 * Architecture (single-worklet, multiple openmpt module instances):
 *   The main libopenmpt worklet has 5 outputs: output[0] = main mix,
 *   outputs[1-4] = isolation slots. Each isolation slot contains a secondary
 *   openmpt module instance that renders ONLY the target channels.
 *   All modules advance in the same process() call = perfect lockstep.
 *
 *   worklet output[0] (main mix, ch1 muted) → gainNode → synthBus → master
 *   worklet output[1] (ch1 only) → BitCrusher → masterEffectsInput
 *   worklet output[2] (ch3 only) → Reverb → masterEffectsInput
 */

import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { createEffect } from '../factories/EffectFactory';
import { getNativeAudioNode } from '@utils/audio-context';
import { applyEffectParametersDiff } from './EffectParameterEngine';

interface IsolationSlot {
  slotIndex: number;
  channels: number[];
  channelMask: number;
  effectConfigs: EffectConfig[];
  effectNodes: (Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void })[];
  /** Native GainNode connected between worklet output and effect chain */
  outputGain: GainNode;
}

/** Returns true if node is a native DevilboxSynth (has input/output GainNodes but is not a ToneAudioNode) */
const isNativeSynth = (n: any): boolean => !!(n.input && n.output && !(n instanceof Tone.ToneAudioNode));

/** Connect src → dst, bridging Tone.js ↔ native DevilboxSynth nodes */
const chainConnect = (src: any, dst: any) => {
  const srcIsNative = isNativeSynth(src) || src instanceof AudioNode;
  const dstIsNative = isNativeSynth(dst) || dst instanceof AudioNode;

  if (!srcIsNative && !dstIsNative) {
    src.connect(dst);
  } else if (srcIsNative && dstIsNative) {
    const srcOut = src instanceof AudioNode ? src : src.output as AudioNode;
    const dstIn = dst instanceof AudioNode ? dst : dst.input as AudioNode;
    srcOut.connect(dstIn);
  } else if (srcIsNative) {
    const srcOut = src instanceof AudioNode ? src : src.output as AudioNode;
    const dstNative = getNativeAudioNode(dst);
    if (dstNative) srcOut.connect(dstNative);
    else srcOut.connect(dst);
  } else {
    const dstIn = dst instanceof AudioNode ? dst : dst.input as AudioNode;
    const srcNative = getNativeAudioNode(src);
    if (srcNative) srcNative.connect(dstIn);
    else src.connect(dstIn);
  }
};

export class ChannelRoutedEffectsManager {
  private slots: (IsolationSlot | null)[] = [null, null, null, null];
  private masterEffectsInput: Tone.Gain;

  constructor(masterEffectsInput: Tone.Gain) {
    this.masterEffectsInput = masterEffectsInput;
  }

  /**
   * Rebuild per-channel effect routing based on mixer store state.
   * Connects worklet outputs[1..4] → per-channel effect chains → masterEffectsInput.
   */
  async rebuild(
    channelEffects: Map<number, EffectConfig[]>,
  ): Promise<void> {
    console.log(`[ChannelRoutedEffects] rebuild() called with ${channelEffects.size} channels:`,
      [...channelEffects.entries()].map(([ch, fx]) => `ch${ch}: ${fx.length} effects (${fx.filter(e=>e.enabled).length} enabled)`));

    // Lazy import to avoid circular dependency
    const { LibopenmptEngine } = await import('../libopenmpt/LibopenmptEngine');
    if (!LibopenmptEngine.hasInstance()) { console.warn('[ChannelRoutedEffects] No LibopenmptEngine instance'); return; }
    const engine = LibopenmptEngine.getInstance();
    if (!engine.isAvailable()) { console.warn('[ChannelRoutedEffects] Engine not available'); return; }

    const workletNode = engine.getWorkletNode();
    if (!workletNode) { console.warn('[ChannelRoutedEffects] No worklet node'); return; }

    // Tear down existing slots
    this.teardown(engine);

    let slotIdx = 0;
    for (const [channelIndex, effects] of channelEffects) {
      if (slotIdx >= 4) {
        console.warn('[ChannelRoutedEffects] Only 4 isolation slots available, skipping remaining channels');
        break;
      }

      const enabledEffects = effects.filter(e => e.enabled);
      if (enabledEffects.length === 0) continue;

      const channelMask = 1 << channelIndex;

      // Tell worklet to create isolation module for this channel
      engine.addIsolation(slotIdx, channelMask);

      // Create effect nodes (may be Tone.js or native DevilboxSynth like BuzzmachineSynth)
      const effectNodes: IsolationSlot['effectNodes'] = [];
      for (const config of enabledEffects) {
        try {
          const node = await createEffect(config) as Tone.ToneAudioNode | { input: AudioNode; output: AudioNode; dispose(): void };
          if (node) {
            if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
              ((node as any).wet as Tone.Signal).value = config.wet / 100;
            }
            effectNodes.push(node);
          }
        } catch (e) {
          console.warn(`[ChannelRoutedEffects] Failed to create ${config.type}:`, e);
        }
      }

      if (effectNodes.length === 0) {
        engine.removeIsolation(slotIdx);
        continue;
      }

      // Create output gain for this slot
      const audioContext = engine.getAudioContext();
      if (!audioContext) { engine.removeIsolation(slotIdx); continue; }
      const outputGain = audioContext.createGain();
      outputGain.gain.value = 1;

      // Connect worklet output[slotIdx+1] → outputGain → effect chain → masterEffectsInput
      const outputIndex = slotIdx + 1;
      try {
        workletNode.connect(outputGain, outputIndex);
        console.log(`[ChannelRoutedEffects] Connected worklet output[${outputIndex}] → outputGain → effects`);
      } catch (e) {
        console.warn(`[ChannelRoutedEffects] Failed to connect worklet output ${outputIndex}:`, e);
        engine.removeIsolation(slotIdx);
        for (const n of effectNodes) { try { n.dispose(); } catch { /* */ } }
        continue;
      }

      // Chain: outputGain → effect1 → effect2 → ... → masterEffectsInput
      // Uses chainConnect to bridge Tone.js ↔ native DevilboxSynth (Buzzmachine) nodes
      chainConnect(outputGain, effectNodes[0]);
      for (let i = 0; i < effectNodes.length - 1; i++) {
        chainConnect(effectNodes[i], effectNodes[i + 1]);
      }
      chainConnect(effectNodes[effectNodes.length - 1], this.masterEffectsInput);

      this.slots[slotIdx] = {
        slotIndex: slotIdx,
        channels: [channelIndex],
        channelMask,
        effectConfigs: enabledEffects,
        effectNodes,
        outputGain,
      };

      console.log(`[ChannelRoutedEffects] Slot ${slotIdx}: ch${channelIndex + 1} → ${enabledEffects.map(e => e.type).join(' → ')} (mask=0x${channelMask.toString(16)}) via worklet output[${outputIndex}]`);
      slotIdx++;
    }

    // Request diagnostic from worklet after a short delay to let messages settle
    if (slotIdx > 0) {
      setTimeout(() => engine.diagIsolation(), 200);
    }
  }

  /**
   * Update parameters for a specific effect on a specific channel without rebuilding.
   */
  updateEffectParams(channelIndex: number, effectIndex: number, config: EffectConfig): void {
    const slot = this.slots.find(s => s && s.channels.includes(channelIndex));
    if (!slot || effectIndex >= slot.effectNodes.length) return;

    const node = slot.effectNodes[effectIndex];

    // Update wet
    if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
      ((node as any).wet as Tone.Signal).rampTo(config.wet / 100, 0.02);
    }

    // Apply parameter diff
    const prevConfig = slot.effectConfigs[effectIndex];
    const changed: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(config.parameters)) {
      if (prevConfig.parameters[key] !== value) {
        changed[key] = value;
      }
    }
    if (Object.keys(changed).length > 0) {
      applyEffectParametersDiff(node as Tone.ToneAudioNode, config.type, changed);
    }

    slot.effectConfigs[effectIndex] = config;
  }

  /**
   * Tear down all isolation slots and disconnect effects.
   */
  teardown(engine?: { removeIsolation: (slotIndex: number) => void }): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;

      // Disconnect effects
      for (const node of slot.effectNodes) {
        try { (node as any).disconnect?.(); } catch { /* */ }
        try { node.dispose(); } catch { /* */ }
      }
      try { slot.outputGain.disconnect(); } catch { /* */ }

      // Tell engine to remove the worklet isolation module
      if (engine) {
        engine.removeIsolation(i);
      }

      this.slots[i] = null;
    }
  }

  /** Whether any slots are active. */
  get hasActiveSlots(): boolean {
    return this.slots.some(s => s !== null);
  }

  /** Get the slot for a specific channel (if isolated). */
  getSlotForChannel(channelIndex: number): IsolationSlot | null {
    return this.slots.find(s => s && s.channels.includes(channelIndex)) ?? null;
  }

  async dispose(): Promise<void> {
    try {
      const { LibopenmptEngine } = await import('../libopenmpt/LibopenmptEngine');
      if (LibopenmptEngine.hasInstance()) {
        this.teardown(LibopenmptEngine.getInstance());
      } else {
        this.teardown();
      }
    } catch {
      this.teardown();
    }
  }
}

// Singleton
let routedEffectsInstance: ChannelRoutedEffectsManager | null = null;

export function getChannelRoutedEffectsManager(masterEffectsInput?: Tone.Gain): ChannelRoutedEffectsManager {
  if (!routedEffectsInstance && masterEffectsInput) {
    routedEffectsInstance = new ChannelRoutedEffectsManager(masterEffectsInput);
  }
  return routedEffectsInstance!;
}

export function disposeChannelRoutedEffectsManager(): void {
  if (routedEffectsInstance) {
    void routedEffectsInstance.dispose();
    routedEffectsInstance = null;
  }
}

