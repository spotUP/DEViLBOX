/**
 * graphToConfig — Converts a SunVox module graph (from WASM) to ModularPatchConfig(s).
 *
 * Two modes:
 * 1. sunvoxGraphToConfig(graph) — full graph for the "master" modular view
 * 2. sunvoxSubGraphForGenerator(graph, generatorId) — sub-graph showing only
 *    modules in the signal path from a specific generator to Output
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

/** Build a ModularModuleInstance + control metadata from a graph entry */
function buildModule(entry: SunVoxModuleGraphEntry, x: number, y: number): {
  module: ModularModuleInstance;
  meta: SunVoxControlMeta[];
} {
  const typeInfo = SUNVOX_MODULE_TYPE_MAP.get(entry.typeName);
  const descriptorId = `sv_${entry.typeName.replace(/\s+/g, '_').toLowerCase()}`;
  const uiId = `sv_m${entry.id}`;

  const parameters: Record<string, number> = {};
  const meta: SunVoxControlMeta[] = [];
  for (let c = 0; c < entry.controls.length; c++) {
    const ctl = entry.controls[c];
    parameters[`ctl_${c}`] = ctl.value;
    meta.push({ id: c, name: ctl.name, min: ctl.min, max: ctl.max });
  }

  return {
    module: {
      id: uiId,
      descriptorId,
      label: entry.name || typeInfo?.displayName || entry.typeName,
      parameters,
      position: { x, y },
    },
    meta,
  };
}

/** Build connections from a set of graph entries */
function buildConnections(
  graph: SunVoxModuleGraphEntry[],
  includedIds: Set<number>,
): ModularConnection[] {
  const connections: ModularConnection[] = [];
  let connIdx = 0;
  for (const entry of graph) {
    if (!includedIds.has(entry.id)) continue;
    for (const destId of entry.outputs) {
      if (!includedIds.has(destId)) continue;
      connections.push({
        id: `c_${connIdx++}`,
        source: { moduleId: `sv_m${entry.id}`, portId: 'output' },
        target: { moduleId: `sv_m${destId}`, portId: 'input' },
        amount: 1,
      });
    }
  }
  return connections;
}

/**
 * Full graph → ModularPatchConfig (all modules).
 */
export function sunvoxGraphToConfig(graph: SunVoxModuleGraphEntry[]): ModularPatchConfig {
  const modules: ModularModuleInstance[] = [];
  const controlMeta = new Map<string, SunVoxControlMeta[]>();
  const COL_WIDTH = 220;
  const ROW_HEIGHT = 150;
  const COLS = 4;

  for (let i = 0; i < graph.length; i++) {
    const { module, meta } = buildModule(graph[i], 50 + (i % COLS) * COL_WIDTH, 50 + Math.floor(i / COLS) * ROW_HEIGHT);
    modules.push(module);
    controlMeta.set(module.id, meta);
  }

  _controlMetaMap = controlMeta;

  const allIds = new Set(graph.map(e => e.id));
  const connections = buildConnections(graph, allIds);

  return { modules, connections, polyphony: 1, viewMode: 'canvas', backend: 'sunvox' };
}

/**
 * Extract the sub-graph reachable downstream from a generator module toward Output (id=0).
 * Follows the output connections from the generator, collecting all modules in the chain.
 */
export function sunvoxSubGraphForGenerator(
  graph: SunVoxModuleGraphEntry[],
  generatorId: number,
): ModularPatchConfig {
  const graphMap = new Map(graph.map(e => [e.id, e]));

  // BFS from generator following outputs
  const visited = new Set<number>();
  const queue = [generatorId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const entry = graphMap.get(id);
    if (entry) {
      for (const outId of entry.outputs) {
        if (!visited.has(outId)) queue.push(outId);
      }
    }
  }

  // Always include Output (id=0)
  visited.add(0);

  // Build modules in chain order, laid out left-to-right
  const controlMeta = new Map<string, SunVoxControlMeta[]>();
  const modules: ModularModuleInstance[] = [];
  const orderedIds = [generatorId, ...Array.from(visited).filter(id => id !== generatorId && id !== 0), 0];

  for (let i = 0; i < orderedIds.length; i++) {
    const entry = graphMap.get(orderedIds[i]);
    if (!entry) continue;
    const { module, meta } = buildModule(entry, 50 + i * 200, 80);
    modules.push(module);
    controlMeta.set(module.id, meta);
  }

  // Merge into global meta map (additive)
  for (const [k, v] of controlMeta) {
    _controlMetaMap.set(k, v);
  }

  const connections = buildConnections(graph, visited);

  return { modules, connections, polyphony: 1, viewMode: 'canvas', backend: 'sunvox' };
}

/**
 * Identify all generator module IDs in the graph.
 */
export function findGeneratorModules(graph: SunVoxModuleGraphEntry[]): Array<{ id: number; name: string }> {
  const generators: Array<{ id: number; name: string }> = [];
  for (const entry of graph) {
    if (entry.id === 0) continue; // Skip Output
    const typeInfo = SUNVOX_MODULE_TYPE_MAP.get(entry.typeName);
    if (typeInfo?.isGenerator) {
      generators.push({ id: entry.id, name: entry.name || typeInfo.displayName });
    }
  }
  return generators;
}
