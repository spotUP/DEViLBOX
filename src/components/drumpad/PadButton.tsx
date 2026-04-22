/**
 * PadButton - Individual drum pad component with velocity sensitivity
 */

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import type { DrumPad, SampleData } from '../../types/drumpad';
import { useUIStore } from '@stores/useUIStore';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { getAudioContext } from '../../audio/AudioContextSingleton';

interface PadButtonProps {
  pad: DrumPad;
  isSelected: boolean;
  isFocused?: boolean;  // Keyboard focus state
  velocity: number;  // Last triggered velocity (0-127)
  onTrigger: (padId: number, velocity: number) => void;
  onRelease?: (padId: number) => void;  // For sustain mode
  onSelect: (padId: number) => void;
  onFocus?: () => void;  // Focus callback
  onQuickAssign?: (padId: number, x: number, y: number) => void;
  className?: string;
}

export const PadButton: React.FC<PadButtonProps> = ({
  pad,
  isSelected,
  isFocused: _isFocused = false,
  velocity,
  onTrigger,
  onRelease,
  onSelect,
  onFocus,
  onQuickAssign,
  className = '',
}) => {
  const useHex = useUIStore(s => s.useHexNumbers);
  const activeFxPads = useDrumPadStore(s => s.activeFxPads);
  const loadSampleToPad = useDrumPadStore(s => s.loadSampleToPad);

  const [isPressed, setIsPressed] = useState(false);
  const [triggerIntensity, setTriggerIntensity] = useState(0); // 0-1 animated flash
  const [isDropTarget, setIsDropTarget] = useState(false);
  const decayTimerRef = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // ── Drag-and-drop: drop an audio file directly onto a pad to load it ─────
  // The pad advertises itself via `data-sample-drop-zone` so GlobalDragDrop-
  // Handler at App level skips the drop (see its escape hatch for that attr).
  // We decode the file via the shared AudioContext, then call loadSampleToPad
  // — same path the sample-browser takes once it resolves to a SampleData.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    // relatedTarget is the element being entered; if it's still inside this pad,
    // we're just moving over child elements and should stay highlighted.
    const rt = e.relatedTarget as Node | null;
    if (rt && e.currentTarget.contains(rt)) return;
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLButtonElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    // Intentionally do NOT stopPropagation — we want the drop to bubble to
    // GlobalDragDropHandler's window listener so its isDragging state flips
    // back to false and the "Drop a file here" overlay dismisses. That handler
    // already early-returns when the target has `data-sample-drop-zone`
    // (set on this button below), so no double-handling.
    setIsDropTarget(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    try {
      const audioContext = getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const name = file.name.replace(/\.[^/.]+$/, '');
      const sampleData: SampleData = {
        id: `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        audioBuffer,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
      };
      await loadSampleToPad(pad.id, sampleData);
    } catch (err) {
      console.error('[PadButton] Failed to decode dropped file:', file.name, err);
    }
  }, [pad.id, loadSampleToPad]);

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

  // Fire the flash whenever the `velocity` prop ticks from 0 → nonzero — that's
  // the signal that an EXTERNAL trigger hit (MIDI, keyboard, programmatic).
  // Mouse/touch paths call flashTrigger directly and drive velocity=0 through
  // props, so this effect only lights up on external events.
  const prevVelocityRef = useRef(0);
  useEffect(() => {
    if (velocity > 0 && prevVelocityRef.current === 0) {
      flashTrigger(velocity);
    }
    prevVelocityRef.current = velocity;
  }, [velocity, flashTrigger]);

  // Calculate velocity based on click/touch position
  const calculateVelocity = useCallback((_clientY: number, _target: Element): number => {
    // Mouse/touch always triggers at full velocity — only MIDI controllers send real velocity
    return 127;
  }, []);

  // A pad is "loaded" if it has actual sound source assigned
  const hasActualData = !!(pad.sample || pad.synthConfig || pad.instrumentId != null || pad.djFxAction || pad.scratchAction || pad.pttAction || pad.dubAction);
  const isLoaded = hasActualData;

  const isFxActive = pad.djFxAction && activeFxPads.has(pad.id);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    // Ignore right-click (context menu handles it)
    if (event.button === 2) return;
    
    event.preventDefault();
    
    // Empty pads: open context menu on left click for easy setup
    if (!isLoaded) {
      // If a context menu is already open, the preceding pointerdown has
      // just dismissed it via useClickOutside. Treat this click as the
      // dismissal — don't immediately re-open the menu on this pad.
      if (document.querySelector('[data-context-menu]')) return;

      if (onQuickAssign) {
        onQuickAssign(pad.id, event.clientX, event.clientY);
      }
      return;
    }
    
    setIsPressed(true);
    const vel = calculateVelocity(event.clientY, event.currentTarget);
    flashTrigger(vel);
    onTrigger(pad.id, vel);
  }, [pad.id, isLoaded, onTrigger, onQuickAssign, calculateVelocity, flashTrigger]);

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
      onQuickAssign(pad.id, event.clientX, event.clientY);
    }
  }, [pad.id, onQuickAssign]);

  // Touch support — use ref-based listeners with { passive: false } to allow preventDefault
  const touchHandlersRef = useRef({
    onTrigger, onRelease, onSelect, pad, calculateVelocity, flashTrigger,
  });
  touchHandlersRef.current = { onTrigger, onRelease, onSelect, pad, calculateVelocity, flashTrigger };

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault(); // safe: non-passive listener
      const { pad, onTrigger, calculateVelocity, flashTrigger } = touchHandlersRef.current;

      // Check if pad is empty (same check as line 90 hasActualData)
      const isEmpty = !pad.sample && !pad.synthConfig && pad.instrumentId == null && !pad.djFxAction && !pad.scratchAction && !pad.pttAction && !pad.dubAction;
      if (isEmpty) {
        // Empty pads: do nothing on touch (use context menu to set up)
        return;
      }

      setIsPressed(true);
      // Use changedTouches to get the touch that started this event (correct for multi-touch)
      const touch = event.changedTouches[0];
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

  // Lighten very dark colors for better contrast on dark grey background
  const ensureContrast = useCallback((hexColor: string): string => {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate relative luminance (simplified)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // If too dark (luminance < 0.35), lighten it
    if (luminance < 0.35) {
      const boost = 1.5; // Lighten by 50%
      const newR = Math.min(255, Math.floor(r * boost));
      const newG = Math.min(255, Math.floor(g * boost));
      const newB = Math.min(255, Math.floor(b * boost));
      return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }
    
    return hexColor;
  }, []);

  // Determine pad style based on state
  const padStyle = useMemo(() => {
    const baseColor = pad.color ?? (
      pad.sample ? '#34d399' :   // emerald for samples
      (pad.synthConfig || pad.instrumentId != null) ? '#60a5fa' :  // blue for synths
      pad.djFxAction ? '#a78bfa' :  // violet for DJ FX
      pad.dubAction ? '#fbbf24' :   // amber for dub actions
      undefined
    );

    if (hasActualData && baseColor) {
      const contrastColor = ensureContrast(baseColor);
      // Parse hex to get RGB for tinted backgrounds
      const hex = baseColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return {
        textColor: contrastColor,
        bgColor: `rgba(${r},${g},${b},0.12)`,
        borderColor: `rgba(${r},${g},${b},0.35)`,
        glowColor: `rgba(${r},${g},${b},0.5)`,
      };
    }

    return { textColor: undefined, bgColor: undefined, borderColor: undefined, glowColor: undefined };
  }, [isLoaded, pad.sample, pad.instrumentId, pad.synthConfig, pad.color, pad.djFxAction, pad.dubAction, hasActualData, ensureContrast]);

  // Flash overlay opacity driven by triggerIntensity (animated)
  const flashOpacity = triggerIntensity > 0.01 ? triggerIntensity : 0;

  return (
    <button
      ref={buttonRef}
      data-pad-id={pad.id}
      data-sample-drop-zone
      className={`
        relative rounded-lg select-none overflow-hidden cursor-pointer outline-none
        focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-1 focus-visible:ring-offset-dark-bg
        ${!isLoaded ? 'opacity-40' : ''}
        ${isPressed && isLoaded ? 'scale-95' : 'scale-100'}
        ${isSelected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-bg' : ''}
        ${isDropTarget ? 'ring-2 ring-accent-success ring-offset-2 ring-offset-dark-bg' : ''}
        transform-gpu will-change-transform
        ${className}
      `}
      style={{
        transition: isPressed ? 'transform 50ms' : 'transform 120ms',
        backgroundColor: padStyle.bgColor ?? 'var(--color-dark-border)',
        border: `1px solid ${padStyle.borderColor ?? 'var(--color-dark-borderLight)'}`,
        boxShadow: isPressed && padStyle.glowColor
          ? `0 0 12px ${padStyle.glowColor}, inset 0 0 8px ${padStyle.glowColor}`
          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.3)',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onFocus={onFocus}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
            background: padStyle.glowColor
              ? `radial-gradient(circle at center, ${padStyle.glowColor.replace(/[\d.]+\)$/, `${flashOpacity * 0.9})`)} 0%, ${padStyle.glowColor.replace(/[\d.]+\)$/, `${flashOpacity * 0.5})`)} 60%, transparent 100%)`
              : `radial-gradient(circle at center, rgba(16, 185, 129, ${flashOpacity * 0.9}) 0%, rgba(52, 211, 153, ${flashOpacity * 0.5}) 60%, transparent 100%)`,
          }}
        />
      )}

      {/* Pad number */}
      <div className="absolute top-1 left-1 text-[10px] font-mono text-white/60">
        {useHex ? pad.id.toString(16).toUpperCase().padStart(2, '0') : pad.id}
      </div>

      {/* Pad name */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
        <span 
          className="text-[28px] font-bold text-center truncate leading-tight"
          style={{ 
            color: padStyle.textColor ?? '#f3f4f6',
          }}
        >
          {/* Show actual pad name, or "Empty" if no data */}
          {hasActualData ? pad.name : 'Empty'}
        </span>
        {pad.presetName && (
          <span className="text-[27px] font-mono text-white/50 truncate max-w-full leading-none mt-0.5">
            {pad.presetName}
          </span>
        )}
      </div>

      {/* DJ FX active glow */}
      {isFxActive && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none animate-pulse"
          style={{
            boxShadow: `0 0 12px 4px ${pad.color ?? '#60a5fa'}`,
          }}
        />
      )}

      {/* Pad badges */}
      <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
        {pad.muteGroup > 0 && (
          <span className="text-[8px] font-mono text-amber-400/70">M{pad.muteGroup}</span>
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

      {/* Empty state icon */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-2xl text-white/20">+</div>
        </div>
      )}
    </button>
  );
};
