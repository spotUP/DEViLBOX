/**
 * PedalboardEngine - Neural Effect Chain Processor
 *
 * Manages a chain of neural effects (GuitarML models) that can be connected in series or parallel.
 * Each effect in the chain can be individually enabled/disabled and have its parameters adjusted.
 *
 * Architecture:
 * - Each effect gets its own AudioWorkletNode (GuitarML processor)
 * - Effects are chained in series by default
 * - Supports parallel routing for advanced configurations
 * - Includes input/output gain stages
 */

import { GuitarMLEngine } from './GuitarMLEngine';
import type {
  NeuralPedalboard,
  PedalboardEffect,
} from '@typedefs/pedalboard';
import { getModelByIndex } from '@constants/guitarMLRegistry';

/**
 * Individual effect processor in the chain
 */
interface EffectProcessor {
  id: string;                       // Effect ID
  enabled: boolean;                 // Bypass state
  engine: GuitarMLEngine;          // Neural processor
  inputGain: GainNode;             // Pre-gain
  outputGain: GainNode;            // Post-gain / dry-wet mixer
  bypassGain: GainNode;            // Bypass signal path
}

export class PedalboardEngine {
  private audioContext: AudioContext;
  private isInitialized: boolean = false;

  // Signal chain components
  private inputGain: GainNode;
  private outputGain: GainNode;
  private effectProcessors: Map<string, EffectProcessor> = new Map();

  // Configuration
  private config: NeuralPedalboard;

  // Chain management
  private chainOrder: string[] = []; // Ordered list of effect IDs

  constructor(audioContext: AudioContext, config: NeuralPedalboard) {
    this.audioContext = audioContext;
    this.config = config;

    // Create input/output gain stages
    this.inputGain = audioContext.createGain();
    this.inputGain.gain.value = config.inputGain / 100;

    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = config.outputGain / 100;
  }

  /**
   * Initialize the pedalboard and load all effects
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize all effects in the chain
      for (const effect of this.config.chain) {
        await this.addEffect(effect);
      }

      // Connect the chain
      this.reconnectChain();

      this.isInitialized = true;
      console.log('[PedalboardEngine] Initialized with', this.effectProcessors.size, 'effects');
    } catch (error) {
      console.error('[PedalboardEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Add an effect to the chain
   */
  async addEffect(effect: PedalboardEffect): Promise<void> {
    if (this.effectProcessors.has(effect.id)) {
      console.warn(`[PedalboardEngine] Effect ${effect.id} already exists`);
      return;
    }

    try {
      // Create neural engine for this effect
      const engine = new GuitarMLEngine(this.audioContext);
      await engine.initialize();

      // Load the model if it's a neural effect
      if (effect.type === 'neural' && effect.modelIndex !== undefined) {
        await engine.loadModel(effect.modelIndex);

        // Set initial parameters
        this.applyEffectParameters(engine, effect);
      }

      // Create gain nodes for routing
      const inputGain = this.audioContext.createGain();
      const outputGain = this.audioContext.createGain();
      const bypassGain = this.audioContext.createGain();

      // Set initial bypass state
      inputGain.gain.value = effect.enabled ? 1 : 0;
      bypassGain.gain.value = effect.enabled ? 0 : 1;

      // Store processor
      const processor: EffectProcessor = {
        id: effect.id,
        enabled: effect.enabled,
        engine,
        inputGain,
        outputGain,
        bypassGain,
      };

      this.effectProcessors.set(effect.id, processor);
      this.chainOrder.push(effect.id);

      console.log(`[PedalboardEngine] Added effect: ${effect.id} (${effect.modelName || 'unknown'})`);
    } catch (error) {
      console.error(`[PedalboardEngine] Failed to add effect ${effect.id}:`, error);
      throw error;
    }
  }

  /**
   * Apply effect parameters to the engine
   */
  private applyEffectParameters(engine: GuitarMLEngine, effect: PedalboardEffect): void {
    // Get model info to understand what parameters this model supports
    const modelInfo = effect.modelIndex !== undefined
      ? getModelByIndex(effect.modelIndex)
      : null;

    if (!modelInfo) return;

    // Map common parameters
    if (effect.parameters.drive !== undefined) {
      engine.setCondition(effect.parameters.drive / 100); // Drive typically maps to condition
    }

    if (effect.parameters.dryWet !== undefined) {
      engine.setDryWet(effect.parameters.dryWet / 100);
    }

    if (effect.parameters.level !== undefined) {
      // Level controls output gain
      const processor = this.effectProcessors.get(effect.id);
      if (processor) {
        processor.outputGain.gain.value = effect.parameters.level / 100;
      }
    }

    // For now, map other parameters to condition (can be refined later)
    // Each model might interpret these differently based on training
  }

  /**
   * Remove an effect from the chain
   */
  removeEffect(effectId: string): void {
    const processor = this.effectProcessors.get(effectId);
    if (!processor) {
      console.warn(`[PedalboardEngine] Effect ${effectId} not found`);
      return;
    }

    // Disconnect and dispose
    processor.engine.dispose();
    processor.inputGain.disconnect();
    processor.outputGain.disconnect();
    processor.bypassGain.disconnect();

    this.effectProcessors.delete(effectId);
    this.chainOrder = this.chainOrder.filter(id => id !== effectId);

    // Reconnect the chain without this effect
    this.reconnectChain();

    console.log(`[PedalboardEngine] Removed effect: ${effectId}`);
  }

  /**
   * Reorder effects in the chain
   */
  reorderEffects(newOrder: string[]): void {
    // Validate that all IDs exist
    const allValid = newOrder.every(id => this.effectProcessors.has(id));
    if (!allValid || newOrder.length !== this.chainOrder.length) {
      console.error('[PedalboardEngine] Invalid reorder: missing or extra IDs');
      return;
    }

    this.chainOrder = newOrder;
    this.reconnectChain();

    console.log('[PedalboardEngine] Reordered chain:', this.chainOrder);
  }

  /**
   * Reconnect all effects in the current chain order
   */
  private reconnectChain(): void {
    // Disconnect everything first
    this.inputGain.disconnect();
    this.effectProcessors.forEach(processor => {
      processor.inputGain.disconnect();
      processor.outputGain.disconnect();
      processor.bypassGain.disconnect();
      processor.engine.disconnect();
    });

    if (this.chainOrder.length === 0) {
      // No effects: direct connection
      this.inputGain.connect(this.outputGain);
      return;
    }

    // Connect the chain in order
    let previousNode: AudioNode = this.inputGain;

    for (let i = 0; i < this.chainOrder.length; i++) {
      const processor = this.effectProcessors.get(this.chainOrder[i]);
      if (!processor) continue;

      // Connect previous node to this effect's input
      previousNode.connect(processor.inputGain);

      // Wet path: through the effect
      processor.inputGain.connect(processor.engine.getInput());
      processor.engine.getOutput().connect(processor.outputGain);

      // Dry path: bypass
      processor.inputGain.connect(processor.bypassGain);

      // Merge point for next stage
      const mergeNode = this.audioContext.createGain();
      processor.outputGain.connect(mergeNode);
      processor.bypassGain.connect(mergeNode);

      previousNode = mergeNode;
    }

    // Connect last effect to output
    previousNode.connect(this.outputGain);

    console.log('[PedalboardEngine] Chain reconnected with', this.chainOrder.length, 'effects');
  }

  /**
   * Enable/disable an effect (bypass)
   */
  setEffectEnabled(effectId: string, enabled: boolean): void {
    const processor = this.effectProcessors.get(effectId);
    if (!processor) return;

    processor.enabled = enabled;

    // Smooth transition to avoid clicks
    const now = this.audioContext.currentTime;
    const fadeTime = 0.01; // 10ms crossfade

    if (enabled) {
      // Enable wet path, disable dry path
      processor.inputGain.gain.setValueAtTime(processor.inputGain.gain.value, now);
      processor.inputGain.gain.linearRampToValueAtTime(1, now + fadeTime);

      processor.bypassGain.gain.setValueAtTime(processor.bypassGain.gain.value, now);
      processor.bypassGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    } else {
      // Disable wet path, enable dry path
      processor.inputGain.gain.setValueAtTime(processor.inputGain.gain.value, now);
      processor.inputGain.gain.linearRampToValueAtTime(0, now + fadeTime);

      processor.bypassGain.gain.setValueAtTime(processor.bypassGain.gain.value, now);
      processor.bypassGain.gain.linearRampToValueAtTime(1, now + fadeTime);
    }

    console.log(`[PedalboardEngine] Effect ${effectId} ${enabled ? 'enabled' : 'bypassed'}`);
  }

  /**
   * Set a parameter for a specific effect
   */
  setEffectParameter(effectId: string, paramId: string, value: number): void {
    const processor = this.effectProcessors.get(effectId);
    if (!processor) return;

    // Map parameter to engine control
    switch (paramId) {
      case 'drive':
        processor.engine.setCondition(value / 100);
        break;
      case 'dryWet':
        processor.engine.setDryWet(value / 100);
        break;
      case 'level':
        processor.outputGain.gain.value = value / 100;
        break;
      case 'gain':
        processor.engine.setGain((value - 50) / 50 * 18); // Map 0-100 to -18 to +18 dB
        break;
      default:
        // For other parameters, use condition (model-dependent)
        processor.engine.setCondition(value / 100);
        break;
    }
  }

  /**
   * Set input gain
   */
  setInputGain(gain: number): void {
    this.inputGain.gain.value = gain / 100;
    this.config.inputGain = gain;
  }

  /**
   * Set output gain
   */
  setOutputGain(gain: number): void {
    this.outputGain.gain.value = gain / 100;
    this.config.outputGain = gain;
  }

  /**
   * Master bypass (enable/disable entire pedalboard)
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    // Fade in/out to avoid clicks
    const now = this.audioContext.currentTime;
    const fadeTime = 0.02; // 20ms fade

    this.outputGain.gain.setValueAtTime(this.outputGain.gain.value, now);
    this.outputGain.gain.linearRampToValueAtTime(
      enabled ? (this.config.outputGain / 100) : 0,
      now + fadeTime
    );
  }

  /**
   * Update entire pedalboard configuration with smart diff
   * Only modifies effects that have actually changed
   */
  async updateConfig(newConfig: NeuralPedalboard): Promise<void> {
    const oldConfig = this.config;

    // Check if we can do an incremental update
    if (!this.isInitialized) {
      // Not initialized yet, just set config and init
      this.config = newConfig;
      await this.initialize();
      return;
    }

    // Update global gain settings
    if (newConfig.inputGain !== oldConfig.inputGain) {
      this.inputGain.gain.value = newConfig.inputGain / 100;
    }
    if (newConfig.outputGain !== oldConfig.outputGain) {
      this.outputGain.gain.value = newConfig.outputGain / 100;
    }
    if (newConfig.enabled !== oldConfig.enabled) {
      this.setEnabled(newConfig.enabled);
    }

    // Build maps for efficient comparison
    const oldEffectsMap = new Map(oldConfig.chain.map(e => [e.id, e]));
    const newEffectsMap = new Map(newConfig.chain.map(e => [e.id, e]));
    const newOrder = newConfig.chain.map(e => e.id);

    // Find effects to remove (in old but not in new)
    for (const oldEffect of oldConfig.chain) {
      if (!newEffectsMap.has(oldEffect.id)) {
        this.removeEffect(oldEffect.id);
      }
    }

    // Find effects to add (in new but not in old) or update (in both)
    for (const newEffect of newConfig.chain) {
      const oldEffect = oldEffectsMap.get(newEffect.id);

      if (!oldEffect) {
        // New effect - add it
        await this.addEffect(newEffect);
      } else {
        // Existing effect - check if parameters changed
        const processor = this.effectProcessors.get(newEffect.id);
        if (processor) {
          // Update enabled state
          if (newEffect.enabled !== oldEffect.enabled) {
            this.setEffectEnabled(newEffect.id, newEffect.enabled);
          }

          // Update parameters if changed
          if (JSON.stringify(newEffect.parameters) !== JSON.stringify(oldEffect.parameters)) {
            this.applyEffectParameters(processor.engine, newEffect);
          }

          // Update model if changed
          if (newEffect.modelIndex !== oldEffect.modelIndex && newEffect.modelIndex !== undefined) {
            await processor.engine.loadModel(newEffect.modelIndex);
            this.applyEffectParameters(processor.engine, newEffect);
          }
        }
      }
    }

    // Check if chain order changed and reconnect if needed
    const orderChanged = this.chainOrder.length !== newOrder.length ||
      !this.chainOrder.every((id, i) => id === newOrder[i]);

    if (orderChanged) {
      this.chainOrder = newOrder;
      this.reconnectChain();
    }

    // Update config reference
    this.config = newConfig;
  }

  /**
   * Get current configuration
   */
  getConfig(): NeuralPedalboard {
    return {
      ...this.config,
      chain: this.chainOrder.map(id => {
        const processor = this.effectProcessors.get(id);
        const effect = this.config.chain.find(e => e.id === id);
        return {
          ...effect!,
          enabled: processor?.enabled ?? false,
        };
      }),
    };
  }

  /**
   * Connect pedalboard input
   */
  getInput(): AudioNode {
    return this.inputGain;
  }

  /**
   * Connect pedalboard output
   */
  getOutput(): AudioNode {
    return this.outputGain;
  }

  /**
   * Connect to destination
   */
  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  /**
   * Disconnect from all destinations
   */
  disconnect(): void {
    this.outputGain.disconnect();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.effectProcessors.forEach(processor => {
      processor.engine.dispose();
      processor.inputGain.disconnect();
      processor.outputGain.disconnect();
      processor.bypassGain.disconnect();
    });

    this.effectProcessors.clear();
    this.chainOrder = [];
    this.inputGain.disconnect();
    this.outputGain.disconnect();

    this.isInitialized = false;

    console.log('[PedalboardEngine] Disposed');
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
