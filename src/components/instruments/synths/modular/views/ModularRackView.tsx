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
import { ModuleRegistry } from '../../../../../engine/modular/ModuleRegistry';

interface ModularRackViewProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
}

export const ModularRackView: React.FC<ModularRackViewProps> = ({ config, onChange }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const configRef = React.useRef(config);

  // Keep ref in sync with props
  React.useEffect(() => {
    configRef.current = config;
  }, [config]);

  const { positions, registerPort, recalculateAll } = usePortPositions(containerRef);
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

      onChange({ ...configRef.current, modules: reordered });
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
          ...configRef.current,
          connections: [...configRef.current.connections, newConnection],
        });

        endWiring();
      }
    },
    [wiringSource, startWiring, endWiring, onChange, config]
  );

  // Handle module parameter change
  // Uses configRef to avoid stale state issues with rapid knob changes
  const handleParameterChange = useCallback(
    (moduleId: string, paramId: string, value: number) => {
      const updatedModules = configRef.current.modules.map((m) =>
        m.id === moduleId
          ? { ...m, parameters: { ...m.parameters, [paramId]: value } }
          : m
      );

      onChange({ ...configRef.current, modules: updatedModules });
    },
    [onChange]
  );

  // Handle module delete
  const handleModuleDelete = useCallback(
    (moduleId: string) => {
      const updatedModules = configRef.current.modules.filter((m) => m.id !== moduleId);
      const updatedConnections = configRef.current.connections.filter(
        (c) => c.source.moduleId !== moduleId && c.target.moduleId !== moduleId
      );

      onChange({ ...configRef.current, modules: updatedModules, connections: updatedConnections });
    },
    [onChange]
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
      const updatedConnections = configRef.current.connections.filter((c) => c.id !== selectedConnectionId);
      onChange({ ...configRef.current, connections: updatedConnections });
      selectConnection(null);
    }
  }, [selectedConnectionId, onChange, selectConnection]);

  // Recalculate positions on scroll
  React.useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      recalculateAll();
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [recalculateAll]);

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
    if (!wiringSource || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Convert mouse position to container-relative coordinates
      const containerRect = containerRef.current!.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const relativeY = e.clientY - containerRect.top;
      updateWiringPreview(relativeX, relativeY);
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

  // Calculate lane offsets for cable spreading
  const calculateLaneOffsets = useCallback((): Map<string, number> => {
    const laneMap = new Map<string, number>();

    // Helper to check if two Y ranges overlap
    const rangesOverlap = (y1Min: number, y1Max: number, y2Min: number, y2Max: number) => {
      return y1Min <= y2Max && y2Min <= y1Max;
    };

    // Build cable info with Y ranges
    interface CableInfo {
      conn: ModularConnection;
      yMin: number;
      yMax: number;
      side: 'left' | 'right';
    }

    const cableInfos: CableInfo[] = [];

    configRef.current.connections.forEach((conn) => {
      const sourcePos = positions.get(getPortId(conn.source));
      const targetPos = positions.get(getPortId(conn.target));

      if (!sourcePos || !targetPos) return;

      const yMin = Math.min(sourcePos.y, targetPos.y);
      const yMax = Math.max(sourcePos.y, targetPos.y);

      // Determine which side the vertical segment is on (left or right)
      const side = sourcePos.x > targetPos.x ? 'right' : 'left';

      cableInfos.push({ conn, yMin, yMax, side });
    });

    // Group cables that overlap vertically on the same side
    const bundles: CableInfo[][] = [];

    cableInfos.forEach((cable) => {
      // Find all bundles that this cable overlaps with
      const overlappingBundles: number[] = [];

      bundles.forEach((bundle, index) => {
        // Check if cable overlaps with any cable in the bundle and is on the same side
        const overlaps = bundle.some(
          (other) =>
            other.side === cable.side &&
            rangesOverlap(cable.yMin, cable.yMax, other.yMin, other.yMax)
        );

        if (overlaps && bundle[0].side === cable.side) {
          overlappingBundles.push(index);
        }
      });

      if (overlappingBundles.length === 0) {
        // Create new bundle
        bundles.push([cable]);
      } else if (overlappingBundles.length === 1) {
        // Add to existing bundle
        bundles[overlappingBundles[0]].push(cable);
      } else {
        // Merge multiple bundles that this cable connects
        const mergedBundle: CableInfo[] = [cable];

        // Collect all cables from overlapping bundles (in reverse to safely remove)
        for (let i = overlappingBundles.length - 1; i >= 0; i--) {
          const bundleIndex = overlappingBundles[i];
          mergedBundle.push(...bundles[bundleIndex]);
          bundles.splice(bundleIndex, 1);
        }

        bundles.push(mergedBundle);
      }
    });

    // Assign lane offsets within each bundle
    bundles.forEach((bundle) => {
      const numCables = bundle.length;
      bundle.forEach((cable, index) => {
        // Center the cable bundle by offsetting from -(n-1)/2 to +(n-1)/2
        const laneOffset = index - (numCables - 1) / 2;
        laneMap.set(cable.conn.id, laneOffset);
      });
    });

    return laneMap;
  }, [positions]); // Removed config.connections dependency - uses configRef.current instead

  const laneOffsets = calculateLaneOffsets();

  return (
    <div ref={containerRef} className="relative flex flex-col h-full bg-surface-primary overflow-hidden">
      {/* SVG overlay for cables */}
      <svg className="absolute inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
        {/* Existing connections */}
        {config.connections.map((conn) => {
          const sourcePos = positions.get(getPortId(conn.source));
          const targetPos = positions.get(getPortId(conn.target));

          if (!sourcePos || !targetPos) return null;

          const laneOffset = laneOffsets.get(conn.id) || 0;

          // Determine signal type from source port
          const sourceModule = configRef.current.modules.find((m) => m.id === conn.source.moduleId);
          const sourceDescriptor = sourceModule
            ? ModuleRegistry.get(sourceModule.descriptorId)
            : null;
          const sourcePort = sourceDescriptor?.ports.find((p) => p.id === conn.source.portId);
          const signalType = sourcePort?.signal || 'audio';

          return (
            <PatchCable
              key={conn.id}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              color={conn.color}
              signal={signalType}
              isSelected={conn.id === selectedConnectionId}
              onClick={() => handleConnectionClick(conn.id)}
              laneOffset={laneOffset}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={config.modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-12 px-20 max-w-5xl mx-auto">
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
