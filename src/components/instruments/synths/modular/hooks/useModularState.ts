/**
 * useModularState - UI state management for modular synth editor
 *
 * Manages selection, wiring, and interaction state for the patch editor.
 */

import { useState, useCallback } from 'react';
import type { PortRef } from '../../../../../types/modular';

export interface ModularUIState {
  selectedModuleId: string | null;
  hoveredPortId: string | null;
  wiringSource: PortRef | null;
  wiringPreview: { x: number; y: number } | null;
  selectedConnectionId: string | null;
}

export const useModularState = () => {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);
  const [wiringSource, setWiringSource] = useState<PortRef | null>(null);
  const [wiringPreview, setWiringPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const startWiring = useCallback((portRef: PortRef) => {
    setWiringSource(portRef);
    setWiringPreview(null);
  }, []);

  const updateWiringPreview = useCallback((x: number, y: number) => {
    setWiringPreview({ x, y });
  }, []);

  const endWiring = useCallback(() => {
    setWiringSource(null);
    setWiringPreview(null);
  }, []);

  const selectModule = useCallback((moduleId: string | null) => {
    setSelectedModuleId(moduleId);
  }, []);

  const selectConnection = useCallback((connectionId: string | null) => {
    setSelectedConnectionId(connectionId);
  }, []);

  const hoverPort = useCallback((portId: string | null) => {
    setHoveredPortId(portId);
  }, []);

  return {
    // State
    selectedModuleId,
    hoveredPortId,
    wiringSource,
    wiringPreview,
    selectedConnectionId,

    // Actions
    startWiring,
    updateWiringPreview,
    endWiring,
    selectModule,
    selectConnection,
    hoverPort,
  };
};
