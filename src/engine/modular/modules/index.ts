/**
 * Built-in Modular Synth Modules
 *
 * Registers all built-in modules with the ModuleRegistry.
 * This file is imported by ModularSynth on initialization.
 */

import { ModuleRegistry } from '../ModuleRegistry';

// Source modules
import { VCODescriptor } from './VCOModule';
import { NoiseDescriptor } from './NoiseModule';

// Filter modules
import { VCFDescriptor } from './VCFModule';

// Amplifier modules
import { VCADescriptor } from './VCAModule';

// Modulator modules
import { LFODescriptor } from './LFOModule';

// Envelope modules
import { ADSRDescriptor } from './ADSRModule';

// Utility modules
import { MixerDescriptor } from './MixerModule';
import { DelayDescriptor } from './DelayModule';
import { SampleHoldDescriptor } from './SampleHoldModule';
import { WaveshaperDescriptor } from './WaveshaperModule';
import { CompressorDescriptor } from './CompressorModule';
import { ReverbDescriptor } from './ReverbModule';
import { RingModulatorDescriptor } from './RingModulatorModule';

// Modulator modules (additional)
import { ArpeggiatorDescriptor } from './ArpeggiatorModule';

// I/O modules
import { OutputDescriptor } from './OutputModule';
import { MIDIInDescriptor } from './MIDIInModule';

// Register all built-in modules
const builtInModules = [
  // Sources
  VCODescriptor,
  NoiseDescriptor,

  // Filters
  VCFDescriptor,

  // Amplifiers
  VCADescriptor,

  // Modulators
  LFODescriptor,
  ArpeggiatorDescriptor,

  // Envelopes
  ADSRDescriptor,

  // Utility
  MixerDescriptor,
  DelayDescriptor,
  SampleHoldDescriptor,
  WaveshaperDescriptor,
  CompressorDescriptor,
  ReverbDescriptor,
  RingModulatorDescriptor,

  // I/O
  OutputDescriptor,
  MIDIInDescriptor,
];

// Register all built-in modules
export function registerBuiltInModules() {
  builtInModules.forEach((descriptor) => {
    ModuleRegistry.register(descriptor);
  });
}

// Auto-register on import
registerBuiltInModules();

export {
  // Source modules
  VCODescriptor,
  NoiseDescriptor,

  // Filter modules
  VCFDescriptor,

  // Amplifier modules
  VCADescriptor,

  // Modulator modules
  LFODescriptor,
  ArpeggiatorDescriptor,

  // Envelope modules
  ADSRDescriptor,

  // Utility modules
  MixerDescriptor,
  DelayDescriptor,
  SampleHoldDescriptor,
  WaveshaperDescriptor,
  CompressorDescriptor,
  ReverbDescriptor,
  RingModulatorDescriptor,

  // I/O modules
  OutputDescriptor,
  MIDIInDescriptor,
};
