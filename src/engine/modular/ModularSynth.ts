/**
 * ModularSynth - Polyphonic modular synthesis engine
 *
 * Runtime engine that manages voice allocation, module instances, and connections.
 * Implements DevilboxSynth interface for integration with the synthesis framework.
 */

import type { DevilboxSynth } from '../../types/synth';
import type { ModularPatchConfig, ModularModuleInstance, ModularConnection } from '../../types/modular';
import { ModularVoice } from './ModularVoice';
import { ModularConnectionManager } from './ModularConnectionManager';
import { getDevilboxAudioContext } from '../../utils/audio-context';
import { registerBuiltInModules } from './modules';

export class ModularSynth implements DevilboxSynth {
  readonly name = 'ModularSynth';
  output: GainNode;
  private ctx: AudioContext;
  private voices: ModularVoice[] = [];
  private activeVoices = new Map<number, ModularVoice>(); // noteNumber → voice
  private config: ModularPatchConfig;
  private connectionManager: ModularConnectionManager;

  constructor(config: ModularPatchConfig) {
    this.ctx = getDevilboxAudioContext();
    this.output = this.ctx.createGain();
    this.config = config;
    this.connectionManager = new ModularConnectionManager();

    // Ensure built-in modules are registered
    registerBuiltInModules();

    // Initialize voices
    this.initializeVoices();
  }

  /**
   * Initialize voice pool based on polyphony setting
   */
  private initializeVoices(): void {
    const polyphony = this.config.polyphony || 1;
    this.voices = [];

    for (let i = 0; i < polyphony; i++) {
      const voice = new ModularVoice(this.ctx, this.config.modules, this.output);
      this.voices.push(voice);
    }

    // Build connections
    if (this.config.connections.length > 0) {
      this.connectionManager.updateConnections(
        this.voices,
        this.config.connections
      );
    }
  }

  /**
   * Trigger a note on (allocate voice and gate on)
   */
  triggerAttack(note: number, time: number = this.ctx.currentTime, velocity: number = 1): void {
    // Find free voice or steal oldest
    let voice = this.voices.find((v) => !v.isActive);
    if (!voice) {
      // Voice stealing: steal the oldest active voice
      const oldestNote = Array.from(this.activeVoices.keys())[0];
      voice = this.activeVoices.get(oldestNote);
      if (voice) {
        this.activeVoices.delete(oldestNote);
      }
    }

    if (voice) {
      voice.noteOn(note, time, velocity);
      this.activeVoices.set(note, voice);
    }
  }

  /**
   * Trigger a note off (gate off)
   */
  triggerRelease(note: number, time: number = this.ctx.currentTime): void {
    const voice = this.activeVoices.get(note);
    if (voice) {
      voice.noteOff(time);
      this.activeVoices.delete(note);
    }
  }

  /**
   * Set a parameter value (format: "moduleId.paramId")
   */
  set(param: string, value: number): void {
    const [moduleId, paramId] = param.split('.');
    if (!moduleId || !paramId) {
      console.warn(`[ModularSynth] Invalid param format: ${param}`);
      return;
    }

    // Update config
    const module = this.config.modules.find((m) => m.id === moduleId);
    if (module) {
      module.parameters[paramId] = value;
    }

    // Update all voices
    this.voices.forEach((voice) => {
      voice.setParameter(moduleId, paramId, value);
    });
  }

  /**
   * Get a parameter value (format: "moduleId.paramId")
   */
  get(param: string): number {
    const [moduleId, paramId] = param.split('.');
    const module = this.config.modules.find((m) => m.id === moduleId);
    return module?.parameters[paramId] ?? 0;
  }

  /**
   * Add a module to the patch (hot-swap)
   */
  addModule(module: ModularModuleInstance): void {
    this.config.modules.push(module);

    // Add module to all voices
    this.voices.forEach((voice) => {
      voice.addModule(module);
    });
  }

  /**
   * Remove a module from the patch (hot-swap)
   */
  removeModule(moduleId: string): void {
    this.config.modules = this.config.modules.filter((m) => m.id !== moduleId);

    // Remove from voices
    this.voices.forEach((voice) => {
      voice.removeModule(moduleId);
    });

    // Remove connections involving this module
    this.config.connections = this.config.connections.filter(
      (conn) => conn.source.moduleId !== moduleId && conn.target.moduleId !== moduleId
    );

    this.connectionManager.updateConnections(this.voices, this.config.connections);
  }

  /**
   * Add a connection between ports (hot-swap)
   */
  addConnection(connection: ModularConnection): void {
    this.config.connections.push(connection);
    this.connectionManager.updateConnections(this.voices, this.config.connections);
  }

  /**
   * Remove a connection (hot-swap)
   */
  removeConnection(connectionId: string): void {
    this.config.connections = this.config.connections.filter((c) => c.id !== connectionId);
    this.connectionManager.updateConnections(this.voices, this.config.connections);
  }

  /**
   * Get current patch configuration
   */
  getConfig(): ModularPatchConfig {
    return { ...this.config };
  }

  /**
   * Update polyphony (re-initializes voices)
   */
  setPolyphony(polyphony: number): void {
    // Dispose old voices
    this.voices.forEach((v) => v.dispose());
    this.voices = [];
    this.activeVoices.clear();

    // Re-initialize with new polyphony
    this.config.polyphony = polyphony;
    this.initializeVoices();
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    this.voices.forEach((voice) => voice.dispose());
    this.voices = [];
    this.activeVoices.clear();
    this.output.disconnect();
  }
}
