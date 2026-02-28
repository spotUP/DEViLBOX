/**
 * PadButton - Individual drum pad component with velocity sensitivity
 */

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import type { DrumPad } from '../../types/drumpad';
import { useUIStore } from '@stores/useUIStore';

interface PadButtonProps {
  pad: DrumPad;
  isSelected: boolean;
  isFocused?: boolean;  // Keyboard focus state
  velocity: number;  // Last triggered velocity (0-127)
  onTrigger: (padId: number, velocity: number) => void;
  onRelease?: (padId: number) => void;  // For sustain mode
  onSelect: (padId: number) => void;
  onFocus?: () => void;  // Focus callback
  className?: string;
}

export const PadButton: React.FC<PadButtonProps> = ({
  pad,
  isSelected,
  isFocused = false,
  velocity,
  onTrigger,
  onRelease,
  onSelect,
  onFocus,
  className = '',
}) => {
  const useHex = useUIStore(s => s.useHexNumbers);
  const [isPressed, setIsPressed] = useState(false);
  const [triggerIntensity, setTriggerIntensity] = useState(0); // 0-1 animated flash
  const decayTimerRef = useRef<number | null>(null);

  // Animate velocity flash decay
  useEffect(() => {
    return () => {
      if (decayTimerRef.current) cancelAnimationFrame(decayTimerRef.current);
    };
  }, []);

  const flashTrigger = useCallback((vel: number) => {
    const intensity = vel / 127;
    setTriggerIntensity(intensity);

    // Decay the flash over ~300ms
    const startTime = performance.now();
    const duration = 200 + intensity * 200; // 200-400ms based on velocity

    const decay = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Exponential decay curve
      const remaining = intensity * Math.pow(1 - progress, 2);
      setTriggerIntensity(remaining);

      if (progress < 1) {
        decayTimerRef.current = requestAnimationFrame(decay);
      }
    };

    if (decayTimerRef.current) cancelAnimationFrame(decayTimerRef.current);
    decayTimerRef.current = requestAnimationFrame(decay);
  }, []);

  // Calculate velocity based on click/touch position
  const calculateVelocity = useCallback((clientY: number, target: Element): number => {
    // Simple velocity calculation based on Y position in pad
    const rect = target.getBoundingClientRect();
    const relativeY = (clientY - rect.top) / rect.height;

    // Bottom of pad = higher velocity, top = lower velocity
    const baseVelocity = Math.floor((1 - relativeY) * 127);

    // Clamp to valid range
    return Math.max(1, Math.min(127, baseVelocity));
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Empty pads can be clicked for selection but don't trigger sound
    if (!pad.sample) {
      onSelect(pad.id);
      return;
    }
    
    setIsPressed(true);
    const vel = calculateVelocity(event.clientY, event.currentTarget);
    flashTrigger(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, pad.sample, onTrigger, onSelect, calculateVelocity, flashTrigger]);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
    onRelease?.(pad.id);
  }, [pad.id, onRelease]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Select pad for editing with modifier key
      onSelect(pad.id);
    }
  }, [pad.id, onSelect]);

  // Touch support for mobile devices
  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    
    // Empty pads can be tapped for selection but don't trigger sound
    if (!pad.sample) {
      onSelect(pad.id);
      return;
    }
    
    setIsPressed(true);
    const touch = event.touches[0];
    const vel = calculateVelocity(touch.clientY, event.currentTarget);
    flashTrigger(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, pad.sample, onTrigger, onSelect, calculateVelocity, flashTrigger]);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    setIsPressed(false);
    onRelease?.(pad.id);

    // Check for selection gesture (long press could be added later)
    if (event.changedTouches.length > 1) {
      // Multi-touch = select
      onSelect(pad.id);
    }
  }, [pad.id, onSelect, onRelease]);

  // Determine pad style based on state
  const padStyle = useMemo(() => {
    if (!pad.sample) {
      return { className: 'bg-dark-border', overlay: undefined };
    }

    if (isSelected) {
      return { className: 'bg-emerald-800', overlay: undefined };
    }

    return { className: 'bg-emerald-800', overlay: undefined };
  }, [pad.sample, isSelected]);

  // Flash overlay opacity driven by triggerIntensity (animated)
  const flashOpacity = triggerIntensity > 0.01 ? triggerIntensity : 0;

  return (
    <button
      data-pad-id={pad.id}
      className={`
        relative rounded-lg select-none overflow-hidden cursor-pointer
        ${padStyle.className}
        ${!pad.sample ? 'opacity-40' : ''}
        ${isPressed && pad.sample ? 'scale-95' : 'scale-100'}
        ${isSelected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-bg' : ''}
        ${isFocused && !isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-dark-bg' : ''}
        transform-gpu will-change-transform
        ${className}
      `}
      style={{
        aspectRatio: '1',
        transition: isPressed ? 'transform 50ms' : 'transform 120ms',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onFocus={onFocus}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      tabIndex={0}
      aria-label={`Drum pad ${pad.id}: ${pad.name}${pad.sample ? '' : ' (empty - click to assign)'}`}
      aria-pressed={isPressed}
      role="gridcell"
    >
      {/* Velocity flash overlay — animated decay */}
      {flashOpacity > 0 && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, rgba(16, 185, 129, ${flashOpacity * 0.9}) 0%, rgba(52, 211, 153, ${flashOpacity * 0.5}) 60%, transparent 100%)`,
          }}
        />
      )}

      {/* Pad number */}
      <div className="absolute top-1 left-1 text-[10px] font-mono text-white/60">
        {useHex ? pad.id.toString(16).toUpperCase().padStart(2, '0') : pad.id}
      </div>

      {/* Pad name */}
      <div className="absolute inset-0 flex items-center justify-center px-2">
        <span className="text-xs font-bold text-white text-center truncate leading-tight">
          {pad.name}
        </span>
      </div>

      {/* Pad badges */}
      <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
        {pad.muteGroup > 0 && (
          <span className="text-[8px] font-mono text-amber-400/70">M{pad.muteGroup}</span>
        )}
        {pad.playMode === 'sustain' && (
          <span className="text-[8px] font-mono text-blue-400/70">S</span>
        )}
        {pad.reverse && (
          <span className="text-[8px] font-mono text-purple-400/70">R</span>
        )}
      </div>

      {/* Velocity dot */}
      {velocity > 0 && pad.sample && (
        <div className="absolute bottom-1 right-1">
          <div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            style={{ opacity: 0.3 + (velocity / 127) * 0.7 }}
          />
        </div>
      )}

      {/* Empty state icon */}
      {!pad.sample && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-2xl text-white/20">+</div>
        </div>
      )}
    </button>
  );
};
