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
  private topologicalSort(connections: ModularConnection[]): ModularConnection[] {
    // For now, return connections as-is
    // TODO: Implement full topological sort if needed for complex patches
    return [...connections];
  }

  /**
   * Detect cycles in the audio path
   * (CV cycles are allowed and useful for feedback)
   */
  detectAudioCycles(_connections: ModularConnection[]): boolean {
    // TODO: Implement cycle detection for audio paths
    // This is important for stability
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
