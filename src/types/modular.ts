/**
 * Modular Synth System Type Definitions
 *
 * Defines the complete type system for the modular synthesis engine:
 * - Signal types (audio, cv, gate, trigger)
 * - Module descriptors and instances
 * - Patch configuration and connections
 * - View modes (rack, canvas, matrix)
 */

/**
 * Signal type definitions for modular routing
 */
export type SignalType = 'audio' | 'cv' | 'gate' | 'trigger';

/**
 * Voice mode determines whether module instances are cloned per voice or shared
 */
export type VoiceMode = 'per-voice' | 'shared';

/**
 * Visual editor view modes
 */
export type ModularViewMode = 'rack' | 'canvas' | 'matrix';

/**
 * Module categories for organization
 */
export type ModuleCategory =
  | 'source'      // VCO, Noise
  | 'filter'      // VCF
  | 'amplifier'   // VCA
  | 'modulator'   // LFO
  | 'envelope'    // ADSR
  | 'utility'     // Mixer, S&H, Delay
  | 'io';         // MIDI-In, Output

/**
 * Port definition in a module descriptor
 */
export interface ModulePortDef {
  id: string;
  name: string;
  direction: 'input' | 'output';
  signal: SignalType;
}

/**
 * Parameter definition in a module descriptor
 */
export interface ModuleParamDef {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  unit?: string;
  curve?: 'linear' | 'exponential' | 'logarithmic';
}

/**
 * Module descriptor - metadata and factory for a module type
 * Registered in ModuleRegistry, immutable blueprint
 */
export interface ModuleDescriptor {
  id: string;
  name: string;
  category: ModuleCategory;
  voiceMode: VoiceMode;
  color?: string;
  ports: ModulePortDef[];
  parameters: ModuleParamDef[];

  /**
   * Factory method to create a module instance
   * @param ctx AudioContext
   * @returns ModuleInstance with initialized audio nodes
   */
  create: (ctx: AudioContext) => ModuleInstance;
}

/**
 * Runtime port instance with actual audio nodes/params
 */
export interface ModulePort {
  id: string;
  name: string;
  direction: 'input' | 'output';
  signal: SignalType;

  /**
   * Audio node for audio/cv outputs, or target for audio inputs
   */
  node?: AudioNode;

  /**
   * AudioParam for CV inputs (e.g., filter cutoff)
   */
  param?: AudioParam;

  /**
   * GainNode used to scale CV signals (0-1 → param range)
   */
  scaleNode?: GainNode;
}

/**
 * Module instance - runtime instantiation of a ModuleDescriptor
 * Created per voice (VCO, VCF, VCA, ADSR) or shared (LFO, Noise)
 */
export interface ModuleInstance {
  descriptorId: string;
  ports: Map<string, ModulePort>;

  /**
   * Set a parameter value (0-1 normalized)
   */
  setParam: (paramId: string, value: number) => void;

  /**
   * Get current parameter value (0-1 normalized)
   */
  getParam: (paramId: string) => number;

  /**
   * Trigger gate on (for envelope/gate modules)
   */
  gateOn?: (time: number, velocity: number) => void;

  /**
   * Trigger gate off (for envelope/gate modules)
   */
  gateOff?: (time: number) => void;

  /**
   * Cleanup audio nodes
   */
  dispose: () => void;
}

/**
 * Reference to a specific port on a module instance
 */
export interface PortRef {
  moduleId: string;
  portId: string;
}

/**
 * Connection between two ports in the patch
 */
export interface ModularConnection {
  id: string;
  source: PortRef;
  target: PortRef;
  amount: number;  // 0-1, used for CV scaling
  color?: string;  // Optional user-chosen color
}

/**
 * Module instance in a patch configuration
 */
export interface ModularModuleInstance {
  id: string;
  descriptorId: string;
  label?: string;  // User-assigned label
  parameters: Record<string, number>;  // paramId → value (0-1)

  // View-specific properties
  position?: { x: number; y: number };  // Canvas view
  collapsed?: boolean;                   // All views
  rackSlot?: number;                     // Rack view
}

/**
 * Camera state for canvas view
 */
export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Complete modular patch configuration
 */
export interface ModularPatchConfig {
  modules: ModularModuleInstance[];
  connections: ModularConnection[];
  polyphony: number;  // 1-8 voices
  viewMode: ModularViewMode;
  camera?: CanvasCamera;  // Canvas view only
}

/**
 * Default empty patch configuration
 */
export const DEFAULT_MODULAR_PATCH: ModularPatchConfig = {
  modules: [],
  connections: [],
  polyphony: 1,
  viewMode: 'rack',
};
