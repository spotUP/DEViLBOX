/**
 * graphToConfig — Converts a SunVox module graph (from WASM) to a ModularPatchConfig.
 *
 * Used when loading .sunvox files to populate the modular editor with the real module layout.
 * Stores control metadata in module.parameters as "ctl_{index}" keys with current values,
 * and control metadata (name/min/max) in a separate exported map for the UI to access.
 */

import type { ModularPatchConfig, ModularModuleInstance, ModularConnection } from '@/types/modular';
import type { SunVoxModuleGraphEntry } from '@/engine/sunvox/SunVoxEngine';
import { SUNVOX_MODULE_TYPE_MAP } from './SunVoxModuleTypes';

/** Per-module control metadata, keyed by module UI id */
export interface SunVoxControlMeta {
  id: number;
  name: string;
  min: number;
  max: number;
}

/** Stored globally so the ModulePanel can access control names/ranges */
let _controlMetaMap = new Map<string, SunVoxControlMeta[]>();

export function getSunVoxControlMeta(moduleUiId: string): SunVoxControlMeta[] {
  return _controlMetaMap.get(moduleUiId) || [];
}

/**
 * Convert a SunVox WASM module graph to a ModularPatchConfig for the editor.
 */
export function sunvoxGraphToConfig(graph: SunVoxModuleGraphEntry[]): ModularPatchConfig {
  const modules: ModularModuleInstance[] = [];
  const connections: ModularConnection[] = [];
  const controlMeta = new Map<string, SunVoxControlMeta[]>();
  const COL_WIDTH = 220;
  const ROW_HEIGHT = 150;
  const COLS = 4;

  for (let i = 0; i < graph.length; i++) {
    const entry = graph[i];
    const typeInfo = SUNVOX_MODULE_TYPE_MAP.get(entry.typeName);
    const descriptorId = `sv_${entry.typeName.replace(/\s+/g, '_').toLowerCase()}`;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const uiId = `sv_m${entry.id}`;

    // Store control values as parameters: "ctl_0" = value, "ctl_1" = value, etc.
    const parameters: Record<string, number> = {};
    const meta: SunVoxControlMeta[] = [];
    for (let c = 0; c < entry.controls.length; c++) {
      const ctl = entry.controls[c];
      parameters[`ctl_${c}`] = ctl.value;
      meta.push({ id: c, name: ctl.name, min: ctl.min, max: ctl.max });
    }

    controlMeta.set(uiId, meta);

    modules.push({
      id: uiId,
      descriptorId,
      label: entry.name || typeInfo?.displayName || entry.typeName,
      parameters,
      position: { x: 50 + col * COL_WIDTH, y: 50 + row * ROW_HEIGHT },
    });
  }

  // Store metadata globally for ModulePanel access
  _controlMetaMap = controlMeta;

  let connIdx = 0;
  for (const entry of graph) {
    for (const destId of entry.outputs) {
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

  return { modules, connections, polyphony: 1, viewMode: 'canvas', backend: 'sunvox' };
}
