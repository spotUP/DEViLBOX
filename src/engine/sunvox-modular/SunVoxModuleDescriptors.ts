/**
 * SunVoxModuleDescriptors — Generates ModuleDescriptor objects from the SunVox types table.
 *
 * Each SunVox module type gets a descriptor with an `sv_` prefixed ID, ports based on
 * whether it's a generator/output/effect, and empty parameters (fetched dynamically from WASM).
 */

import type { ModuleDescriptor, ModuleCategory, ModuleInstance } from '@/types/modular';
import { ModuleRegistry } from '@/engine/modular/ModuleRegistry';
import { SUNVOX_MODULE_TYPES } from './SunVoxModuleTypes';

function makeDescriptorId(typeString: string): string {
  return `sv_${typeString.replace(/\s+/g, '_').toLowerCase()}`;
}

function buildDescriptor(entry: typeof SUNVOX_MODULE_TYPES[number]): ModuleDescriptor {
  const id = makeDescriptorId(entry.typeString);
  const isOutput = entry.typeString === 'Output';

  const ports: ModuleDescriptor['ports'] = [];

  if (!isOutput) {
    ports.push({ id: 'output', name: 'Output', direction: 'output', signal: 'audio' });
  }

  if (!entry.isGenerator) {
    ports.push({ id: 'input', name: 'Input', direction: 'input', signal: 'audio' });
  }

  // Output module gets only an input port
  if (isOutput) {
    ports.push({ id: 'input', name: 'Input', direction: 'input', signal: 'audio' });
  }

  const noopInstance: ModuleInstance = {
    descriptorId: id,
    ports: new Map(),
    setParam: () => {},
    getParam: () => 0,
    dispose: () => {},
  };

  return {
    id,
    name: entry.displayName,
    category: entry.category as ModuleCategory,
    voiceMode: 'shared',
    color: entry.color,
    ports,
    parameters: [],
    create: () => noopInstance,
  };
}

export const SUNVOX_MODULE_DESCRIPTORS: ModuleDescriptor[] =
  SUNVOX_MODULE_TYPES.map(buildDescriptor);

/** Map from sv_ descriptor ID to SunVox type string (e.g. "sv_analog_generator" → "Analog generator") */
export const SV_ID_TO_TYPE_STRING = new Map<string, string>(
  SUNVOX_MODULE_TYPES.map(t => [makeDescriptorId(t.typeString), t.typeString])
);

/** Register all SunVox module descriptors in the global ModuleRegistry (idempotent) */
export function registerSunVoxModules(): void {
  for (const desc of SUNVOX_MODULE_DESCRIPTORS) {
    ModuleRegistry.register(desc);
  }
}
