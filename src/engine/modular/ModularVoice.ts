/**
 * ModularVoice - Per-voice module graph
 *
 * Each voice has its own instances of per-voice modules (VCO, VCF, VCA, ADSR).
 * Shared modules (LFO, Noise) are instantiated once and shared across voices.
 */

import type { ModularModuleInstance, ModuleInstance } from '../../types/modular';
import { ModuleRegistry } from './ModuleRegistry';
import { noteToFrequency } from '../../utils/audio-context';

export class ModularVoice {
  isActive = false;
  private ctx: AudioContext;
  private modules = new Map<string, ModuleInstance>();
  private voiceOutput: GainNode;
  private _currentNote: number | null = null; // Tracked for future use (e.g., pitch bend)

  constructor(
    ctx: AudioContext,
    moduleConfigs: ModularModuleInstance[],
    masterOutput: GainNode
  ) {
    this.ctx = ctx;
    this.voiceOutput = ctx.createGain();
    this.voiceOutput.connect(masterOutput);

    // Create module instances
    moduleConfigs.forEach((config) => {
      this.createModule(config);
    });
  }

  /**
   * Create a module instance from config
   */
  private createModule(config: ModularModuleInstance): void {
    const descriptor = ModuleRegistry.get(config.descriptorId);
    if (!descriptor) {
      console.warn(`[ModularVoice] Unknown module descriptor: ${config.descriptorId}`);
      return;
    }

    // Only create per-voice modules in each voice
    // Shared modules are created once by the graph builder
    if (descriptor.voiceMode === 'per-voice') {
      const instance = descriptor.create(this.ctx);

      // Apply stored parameters
      Object.entries(config.parameters).forEach(([paramId, value]) => {
        instance.setParam(paramId, value);
      });

      this.modules.set(config.id, instance);
    }
  }

  /**
   * Trigger note on
   */
  noteOn(note: number, time: number, velocity: number): void {
    this.isActive = true;
    this._currentNote = note;

    const frequency = noteToFrequency(note);

    // Set frequency on all VCO modules
    this.modules.forEach((module, id) => {
      const descriptor = ModuleRegistry.get(
        Array.from(this.modules.entries()).find(([key]) => key === id)?.[1].descriptorId || ''
      );

      // Gate on for envelope modules
      if (module.gateOn) {
        module.gateOn(time, velocity);
      }

      // Set pitch for oscillator modules
      // (Pitch is typically controlled via CV, but for now we set frequency directly)
      if (descriptor?.category === 'source' && module.setParam) {
        module.setParam('frequency', frequency);
      }
    });
  }

  /**
   * Trigger note off
   */
  noteOff(time: number): void {
    this.modules.forEach((module) => {
      if (module.gateOff) {
        module.gateOff(time);
      }
    });

    // Mark as inactive after envelope decay
    setTimeout(() => {
      this.isActive = false;
      this._currentNote = null;
    }, 2000); // Conservative 2s for envelope decay
  }

  /**
   * Set parameter on a module
   */
  setParameter(moduleId: string, paramId: string, value: number): void {
    const module = this.modules.get(moduleId);
    if (module) {
      module.setParam(paramId, value);
    }
  }

  /**
   * Add a module to this voice
   */
  addModule(config: ModularModuleInstance): void {
    this.createModule(config);
  }

  /**
   * Remove a module from this voice
   */
  removeModule(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (module) {
      module.dispose();
      this.modules.delete(moduleId);
    }
  }

  /**
   * Get module instance by ID
   */
  getModule(moduleId: string): ModuleInstance | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get voice output node
   */
  getOutput(): GainNode {
    return this.voiceOutput;
  }

  /**
   * Get current note (for pitch bend, vibrato, etc.)
   */
  getCurrentNote(): number | null {
    return this._currentNote;
  }

  /**
   * Cleanup all modules
   */
  dispose(): void {
    this.modules.forEach((module) => module.dispose());
    this.modules.clear();
    this.voiceOutput.disconnect();
  }
}
