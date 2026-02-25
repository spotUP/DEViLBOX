/**
 * ModularCanvasView - Free-form 2D canvas layout
 *
 * Features:
 * - Pan/zoom camera with mouse wheel and middle-button drag
 * - Freely positioned modules (drag to move)
 * - SVG patch cables
 * - Grid background
 * - Keyboard shortcuts (Escape, Delete, F to fit all)
 */

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import type { ModularPatchConfig, PortRef, ModularConnection } from '../../../../../types/modular';
import { ModulePanel } from '../widgets/ModulePanel';
import { PatchCable } from '../widgets/PatchCable';
import { CanvasGrid } from './CanvasGrid';
import { CanvasCamera } from './CanvasCamera';
import { usePortPositions } from '../hooks/usePortPositions';
import { useModularState } from '../hooks/useModularState';
import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';

interface ModularCanvasViewProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
}

export const ModularCanvasView: React.FC<ModularCanvasViewProps> = ({ config, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(new CanvasCamera(config.camera));
  const [cameraState, setCameraState] = useState(cameraRef.current.getState());
  const [isPanning, setIsPanning] = useState(false);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);

  const { positions, registerPort, recalculateAll } = usePortPositions(containerRef);
  const {
    selectedModuleId,
    hoveredPortId,
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

  // Sync camera when config.camera changes from outside (e.g. preset load)
  useEffect(() => {
    if (config.camera) {
      cameraRef.current.setState(config.camera);
      setCameraState(cameraRef.current.getState());
    } else {
      // If no camera state exists, fit all modules to view automatically on mount
      const timer = setTimeout(() => {
        if (containerRef.current && config.modules.length > 0) {
          const rect = containerRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            cameraRef.current.fitToView(config.modules, rect.width, rect.height);
            setCameraState(cameraRef.current.getState());
          }
        }
      }, 100); // Small delay to ensure container is measured correctly
      return () => clearTimeout(timer);
    }
  }, [config.camera]); // Removed config.modules dependency to avoid fitting on every change

  // Update camera state in config when it changes locally
  useEffect(() => {
    const newCamera = cameraRef.current.getState();
    if (
      newCamera.x !== config.camera?.x ||
      newCamera.y !== config.camera?.y ||
      newCamera.zoom !== config.camera?.zoom
    ) {
      onChange({
        ...config,
        camera: newCamera,
      });
    }
  }, [cameraState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to convert screen-space container coords to world coords for cables
  const screenToWorld = useCallback((x: number, y: number) => {
    return cameraRef.current.screenToWorld(x + (containerRef.current?.getBoundingClientRect().left || 0), y + (containerRef.current?.getBoundingClientRect().top || 0));
  }, []);

  // Pan with middle mouse button or space+drag
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        // Middle button or Shift+Left
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        cameraRef.current.pan(e.movementX, e.movementY);
        setCameraState(cameraRef.current.getState());
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  // Zoom and Pan with mouse wheel
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!containerRef.current) return;

      e.preventDefault();
      
      // Ctrl/Cmd + Wheel = Zoom
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.001;
        cameraRef.current.zoomAt(e.clientX, e.clientY, delta);
      } 
      // Regular Wheel = Pan
      else {
        // Shift + Wheel = Horizontal Pan
        if (e.shiftKey) {
          cameraRef.current.pan(-e.deltaY, 0);
        } else {
          // Standard: deltaY for vertical, deltaX for horizontal (trackpads)
          cameraRef.current.pan(-e.deltaX, -e.deltaY);
        }
      }
      
      setCameraState(cameraRef.current.getState());
    };

    const container = containerRef.current;
    container?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container?.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    // Only trigger if clicking directly on the background or grid
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'rect') {
      if (e.button === 0) { // Left click on background
        setIsPanning(true);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
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
      if (e.key === 'f' || e.key === 'F') {
        handleFitToView();
      }
      if (e.key === '0') {
        cameraRef.current.reset();
        setCameraState(cameraRef.current.getState());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConnectionId, endWiring, selectConnection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse move for wiring preview
  useEffect(() => {
    if (!wiringSource) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      updateWiringPreview(relativeX, relativeY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [wiringSource, updateWiringPreview]);

  // Port click (start or complete wiring)
  const handlePortClick = useCallback(
    (portRef: PortRef) => {
      if (!wiringSource) {
        startWiring(portRef);
      } else {
        const sourcePort = `${wiringSource.moduleId}.${wiringSource.portId}`;
        const targetPort = `${portRef.moduleId}.${portRef.portId}`;

        if (sourcePort === targetPort) {
          endWiring();
          return;
        }

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

  // Module parameter change
  const handleParameterChange = useCallback(
    (moduleId: string, paramId: string, value: number) => {
      const updatedModules = config.modules.map((m) =>
        m.id === moduleId ? { ...m, parameters: { ...m.parameters, [paramId]: value } } : m
      );

      onChange({ ...config, modules: updatedModules });
    },
    [config, onChange]
  );

  // Module delete
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

  // Module drag
  const handleModuleDragStart = useCallback((moduleId: string, _startX: number, _startY: number) => {
    setDraggedModuleId(moduleId);
  }, []);

  const handleModuleDrag = useCallback(
    (dx: number, dy: number) => {
      if (!draggedModuleId) return;

      const updatedModules = config.modules.map((m) =>
        m.id === draggedModuleId
          ? {
              ...m,
              position: {
                x: (m.position?.x || 0) + dx,
                y: (m.position?.y || 0) + dy,
              },
            }
          : m
      );

      onChange({ ...config, modules: updatedModules });
      recalculateAll();
    },
    [draggedModuleId, config, onChange, recalculateAll]
  );

  const handleModuleDragEnd = useCallback(() => {
    setDraggedModuleId(null);
  }, []);

  // Connection delete
  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      selectConnection(connectionId);
    },
    [selectConnection]
  );

  const handleConnectionDelete = useCallback((id?: string) => {
    const connId = id || selectedConnectionId;
    if (connId) {
      const updatedConnections = config.connections.filter((c) => c.id !== connId);
      onChange({ ...config, connections: updatedConnections });
      if (selectedConnectionId === connId) selectConnection(null);
    }
  }, [selectedConnectionId, config, onChange, selectConnection]);

  // View control handlers
  const handleZoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    cameraRef.current.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.2);
    setCameraState(cameraRef.current.getState());
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    cameraRef.current.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, -0.2);
    setCameraState(cameraRef.current.getState());
  }, []);

  const handleResetView = useCallback(() => {
    cameraRef.current.reset();
    setCameraState(cameraRef.current.getState());
  }, []);

  // Fit to view
  const handleFitToView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    cameraRef.current.fitToView(config.modules, rect.width, rect.height);
    setCameraState(cameraRef.current.getState());
  }, [config.modules]);

  // Helper functions
  const getPortId = (portRef: PortRef) => `${portRef.moduleId}.${portRef.portId}`;
  
  // Calculate module bounding boxes for obstacle avoidance
  const moduleObstacles = useMemo(() => {
    return config.modules.map(m => ({
      x: m.position?.x || 0,
      y: m.position?.y || 0,
      w: m.collapsed ? 120 : 180, // Matches ModulePanel widths
      h: 200 // Approximate height (dynamic calculation would be better but this is a safe avg)
    }));
  }, [config.modules]);

  const isConnected = (portRef: PortRef) =>
    config.connections.some(
      (c) => getPortId(c.source) === getPortId(portRef) || getPortId(c.target) === getPortId(portRef)
    );
  const isWiringSource = (portRef: PortRef) =>
    wiringSource ? getPortId(wiringSource) === getPortId(portRef) : false;
  const isPortHovered = (portRef: PortRef) =>
    hoveredPortId !== null && getPortId(hoveredPortId) === getPortId(portRef);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-dark-bg overflow-hidden"
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      onMouseDown={handleBackgroundMouseDown}
    >
      {/* Background grid */}
      <CanvasGrid zoom={cameraState.zoom} offsetX={cameraState.x} offsetY={cameraState.y} />

      {/* Transformed canvas layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: cameraRef.current.getCSSTransform(),
          transformOrigin: 'top left',
        }}
      >
        {/* SVG layer for cables (Rendered BEFORE modules so they appear behind) */}
        <svg className="absolute inset-0 pointer-events-auto z-0" style={{ width: '100%', height: '100%' }}>
          {/* Existing connections */}
          {config.connections.map((conn, idx) => {
            const sourcePosRaw = positions.get(getPortId(conn.source));
            const targetPosRaw = positions.get(getPortId(conn.target));

            if (!sourcePosRaw || !targetPosRaw) return null;

            const sourcePos = screenToWorld(sourcePosRaw.x, sourcePosRaw.y);
            const targetPos = screenToWorld(targetPosRaw.x, targetPosRaw.y);

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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConnectionDelete(conn.id);
                }}
                obstacles={moduleObstacles}
                laneOffset={idx % 8} // Spreads cables into 8 distinct lanes
              />
            );
          })}

          {/* Wiring preview */}
          {wiringSource && wiringPreview && positions.get(getPortId(wiringSource)) && (
            (() => {
              const sourcePosRaw = positions.get(getPortId(wiringSource))!;
              const sourcePos = screenToWorld(sourcePosRaw.x, sourcePosRaw.y);
              const targetPos = screenToWorld(wiringPreview.x, wiringPreview.y);
              
              return (
                <PatchCable
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  obstacles={moduleObstacles}
                />
              );
            })()
          )}
        </svg>

        {/* Module panels layer */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {config.modules.map((module) => (
            <ModulePanel
              key={module.id}
              module={module}
              isSelected={module.id === selectedModuleId}
              zoom={cameraState.zoom}
              isConnected={isConnected}
              isWiringSource={isWiringSource}
              isPortHovered={isPortHovered}
              onModuleClick={selectModule}
              onModuleDelete={handleModuleDelete}
              onModuleDragStart={handleModuleDragStart}
              onModuleDrag={handleModuleDrag}
              onModuleDragEnd={handleModuleDragEnd}
              onPortClick={handlePortClick}
              onPortHover={hoverPort}
              onParameterChange={handleParameterChange}
              registerPortPosition={registerPort}
            />
          ))}
        </div>
      </div>

      {/* Empty state */}
      {config.modules.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted pointer-events-none">
          <div className="text-center">
            <p className="text-sm">No modules yet. Click "Add Module" to get started.</p>
            <p className="text-xs mt-2 opacity-50">
              Middle-click to pan • Scroll to zoom • F to fit all
            </p>
          </div>
        </div>
      )}

      {/* Zoom and view controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-dark-bgSecondary/90 backdrop-blur-md border border-dark-border p-1 rounded-lg shadow-xl z-50">
        <div className="px-2 text-[10px] font-mono text-text-secondary border-r border-dark-border mr-1">
          {Math.round(cameraState.zoom * 100)}%
        </div>
        
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-dark-bgHover rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-dark-bgHover rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        
        <div className="w-px h-4 bg-dark-border mx-1" />
        
        <button
          onClick={handleFitToView}
          className="p-1.5 hover:bg-dark-bgHover rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Fit All Modules (F)"
        >
          <Maximize size={16} />
        </button>

        <button
          onClick={handleResetView}
          className="p-1.5 hover:bg-dark-bgHover rounded text-text-secondary hover:text-text-primary transition-colors"
          title="Reset View (0)"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
};
