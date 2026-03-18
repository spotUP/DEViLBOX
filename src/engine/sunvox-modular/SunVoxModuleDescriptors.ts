/**
 * SunVoxModuleDescriptors — Generates ModuleDescriptor objects for SunVox module types.
 *
 * These descriptors have `sv_` prefixed IDs to avoid collision with Web Audio modules.
 * They use simplified single-in/single-out ports (SunVox connections are module-to-module).
 * Parameters are fetched dynamically from WASM at runtime, so descriptors have none.
 * The create() factory is a no-op since SunVox manages all DSP internally.
 */

import type { ModuleDescriptor, ModuleCategory } from '@/types/modular';
import { SUNVOX_MODULE_TYPES } from './SunVoxModuleTypes';
import { ModuleRegistry } from '@/engine/modular/ModuleRegistry';

function makeSunVoxDescriptor(
  typeString: string,
  displayName: string,
  category: ModuleCategory,
  color: string,
  isGenerator: boolean,
): ModuleDescriptor {
  const id = `sv_${typeString.replace(/\s+/g, '_').toLowerCase()}`;

  return {
    id,
    name: displayName,
    category,
    voiceMode: 'shared', // SunVox handles polyphony internally
    color,
    ports: [
      ...(isGenerator ? [] : [{ id: 'input', name: 'Input', direction: 'input' as const, signal: 'audio' as const }]),
      // Output module has no output port (it's the sink)
      ...(typeString === 'Output' ? [] : [{ id: 'output', name: 'Output', direction: 'output' as const, signal: 'audio' as const }]),
    ],
    parameters: [], // Fetched dynamically from WASM
    create: () => ({
      descriptorId: id,
      ports: new Map(),
      setParam: () => {},
      getParam: () => 0,
      dispose: () => {},
    }),
  };
}

/** All SunVox module descriptors with sv_ prefixed IDs */
export const SUNVOX_MODULE_DESCRIPTORS: ModuleDescriptor[] = SUNVOX_MODULE_TYPES
  .map(t => makeSunVoxDescriptor(
    t.typeString,
    t.displayName,
    t.category as ModuleCategory,
    t.color,
    t.isGenerator,
  ));

/** Map from sv_ descriptor ID to SunVox type string */
export const SV_ID_TO_TYPE_STRING = new Map(
  SUNVOX_MODULE_TYPES.map(t => [
    `sv_${t.typeString.replace(/\s+/g, '_').toLowerCase()}`,
    t.typeString,
  ])
);

/** Register all SunVox module descriptors in the ModuleRegistry */
export function registerSunVoxModules(): void {
  for (const desc of SUNVOX_MODULE_DESCRIPTORS) {
    ModuleRegistry.register(desc);
  }
}
