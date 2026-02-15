/**
 * RackStrip - Single module as horizontal strip
 *
 * Displays a module with header, input ports, parameters, and output ports.
 * Supports collapse/expand and drag reordering.
 */

import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ModularModuleInstance, PortRef } from '../../../../../types/modular';
import { ModuleRegistry } from '../../../../../engine/modular/ModuleRegistry';
import { JackPort } from './JackPort';
import { Knob } from '../../../../controls/Knob';

interface RackStripProps {
  module: ModularModuleInstance;
  isSelected?: boolean;
  isConnected?: (portRef: PortRef) => boolean;
  isWiringSource?: (portRef: PortRef) => boolean;
  isPortHovered?: (portRef: PortRef) => boolean;
  onModuleClick: (moduleId: string) => void;
  onModuleDelete: (moduleId: string) => void;
  onPortClick: (portRef: PortRef) => void;
  onPortHover: (portRef: PortRef | null) => void;
  onParameterChange: (moduleId: string, paramId: string, value: number) => void;
  registerPortPosition: (portId: string, element: HTMLElement | null) => void;
}

export const RackStrip: React.FC<RackStripProps> = ({
  module,
  isSelected = false,
  isConnected = () => false,
  isWiringSource = () => false,
  isPortHovered = () => false,
  onModuleClick,
  onModuleDelete,
  onPortClick,
  onPortHover,
  onParameterChange,
  registerPortPosition,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(module.collapsed || false);

  const descriptor = ModuleRegistry.get(module.descriptorId);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: module.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!descriptor) {
    return (
      <div className="p-2 bg-dark-bgSecondary rounded border border-dark-border">
        <span className="text-xs text-text-muted">Unknown module: {module.descriptorId}</span>
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex flex-col bg-dark-bgSecondary rounded-lg border-2 overflow-hidden
        ${isSelected ? 'border-accent-primary shadow-[0_0_10px_rgba(var(--color-accent-rgb),0.3)]' : 'border-dark-border'}
        hover:border-accent-primary/50 transition-colors
      `}
      onClick={handleClick}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ 
          backgroundColor: descriptor.color || '#374151',
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.1) 100%)'
        }}
      >
        {/* Drag handle */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-white/70" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={handleToggleCollapse}
          className="p-0.5 hover:bg-black/20 rounded transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-white/70" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/70" />
          )}
        </button>

        {/* Module name */}
        <span className="flex-1 text-xs font-bold text-white uppercase tracking-wider truncate drop-shadow-md">
          {module.label || descriptor.name}
        </span>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="p-0.5 hover:bg-accent-error/20 rounded text-white/50 hover:text-accent-error transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body (collapsible) */}
      {!isCollapsed && (
        <div className="flex items-center gap-4 px-3 py-3 relative">
          {/* Subtle noise texture overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
          />

          {/* Input ports */}
          <div className="flex flex-col gap-2 relative z-10">
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

          {/* Parameters (knobs) */}
          <div className="flex-1 flex gap-3 justify-center relative z-10">
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
                <span className="text-[10px] text-text-muted font-mono">
                  {(module.parameters[param.id] ?? param.default).toFixed(2)}
                  {param.unit || ''}
                </span>
              </div>
            ))}
          </div>

          {/* Output ports */}
          <div className="flex flex-col gap-2 relative z-10">
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
        </div>
      )}
    </div>
  );
};
