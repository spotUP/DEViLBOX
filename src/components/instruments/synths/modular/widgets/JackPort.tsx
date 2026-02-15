/**
 * JackPort - Port connector widget
 *
 * Renders a clickable port (jack) for connecting cables.
 * Color-coded by signal type: audio=green, cv=yellow, gate=red, trigger=blue
 */

import React, { useRef, useEffect } from 'react';
import type { SignalType, PortRef } from '../../../../../types/modular';

interface JackPortProps {
  portRef: PortRef;
  name: string;
  direction: 'input' | 'output';
  signal: SignalType;
  isHovered?: boolean;
  isConnected?: boolean;
  isWiringSource?: boolean;
  onPortClick: (portRef: PortRef) => void;
  onPortHover: (portRef: PortRef | null) => void;
  registerPosition: (portId: string, element: HTMLElement | null) => void;
}

const SIGNAL_COLORS: Record<SignalType, string> = {
  audio: '#10b981', // green
  cv: '#eab308',    // yellow
  gate: '#ef4444',  // red
  trigger: '#3b82f6', // blue
};

export const JackPort: React.FC<JackPortProps> = ({
  portRef,
  name,
  direction,
  signal,
  isHovered = false,
  isConnected = false,
  isWiringSource = false,
  onPortClick,
  onPortHover,
  registerPosition,
}) => {
  const portElementRef = useRef<HTMLDivElement>(null);
  const portId = `${portRef.moduleId}.${portRef.portId}`;

  // Register position with parent
  useEffect(() => {
    registerPosition(portId, portElementRef.current);
  }, [portId, registerPosition]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPortClick(portRef);
  };

  const handleMouseEnter = () => {
    onPortHover(portRef);
  };

  const handleMouseLeave = () => {
    onPortHover(null);
  };

  const color = SIGNAL_COLORS[signal];
  const isInput = direction === 'input';

  return (
    <div
      className={`flex items-center gap-1 ${isInput ? 'flex-row' : 'flex-row-reverse'}`}
      title={`${name} (${signal})`}
    >
      {/* Port jack */}
      <div
        ref={portElementRef}
        className={`
          relative w-4 h-4 rounded-full cursor-pointer border-2 transition-all flex items-center justify-center
          ${isWiringSource ? 'ring-2 ring-white ring-offset-1' : ''}
          ${isHovered ? 'scale-125 shadow-lg' : ''}
        `}
        style={{
          backgroundColor: '#1f2937', // Dark inner background
          borderColor: color,
          boxShadow: isWiringSource ? `0 0 8px ${color}` : (isConnected ? `0 0 4px ${color}80` : 'none'),
        }}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Inner hole */}
        <div 
          className="w-1.5 h-1.5 rounded-full bg-black shadow-inner"
          style={{
            backgroundColor: isConnected ? color : '#000',
            opacity: isConnected ? 0.8 : 0.5
          }}
        />
      </div>

      {/* Port label */}
      <span className="text-[10px] font-mono tracking-tight text-text-secondary">{name}</span>
    </div>
  );
};
