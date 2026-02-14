/**
 * ModularRackView - Rack layout view
 *
 * Displays modules as vertical list of horizontal strips with drag reordering.
 * Renders patch cables as SVG overlay.
 */

import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ModularPatchConfig, PortRef, ModularConnection } from '../../../../../types/modular';
import { RackStrip } from '../widgets/RackStrip';
import { PatchCable } from '../widgets/PatchCable';
import { usePortPositions } from '../hooks/usePortPositions';
import { useModularState } from '../hooks/useModularState';

interface ModularRackViewProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
}

export const ModularRackView: React.FC<ModularRackViewProps> = ({ config, onChange }) => {
  const { positions, registerPort, recalculateAll } = usePortPositions();
  const {
    selectedModuleId,
    wiringSource,
    wiringPreview,
    selectedConnectionId,
    startWiring,
    updateWiringPreview,
    endWiring,
    selectModule,
    selectConnection,
    hoverPort,
  } = useModularState();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle module reorder
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = config.modules.findIndex((m) => m.id === active.id);
      const newIndex = config.modules.findIndex((m) => m.id === over.id);

      const reordered = arrayMove(config.modules, oldIndex, newIndex).map((m, idx) => ({
        ...m,
        rackSlot: idx,
      }));

      onChange({ ...config, modules: reordered });
      recalculateAll();
    }
  };

  // Handle port click (start or complete wiring)
  const handlePortClick = useCallback(
    (portRef: PortRef) => {
      if (!wiringSource) {
        // Start wiring
        startWiring(portRef);
      } else {
        // Complete wiring
        const sourcePort = `${wiringSource.moduleId}.${wiringSource.portId}`;
        const targetPort = `${portRef.moduleId}.${portRef.portId}`;

        // Don't connect to self
        if (sourcePort === targetPort) {
          endWiring();
          return;
        }

        // Create new connection
        const newConnection: ModularConnection = {
          id: `conn_${Date.now()}`,
          source: wiringSource,
          target: portRef,
          amount: 1,
        };

        onChange({
          ...config,
          connections: [...config.connections, newConnection],
        });

        endWiring();
      }
    },
    [wiringSource, startWiring, endWiring, onChange, config]
  );

  // Handle module parameter change
  const handleParameterChange = useCallback(
    (moduleId: string, paramId: string, value: number) => {
      const updatedModules = config.modules.map((m) =>
        m.id === moduleId
          ? { ...m, parameters: { ...m.parameters, [paramId]: value } }
          : m
      );

      onChange({ ...config, modules: updatedModules });
    },
    [config, onChange]
  );

  // Handle module delete
  const handleModuleDelete = useCallback(
    (moduleId: string) => {
      const updatedModules = config.modules.filter((m) => m.id !== moduleId);
      const updatedConnections = config.connections.filter(
        (c) => c.source.moduleId !== moduleId && c.target.moduleId !== moduleId
      );

      onChange({ ...config, modules: updatedModules, connections: updatedConnections });
    },
    [config, onChange]
  );

  // Handle connection delete
  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      selectConnection(connectionId);
    },
    [selectConnection]
  );

  const handleConnectionDelete = useCallback(() => {
    if (selectedConnectionId) {
      const updatedConnections = config.connections.filter((c) => c.id !== selectedConnectionId);
      onChange({ ...config, connections: updatedConnections });
      selectConnection(null);
    }
  }, [selectedConnectionId, config, onChange, selectConnection]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnectionId) {
          handleConnectionDelete();
        }
      }
      if (e.key === 'Escape') {
        endWiring();
        selectConnection(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConnectionId, handleConnectionDelete, endWiring, selectConnection]);

  // Mouse move for wiring preview
  React.useEffect(() => {
    if (!wiringSource) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateWiringPreview(e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [wiringSource, updateWiringPreview]);

  // Helper functions
  const getPortId = (portRef: PortRef) => `${portRef.moduleId}.${portRef.portId}`;
  const isConnected = (portRef: PortRef) =>
    config.connections.some(
      (c) => getPortId(c.source) === getPortId(portRef) || getPortId(c.target) === getPortId(portRef)
    );
  const isWiringSource = (portRef: PortRef) =>
    wiringSource ? getPortId(wiringSource) === getPortId(portRef) : false;

  return (
    <div className="relative flex flex-col h-full bg-surface-primary overflow-hidden">
      {/* SVG overlay for cables */}
      <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
        {/* Existing connections */}
        {config.connections.map((conn) => {
          const sourcePos = positions.get(getPortId(conn.source));
          const targetPos = positions.get(getPortId(conn.target));

          if (!sourcePos || !targetPos) return null;

          return (
            <PatchCable
              key={conn.id}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              color={conn.color}
              isSelected={conn.id === selectedConnectionId}
              onClick={() => handleConnectionClick(conn.id)}
            />
          );
        })}

        {/* Wiring preview */}
        {wiringSource && wiringPreview && positions.get(getPortId(wiringSource)) && (
          <PatchCable
            x1={positions.get(getPortId(wiringSource))!.x}
            y1={positions.get(getPortId(wiringSource))!.y}
            x2={wiringPreview.x}
            y2={wiringPreview.y}
          />
        )}
      </svg>

      {/* Module rack */}
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={config.modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {config.modules.map((module) => (
                <RackStrip
                  key={module.id}
                  module={module}
                  isSelected={module.id === selectedModuleId}
                  isConnected={isConnected}
                  isWiringSource={isWiringSource}
                  onModuleClick={selectModule}
                  onModuleDelete={handleModuleDelete}
                  onPortClick={handlePortClick}
                  onPortHover={hoverPort}
                  onParameterChange={handleParameterChange}
                  registerPortPosition={registerPort}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Empty state */}
        {config.modules.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            <p className="text-sm">No modules yet. Click "Add Module" to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};
