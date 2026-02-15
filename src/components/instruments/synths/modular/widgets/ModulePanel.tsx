/**
 * ModulePanel - Draggable module panel for canvas view
 *
 * Vertical layout panel with:
 * - Header (drag handle, name, collapse, delete)
 * - Input ports (top)
 * - Parameter knobs (center)
 * - Output ports (bottom)
 * - Collapsible (shows only header + ports)
 */

import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ModularModuleInstance, PortRef } from '../../../../../types/modular';
import { ModuleRegistry } from '../../../../../engine/modular/ModuleRegistry';
import { JackPort } from './JackPort';
import { Knob } from '../../../../controls/Knob';

interface ModulePanelProps {
  module: ModularModuleInstance;
  isSelected?: boolean;
  zoom: number;
  isConnected?: (portRef: PortRef) => boolean;
  isWiringSource?: (portRef: PortRef) => boolean;
  isPortHovered?: (portRef: PortRef) => boolean;
  onModuleClick: (moduleId: string) => void;
  onModuleDelete: (moduleId: string) => void;
  onModuleDragStart: (moduleId: string, startX: number, startY: number) => void;
  onModuleDrag: (dx: number, dy: number) => void;
  onModuleDragEnd: () => void;
  onPortClick: (portRef: PortRef) => void;
  onPortHover: (portRef: PortRef | null) => void;
  onParameterChange: (moduleId: string, paramId: string, value: number) => void;
  registerPortPosition: (portId: string, element: HTMLElement | null) => void;
}

export const ModulePanel: React.FC<ModulePanelProps> = ({
  module,
  isSelected = false,
  zoom,
  isConnected = () => false,
  isWiringSource = () => false,
  isPortHovered = () => false,
  onModuleClick,
  onModuleDelete,
  onModuleDragStart,
  onModuleDrag,
  onModuleDragEnd,
  onPortClick,
  onPortHover,
  onParameterChange,
  registerPortPosition,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(module.collapsed || false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const descriptor = ModuleRegistry.get(module.descriptorId);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartRef.current) {
        const dx = (e.clientX - dragStartRef.current.x) / zoom;
        const dy = (e.clientY - dragStartRef.current.y) / zoom;
        onModuleDrag(dx, dy);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      onModuleDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, zoom, onModuleDrag, onModuleDragEnd]);

  if (!descriptor) {
    return (
      <div
        className="absolute bg-surface-secondary rounded border border-border p-2"
        style={{
          left: module.position?.x || 0,
          top: module.position?.y || 0,
        }}
      >
        <span className="text-xs text-text-tertiary">Unknown module: {module.descriptorId}</span>
      </div>
    );
  }

  const inputPorts = descriptor.ports.filter((p) => p.direction === 'input');
  const outputPorts = descriptor.ports.filter((p) => p.direction === 'output');

  const handleClick = () => {
    onModuleClick(module.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onModuleDelete(module.id);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCollapsed(!isCollapsed);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left button only
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    onModuleDragStart(module.id, e.clientX, e.clientY);
  };

  return (
    <div
      className={`
        absolute flex flex-col bg-surface-secondary rounded-sm border border-black/50 overflow-hidden
        ${isSelected ? 'ring-2 ring-accent-primary' : ''}
        shadow-xl transition-shadow
        ${isDragging ? 'cursor-grabbing shadow-2xl scale-[1.02] z-50' : 'cursor-default'}
        pointer-events-auto
      `}
      style={{
        left: module.position?.x || 0,
        top: module.position?.y || 0,
        width: isCollapsed ? '120px' : '180px',
        transformOrigin: 'top left',
        background: 'linear-gradient(180deg, #2a2a2e 0%, #202024 100%)',
        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.1), inset -1px -1px 0 rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.5)',
      }}
      onClick={handleClick}
    >
      {/* Faceplate Screw (Visual) */}
      <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-inner opacity-50 pointer-events-none" />
      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-inner opacity-50 pointer-events-none" />
      <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-inner opacity-50 pointer-events-none" />
      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-stone-400 shadow-inner opacity-50 pointer-events-none" />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 border-b border-black/20 cursor-grab active:cursor-grabbing"
        style={{ 
          backgroundColor: descriptor.color || '#374151',
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.1) 100%)'
        }}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-white/50 flex-shrink-0" />

        <button
          onClick={handleToggleCollapse}
          className="p-0.5 hover:bg-black/20 rounded flex-shrink-0 text-white/70 hover:text-white transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <span className="flex-1 text-[10px] font-bold text-white uppercase tracking-wider truncate drop-shadow-md">
          {module.label || descriptor.name}
        </span>

        <button
          onClick={handleDelete}
          className="p-0.5 hover:bg-red-500/80 rounded text-white/50 hover:text-white flex-shrink-0 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Body (collapsible) */}
      {!isCollapsed && (
        <div className="flex flex-col gap-3 p-3 relative">
          {/* Subtle noise texture overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
          />
          
          {/* Input ports */}
          {inputPorts.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-tertiary uppercase">Inputs</span>
              {inputPorts.map((port) => {
                const portRef: PortRef = { moduleId: module.id, portId: port.id };
                return (
                  <JackPort
                    key={port.id}
                    portRef={portRef}
                    name={port.name}
                    direction="input"
                    signal={port.signal}
                    isHovered={isPortHovered(portRef)}
                    isConnected={isConnected(portRef)}
                    isWiringSource={isWiringSource(portRef)}
                    onPortClick={onPortClick}
                    onPortHover={onPortHover}
                    registerPosition={registerPortPosition}
                  />
                );
              })}
            </div>
          )}

          {/* Parameters */}
          {descriptor.parameters.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-text-tertiary uppercase">Parameters</span>
              <div className="grid grid-cols-2 gap-2">
                {descriptor.parameters.map((param) => (
                  <div key={param.id} className="flex flex-col items-center gap-1">
                    <Knob
                      value={module.parameters[param.id] ?? param.default}
                      min={param.min}
                      max={param.max}
                      onChange={(value) => onParameterChange(module.id, param.id, value)}
                      size="sm"
                      label={param.name}
                    />
                    <span className="text-xs text-text-tertiary">
                      {(module.parameters[param.id] ?? param.default).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output ports */}
          {outputPorts.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-tertiary uppercase">Outputs</span>
              {outputPorts.map((port) => {
                const portRef: PortRef = { moduleId: module.id, portId: port.id };
                return (
                  <JackPort
                    key={port.id}
                    portRef={portRef}
                    name={port.name}
                    direction="output"
                    signal={port.signal}
                    isHovered={isPortHovered(portRef)}
                    isConnected={isConnected(portRef)}
                    isWiringSource={isWiringSource(portRef)}
                    onPortClick={onPortClick}
                    onPortHover={onPortHover}
                    registerPosition={registerPortPosition}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Collapsed view - show only ports */}
      {isCollapsed && (
        <div className="flex flex-col gap-2 p-2 relative">
          {/* Subtle noise texture overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
          />

          {inputPorts.map((port) => {
            const portRef: PortRef = { moduleId: module.id, portId: port.id };
            return (
              <JackPort
                key={port.id}
                portRef={portRef}
                name=""
                direction="input"
                signal={port.signal}
                isHovered={isPortHovered(portRef)}
                isConnected={isConnected(portRef)}
                isWiringSource={isWiringSource(portRef)}
                onPortClick={onPortClick}
                onPortHover={onPortHover}
                registerPosition={registerPortPosition}
              />
            );
          })}
          {outputPorts.map((port) => {
            const portRef: PortRef = { moduleId: module.id, portId: port.id };
            return (
              <JackPort
                key={port.id}
                portRef={portRef}
                name=""
                direction="output"
                signal={port.signal}
                isHovered={isPortHovered(portRef)}
                isConnected={isConnected(portRef)}
                isWiringSource={isWiringSource(portRef)}
                onPortClick={onPortClick}
                onPortHover={onPortHover}
                registerPosition={registerPortPosition}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
