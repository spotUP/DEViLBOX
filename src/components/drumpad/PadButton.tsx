/**
 * PadButton - Individual drum pad component with velocity sensitivity
 */

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import type { DrumPad, PadMode } from '../../types/drumpad';
import { useUIStore } from '@stores/useUIStore';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { DEFAULT_DJFX_PADS, DEFAULT_ONESHOT_PADS, DEFAULT_SCRATCH_PADS } from '../../constants/djPadModeDefaults';
import type { ModePadMapping } from '../../constants/djPadModeDefaults';

interface PadButtonProps {
  pad: DrumPad;
  isSelected: boolean;
  isFocused?: boolean;  // Keyboard focus state
  velocity: number;  // Last triggered velocity (0-127)
  onTrigger: (padId: number, velocity: number) => void;
  onRelease?: (padId: number) => void;  // For sustain mode
  onSelect: (padId: number) => void;
  onEmptyPadClick?: (padId: number) => void;  // Opens sample browser for empty pads
  onFocus?: () => void;  // Focus callback
  padMode?: PadMode;
  onQuickAssign?: (padId: number, rect: DOMRect) => void;
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
  onEmptyPadClick,
  onFocus,
  padMode = 'samples',
  onQuickAssign,
  className = '',
}) => {
  const useHex = useUIStore(s => s.useHexNumbers);
  const activeFxPads = useDrumPadStore(s => s.activeFxPads);

  // Compute mode mapping for non-samples modes
  const padIndex = (pad.id - 1) % 16;
  const modeMapping: ModePadMapping | undefined = useMemo(() => {
    if (padMode === 'djfx') return DEFAULT_DJFX_PADS[padIndex];
    if (padMode === 'oneshots') return DEFAULT_ONESHOT_PADS[padIndex];
    if (padMode === 'scratch') return DEFAULT_SCRATCH_PADS[padIndex];
    return undefined;
  }, [padMode, padIndex]);
  const [isPressed, setIsPressed] = useState(false);
  const [triggerIntensity, setTriggerIntensity] = useState(0); // 0-1 animated flash
  const decayTimerRef = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  // A pad is "loaded" if it has a sample, synth config, or legacy instrument assigned
  // In non-samples modes, a mode mapping counts as loaded
  const isLoaded = padMode !== 'samples'
    ? !!modeMapping
    : !!(pad.sample || pad.synthConfig || pad.instrumentId != null);

  const isFxActive = padMode === 'djfx' && activeFxPads.has(pad.id);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Empty pads: just select (don't auto-open editor)
    if (!isLoaded) {
      onSelect(pad.id);
      return;
    }
    
    setIsPressed(true);
    const vel = calculateVelocity(event.clientY, event.currentTarget);
    flashTrigger(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, isLoaded, onTrigger, onSelect, calculateVelocity, flashTrigger]);

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

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (onQuickAssign) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      onQuickAssign(pad.id, rect);
    }
  }, [pad.id, onQuickAssign]);

  // Touch support — use ref-based listeners with { passive: false } to allow preventDefault
  const touchHandlersRef = useRef({
    onTrigger, onRelease, onSelect, onEmptyPadClick, pad, calculateVelocity, flashTrigger,
  });
  touchHandlersRef.current = { onTrigger, onRelease, onSelect, onEmptyPadClick, pad, calculateVelocity, flashTrigger };

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault(); // safe: non-passive listener
      const { pad, onSelect, onTrigger, calculateVelocity, flashTrigger } = touchHandlersRef.current;

      if (!pad.sample && !pad.synthConfig && pad.instrumentId == null) {
        onSelect(pad.id);
        return;
      }

      setIsPressed(true);
      const touch = event.touches[0];
      const vel = calculateVelocity(touch.clientY, el);
      flashTrigger(vel);
      onTrigger(pad.id, vel);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      event.preventDefault();
      setIsPressed(false);
      const { pad, onRelease, onSelect } = touchHandlersRef.current;
      onRelease?.(pad.id);

      if (event.changedTouches.length > 1) {
        onSelect(pad.id);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []); // stable — handlers accessed through ref

  // Determine pad style based on state
  const padStyle = useMemo(() => {
    // Mode mapping color takes priority in non-samples modes
    if (modeMapping && padMode !== 'samples') {
      return { className: '', bgColor: modeMapping.color };
    }

    // Custom color takes priority
    if (pad.color && isLoaded) {
      return { className: '', bgColor: pad.color };
    }

    if (!isLoaded) {
      return { className: 'bg-dark-border', bgColor: undefined };
    }

    // Synth-only pads get a different color accent
    if (!pad.sample && (pad.synthConfig || pad.instrumentId != null)) {
      return { className: isSelected ? 'bg-blue-800' : 'bg-blue-900', bgColor: undefined };
    }

    return { className: 'bg-emerald-800', bgColor: undefined };
  }, [isLoaded, pad.sample, pad.instrumentId, pad.color, isSelected, modeMapping, padMode]);

  // Flash overlay opacity driven by triggerIntensity (animated)
  const flashOpacity = triggerIntensity > 0.01 ? triggerIntensity : 0;

  return (
    <button
      ref={buttonRef}
      data-pad-id={pad.id}
      className={`
        relative rounded-lg select-none overflow-hidden cursor-pointer
        ${padStyle.className}
        ${!isLoaded ? 'opacity-40' : ''}
        ${isPressed && isLoaded ? 'scale-95' : 'scale-100'}
        ${isSelected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-bg' : ''}
        ${isFocused && !isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-dark-bg' : ''}
        transform-gpu will-change-transform
        ${className}
      `}
      style={{
        aspectRatio: '1',
        transition: isPressed ? 'transform 50ms' : 'transform 120ms',
        ...(padStyle.bgColor ? { backgroundColor: padStyle.bgColor } : {}),
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onFocus={onFocus}
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
        <span className="text-xs font-bold text-text-primary text-center truncate leading-tight">
          {modeMapping && padMode !== 'samples' ? modeMapping.label : pad.name}
        </span>
      </div>

      {/* DJ FX active glow */}
      {isFxActive && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none animate-pulse"
          style={{
            boxShadow: `0 0 12px 4px ${modeMapping?.color ?? '#fff'}`,
          }}
        />
      )}

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
      {velocity > 0 && isLoaded && (
        <div className="absolute bottom-1 right-1">
          <div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            style={{ opacity: 0.3 + (velocity / 127) * 0.7 }}
          />
        </div>
      )}

      {/* Empty state icon (samples mode only) */}
      {!isLoaded && padMode === 'samples' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-2xl text-white/20">+</div>
        </div>
      )}
    </button>
  );
};
