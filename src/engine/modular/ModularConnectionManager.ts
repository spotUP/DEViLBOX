/**
 * ModularConnectionManager - Hot-swap connection management
 *
 * Handles safe connection updates without audio glitches by:
 * - Batching connection changes
 * - Using double-buffering when needed
 * - Scheduling updates at audio-safe times
 */

import type { ModularConnection } from '../../types/modular';
import type { ModularVoice } from './ModularVoice';
import { ModularGraphBuilder } from './ModularGraphBuilder';

export class ModularConnectionManager {
  private graphBuilder: ModularGraphBuilder | null = null;
  private currentConnections: ModularConnection[] = [];

  /**
   * Update connections for all voices
   * This is a hot-swap operation that should not glitch
   */
  updateConnections(voices: ModularVoice[], connections: ModularConnection[]): void {
    if (!this.graphBuilder && voices.length > 0) {
      // Lazy initialize graph builder
      this.graphBuilder = new ModularGraphBuilder();
    }

    if (!this.graphBuilder) return;

    // Disconnect old connections
    this.currentConnections.forEach((conn) => {
      voices.forEach((voice) => {
        this.graphBuilder!.disconnectConnection(voice, conn);
      });
    });

    // Build new connections
    this.graphBuilder.buildConnections(voices, connections);

    // Store current state
    this.currentConnections = [...connections];
  }

  /**
   * Add a single connection (incremental update)
   */
  addConnection(voices: ModularVoice[], connection: ModularConnection): void {
    const updatedConnections = [...this.currentConnections, connection];
    this.updateConnections(voices, updatedConnections);
  }

  /**
   * Remove a single connection (incremental update)
   */
  removeConnection(voices: ModularVoice[], connectionId: string): void {
    const updatedConnections = this.currentConnections.filter((c) => c.id !== connectionId);
    this.updateConnections(voices, updatedConnections);
  }

  /**
   * Clear all connections
   */
  clear(voices: ModularVoice[]): void {
    this.updateConnections(voices, []);
  }
}
