/**
 * graphToConfig — Converts a SunVox module graph (from WASM) to a ModularPatchConfig.
 *
 * Used when loading .sunvox files to populate the modular editor with the real module layout.
 */

import type { ModularPatchConfig, ModularModuleInstance, ModularConnection } from '@/types/modular';
import type { SunVoxModuleGraphEntry } from '@/engine/sunvox/SunVoxEngine';
import { SUNVOX_MODULE_TYPE_MAP } from './SunVoxModuleTypes';

/**
 * Convert a SunVox WASM module graph to a ModularPatchConfig for the editor.
 * Lays modules out in a grid pattern for the canvas view.
 */
export function sunvoxGraphToConfig(graph: SunVoxModuleGraphEntry[]): ModularPatchConfig {
  const modules: ModularModuleInstance[] = [];
  const connections: ModularConnection[] = [];
  const COL_WIDTH = 200;
  const ROW_HEIGHT = 120;
  const COLS = 4;

  for (let i = 0; i < graph.length; i++) {
    const entry = graph[i];
    const typeInfo = SUNVOX_MODULE_TYPE_MAP.get(entry.typeName);

    // Build the sv_ descriptor ID from the type name
    const descriptorId = `sv_${entry.typeName.replace(/\s+/g, '_').toLowerCase()}`;

    // Grid layout
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    modules.push({
      id: `sv_m${entry.id}`,
      descriptorId,
      label: entry.name || typeInfo?.displayName || entry.typeName,
      parameters: {},
      position: {
        x: 50 + col * COL_WIDTH,
        y: 50 + row * ROW_HEIGHT,
      },
    });
  }

  // Build connections from the graph's output lists.
  // In SunVox, module.outputs contains the IDs of modules this module sends audio TO.
  let connIdx = 0;
  for (const entry of graph) {
    for (const destId of entry.outputs) {
      // Only add if both source and dest are in our module list
      const srcUiId = `sv_m${entry.id}`;
      const dstUiId = `sv_m${destId}`;
      if (modules.some(m => m.id === srcUiId) && modules.some(m => m.id === dstUiId)) {
        connections.push({
          id: `c_${connIdx++}`,
          source: { moduleId: srcUiId, portId: 'output' },
          target: { moduleId: dstUiId, portId: 'input' },
          amount: 1,
        });
      }
    }
  }

  return {
    modules,
    connections,
    polyphony: 1,
    viewMode: 'canvas',
    backend: 'sunvox',
  };
}
