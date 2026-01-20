import * as Tone from 'tone';
import type { EffectConfig } from '@typedefs/instrument';
import { InstrumentFactory } from '../InstrumentFactory';

export class EffectChainManager {
  // Master effects
  private masterEffectsNodes: Tone.ToneAudioNode[] = [];
  private masterEffectConfigs: Map<string, { node: Tone.ToneAudioNode; config: EffectConfig }> = new Map();
  
  // Instrument effect chains
  private instrumentEffectChains: Map<string | number, {
    effects: Tone.ToneAudioNode[];
    output: Tone.Gain;
  }> = new Map();

  private masterInput: Tone.Gain;
  private masterChannel: Tone.Channel;

  constructor(masterInput: Tone.Gain, masterChannel: Tone.Channel) {
    this.masterInput = masterInput;
    this.masterChannel = masterChannel;
  }

  public rebuildInstrumentEffects(key: string | number, effects: EffectConfig[], instrument?: Tone.ToneAudioNode): void {
    if (!instrument) {
      return;
    }
    this.buildInstrumentEffectChain(key, effects, instrument, this.masterInput);
  }

  public rebuildMasterEffects(effects: EffectConfig[]): void {
    console.log('[EffectChainManager] Rebuilding master effects chain', effects.length, 'effects');

    try {
      this.masterInput.disconnect();
      this.masterEffectsNodes.forEach((node) => {
        try {
          node.disconnect();
          node.dispose();
        } catch { /* ignore */ }
      });
      this.masterEffectsNodes = [];
      this.masterEffectConfigs.clear();

      const enabledEffects = effects.filter((fx) => fx.enabled);

      if (enabledEffects.length === 0) {
        Tone.connect(this.masterInput, this.masterChannel);
        return;
      }

      enabledEffects.forEach((config) => {
        const node = InstrumentFactory.createEffect(config);
        this.masterEffectsNodes.push(node);
        this.masterEffectConfigs.set(config.id, { node, config });
      });

      Tone.connect(this.masterInput, this.masterEffectsNodes[0]);
      for (let i = 0; i < this.masterEffectsNodes.length - 1; i++) {
        Tone.connect(this.masterEffectsNodes[i], this.masterEffectsNodes[i + 1]);
      }
      Tone.connect(this.masterEffectsNodes[this.masterEffectsNodes.length - 1], this.masterChannel);
    } catch (e) {
      console.error('[EffectChainManager] Error rebuilding master chain:', e);
      // Fail-safe: connect input to output
      try { Tone.connect(this.masterInput, this.masterChannel); } catch {}
    }
  }

  public updateMasterEffectParams(effectId: string, config: EffectConfig): void {
    const effectData = this.masterEffectConfigs.get(effectId);
    if (!effectData) return;

    const { node } = effectData;
    const wetValue = config.wet / 100;

    try {
        if ('wet' in node && (node as any).wet instanceof Tone.Signal) {
            (node as any).wet.value = wetValue;
        }
        effectData.config = config;
    } catch (e) {
        console.error('[EffectChainManager] Failed to update effect:', e);
    }
  }

  public buildInstrumentEffectChain(
    key: string | number,
    effects: EffectConfig[],
    instrument: Tone.ToneAudioNode,
    masterInput: Tone.Gain 
  ): void {
    this.disposeInstrumentEffectChain(key);

    const output = new Tone.Gain(1);
    const enabledEffects = effects.filter((fx) => fx.enabled);

    try {
      if (enabledEffects.length === 0) {
        // Defensive connection: Ensure instrument exists and has an output
        if (instrument) {
          Tone.connect(instrument, output);
          Tone.connect(output, masterInput);
          this.instrumentEffectChains.set(key, { effects: [], output });
        }
        return;
      }

      const effectNodes = enabledEffects.map((config) => InstrumentFactory.createEffect(config));

      Tone.connect(instrument, effectNodes[0]);
      for (let i = 0; i < effectNodes.length - 1; i++) {
        Tone.connect(effectNodes[i], effectNodes[i + 1]);
      }
      Tone.connect(effectNodes[effectNodes.length - 1], output);
      Tone.connect(output, masterInput);

      this.instrumentEffectChains.set(key, { effects: effectNodes, output });
    } catch (e) {
      console.error('[EffectChainManager] Error building instrument chain:', e);
      // Fail-safe: Try connecting instrument directly to master
      try { Tone.connect(instrument, masterInput); } catch {}
    }
  }

  public disposeInstrumentEffectChain(key: string | number): void {
    const chain = this.instrumentEffectChains.get(key);
    if (chain) {
      chain.effects.forEach((fx) => { try { fx.dispose(); } catch {} });
      try { chain.output.dispose(); } catch {}
      this.instrumentEffectChains.delete(key);
    }
  }

  public disposeAll(): void {
    this.masterEffectsNodes.forEach(n => n.dispose());
    this.masterEffectsNodes = [];
    this.masterEffectConfigs.clear();
    this.instrumentEffectChains.forEach((_, key) => this.disposeInstrumentEffectChain(key));
  }
}
