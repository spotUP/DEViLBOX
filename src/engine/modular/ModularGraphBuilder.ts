/**
 * ModularGraphBuilder - Constructs and validates modular signal graphs
 *
 * Handles:
 * - Topological sorting for correct connection order
 * - Audio vs CV routing (node→node vs node→param)
 * - Type validation (audio to audio, CV to CV/gate/trigger)
 * - Cycle detection in audio path
 */

import type { ModularConnection, SignalType } from '../../types/modular';
import type { ModularVoice } from './ModularVoice';

export class ModularGraphBuilder {
  constructor() {
    // No context needed - connections are made directly on voice nodes
  }

  /**
   * Build connections for a set of voices
   */
  buildConnections(voices: ModularVoice[], connections: ModularConnection[]): void {
    // Sort connections topologically to ensure correct order
    const sorted = this.topologicalSort(connections);

    // Apply connections to each voice
    voices.forEach((voice) => {
      sorted.forEach((conn) => {
        this.createConnection(voice, conn);
      });
    });
  }

  /**
   * Create a single connection in a voice
   */
  private createConnection(voice: ModularVoice, connection: ModularConnection): void {
    const sourceModule = voice.getModule(connection.source.moduleId);
    const targetModule = voice.getModule(connection.target.moduleId);

    if (!sourceModule || !targetModule) {
      // Silently skip - modules may not be created yet during initialization
      return;
    }

    const sourcePort = sourceModule.ports.get(connection.source.portId);
    const targetPort = targetModule.ports.get(connection.target.portId);

    if (!sourcePort || !targetPort) {
      console.warn(`[GraphBuilder] Missing ports for connection: ${connection.id}`);
      return;
    }

    // Validate signal types
    if (!this.areTypesCompatible(sourcePort.signal, targetPort.signal)) {
      console.warn(
        `[GraphBuilder] Incompatible signal types: ${sourcePort.signal} → ${targetPort.signal}`
      );
      return;
    }

    // Route based on signal type
    if (sourcePort.signal === 'audio' && targetPort.signal === 'audio') {
      // Audio → Audio: direct node connection
      if (sourcePort.node && targetPort.node) {
        sourcePort.node.connect(targetPort.node);
      }
    } else {
      // CV/Gate/Trigger → AudioParam: connect via scaleNode
      if (sourcePort.node && targetPort.param && targetPort.scaleNode) {
        sourcePort.node.connect(targetPort.scaleNode);
        targetPort.scaleNode.connect(targetPort.param);
      }
    }
  }

  /**
   * Check if two signal types are compatible for connection
   */
  private areTypesCompatible(source: SignalType, target: SignalType): boolean {
    // Audio can only connect to audio
    if (source === 'audio') {
      return target === 'audio';
    }

    // CV/gate/trigger can connect to CV inputs
    if (target === 'cv') {
      return true; // CV inputs accept any control signal
    }

    // Gate can connect to gate
    if (source === 'gate' && target === 'gate') {
      return true;
    }

    // Trigger can connect to trigger
    if (source === 'trigger' && target === 'trigger') {
      return true;
    }

    return false;
  }

  /**
   * Topological sort of connections (Kahn's algorithm)
   * Ensures dependencies are resolved in correct order
   */
  /**
   * Topological sort of connections using Kahn's algorithm.
   * Ensures source modules are connected before their targets,
   * preserving correct Web Audio graph build order.
   */
  private topologicalSort(connections: ModularConnection[]): ModularConnection[] {
    if (connections.length === 0) return [];

    // Build a set of unique module IDs and an adjacency list (source → targets)
    const allModules = new Set<string>();
    const outEdges = new Map<string, string[]>(); // moduleId → [dependentModuleId, ...]
    const inDegree = new Map<string, number>();

    for (const conn of connections) {
      const src = conn.source.moduleId;
      const tgt = conn.target.moduleId;
      allModules.add(src);
      allModules.add(tgt);
      if (!outEdges.has(src)) outEdges.set(src, []);
      outEdges.get(src)!.push(tgt);
      inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1);
    }

    // Initialize queue with all modules that have no incoming edges
    const queue: string[] = [];
    for (const mod of allModules) {
      if ((inDegree.get(mod) ?? 0) === 0) {
        queue.push(mod);
      }
    }

    // Kahn's algorithm: process queue to build topological order
    const order: string[] = [];
    while (queue.length > 0) {
      const mod = queue.shift()!;
      order.push(mod);
      for (const dep of (outEdges.get(mod) ?? [])) {
        const remaining = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, remaining);
        if (remaining === 0) {
          queue.push(dep);
        }
      }
    }

    // If order doesn't include all modules, there's a cycle — fall back to original order
    if (order.length < allModules.size) {
      return [...connections];
    }

    // Sort connections so that source comes before target in topological order
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...connections].sort(
      (a, b) => (rank.get(a.source.moduleId) ?? 0) - (rank.get(b.source.moduleId) ?? 0)
    );
  }

  /**
   * Detect cycles in the audio path.
   * Returns true if there is a cycle in the connection graph.
   * Uses DFS cycle detection across all connections.
   * (Note: ModularConnection does not carry signal type, so all connections are checked.)
   */
  detectAudioCycles(connections: ModularConnection[]): boolean {
    // Build adjacency list for all connections
    const adjacency = new Map<string, string[]>();
    for (const conn of connections) {
      const src = conn.source.moduleId;
      const tgt = conn.target.moduleId;
      if (!adjacency.has(src)) adjacency.set(src, []);
      adjacency.get(src)!.push(tgt);
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function hasCycle(moduleId: string): boolean {
      if (inStack.has(moduleId)) return true;
      if (visited.has(moduleId)) return false;
      visited.add(moduleId);
      inStack.add(moduleId);
      for (const neighbor of (adjacency.get(moduleId) ?? [])) {
        if (hasCycle(neighbor)) return true;
      }
      inStack.delete(moduleId);
      return false;
    }

    for (const moduleId of adjacency.keys()) {
      if (!visited.has(moduleId) && hasCycle(moduleId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Disconnect a connection
   */
  disconnectConnection(voice: ModularVoice, connection: ModularConnection): void {
    const sourceModule = voice.getModule(connection.source.moduleId);
    const targetModule = voice.getModule(connection.target.moduleId);

    if (!sourceModule || !targetModule) return;

    const sourcePort = sourceModule.ports.get(connection.source.portId);
    const targetPort = targetModule.ports.get(connection.target.portId);

    if (!sourcePort || !targetPort) return;

    if (sourcePort.node && targetPort.node) {
      try {
        sourcePort.node.disconnect(targetPort.node);
      } catch (e) {
        // Already disconnected
      }
    }

    if (sourcePort.node && targetPort.scaleNode) {
      try {
        sourcePort.node.disconnect(targetPort.scaleNode);
      } catch (e) {
        // Already disconnected
      }
    }
  }
}
