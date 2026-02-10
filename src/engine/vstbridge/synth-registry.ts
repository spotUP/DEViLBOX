/**
 * synth-registry.ts - Declarative registry for VSTBridge synths
 *
 * Adding a new synth = adding one descriptor object.
 * No worklet to write, no TypeScript class, no factory changes.
 */

export interface VSTBridgeParam {
  id: number;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
}

export interface VSTBridgeDescriptor {
  /** SynthType string used in InstrumentConfig, e.g. 'DexedBridge' */
  id: string;
  /** Display name for UI, e.g. 'Dexed DX7 (Bridge)' */
  name: string;
  /** Directory under public/ containing WASM files, e.g. 'dexed' */
  wasmDir: string;
  /** Base filename (no extension), e.g. 'dexed' → dexed.wasm + dexed.js */
  wasmFile: string;
  /** Class name exported from WASM module, e.g. 'DexedSynth' */
  synthClassName: string;
  /** Emscripten module factory function name, e.g. 'createDexedModule' */
  moduleFactoryName: string;
  /** Volume normalization offset in dB (applied to output gain) */
  volumeOffsetDb?: number;
  /** Optional custom UI panel component name (overrides auto-generated knobs) */
  panelComponent?: string;
  /** Supported extension command types, e.g. ['loadSysEx', 'loadPatch'] */
  commands?: string[];
}

/** Global registry of VSTBridge synth descriptors */
export const SYNTH_REGISTRY = new Map<string, VSTBridgeDescriptor>();

/** Register a new VSTBridge synth descriptor */
export function registerVSTBridge(desc: VSTBridgeDescriptor): void {
  SYNTH_REGISTRY.set(desc.id, desc);
}

// ---------------------------------------------------------------------------
// Example: Register Dexed via VSTBridge (for testing/validation)
// This creates a 'DexedBridge' synth type that uses the same WASM as Dexed
// but routes through the generic VSTBridge worklet instead of Dexed.worklet.js
// ---------------------------------------------------------------------------
registerVSTBridge({
  id: 'DexedBridge',
  name: 'Dexed DX7 (Bridge)',
  wasmDir: 'dexed',
  wasmFile: 'Dexed',
  synthClassName: 'DexedSynth',
  moduleFactoryName: 'createDexedModule',
  volumeOffsetDb: 41,
  commands: ['loadSysEx', 'loadPatch'],
});
