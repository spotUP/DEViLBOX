/**
 * GridCell - Individual cell in the grid sequencer
 *
 * Note cells support:
 * - Visual indicators for accent, slide, mute, hammer, octave shift
 * - Modifier keys: Shift=accent, Ctrl/Cmd=slide, Alt=octave cycle
 * - Right-click context menu with TT-303 extensions (mute, hammer)
 */

import React, { memo, useState, useCallback, useEffect } from 'react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// MIDI velocity constants
const MIDI_VELOCITY_MIN = 1;
const MIDI_VELOCITY_MAX = 127;
const VELOCITY_WHEEL_STEP = 5;


interface GridCellProps {
  isActive: boolean;
  isCurrentStep?: boolean;
  onClick: () => void;
  color?: 'default' | 'accent' | 'slide' | 'octave';
  size?: 'normal' | 'small';
}

export const GridCell: React.FC<GridCellProps> = memo(({
  isActive,
  isCurrentStep = false,
  onClick,
  color = 'default',
  size = 'normal',
}) => {
  const getColorClasses = () => {
    if (!isActive) {
      return 'bg-dark-bgTertiary hover:bg-dark-bgActive border-dark-border';
    }

    switch (color) {
      case 'accent':
        return 'bg-accent-warning hover:bg-accent-warning/80 border-accent-warning/50';
      case 'slide':
        return 'bg-accent-secondary hover:bg-accent-secondary/80 border-accent-secondary/50';
      case 'octave':
        return 'bg-accent-primary/50 hover:bg-accent-primary/70 border-accent-primary/50';
      default:
        return 'bg-accent-primary hover:bg-accent-primary/80 border-accent-primary/50';
    }
  };

  const sizeClasses = size === 'small' ? 'w-5 h-5' : 'w-7 h-7';

  return (
    <button
      onClick={onClick}
      className={`
        ${sizeClasses} rounded transition-all duration-75 border
        ${getColorClasses()}
        ${isCurrentStep ? 'ring-2 ring-accent-primary ring-offset-1 ring-offset-dark-bg' : ''}
        ${isActive ? 'shadow-sm' : ''}
      `}
    />
  );
});

// Context menu for note properties
interface NoteContextMenuProps {
  x: number;
  y: number;
  accent: boolean;
  slide: boolean;
  mute: boolean;
  hammer: boolean;
  octaveShift: number;
  velocity: number;
  onToggleAccent: () => void;
  onToggleSlide: () => void;
  onToggleMute: () => void;
  onToggleHammer: () => void;
  onSetOctave: (shift: number) => void;
  onSetVelocity: (velocity: number) => void;
  onClose: () => void;
}

const NoteContextMenu: React.FC<NoteContextMenuProps> = ({
  x,
  y,
  accent,
  slide,
  mute,
  hammer,
  octaveShift,
  velocity,
  onToggleAccent,
  onToggleSlide,
  onToggleMute,
  onToggleHammer,
  onSetOctave,
  onSetVelocity,
  onClose,
}) => {
  const [localVelocity, setLocalVelocity] = useState(velocity);

  const handleVelocityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVel = parseInt(e.target.value, 10);
    setLocalVelocity(newVel);
    onSetVelocity(newVel);
  };

  // Add Escape key handler for accessibility
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      {/* Backdrop to close menu */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 bg-dark-bgSecondary border border-dark-border rounded shadow-lg py-1 min-w-[160px]"
        style={{ left: x, top: y }}
      >
        <button
          onClick={() => { onToggleAccent(); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${accent ? 'text-accent-warning' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${accent ? 'bg-accent-warning' : 'border border-text-muted'}`} />
          Accent {accent && '✓'}
        </button>
        <button
          onClick={() => { onToggleSlide(); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${slide ? 'text-accent-secondary' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 ${slide ? 'text-accent-secondary' : 'text-text-muted'}`}>↗</span>
          Slide {slide && '✓'}
        </button>
        <div className="border-t border-dark-border my-1" />
        {/* TT-303 Extensions */}
        <button
          onClick={() => { onToggleMute(); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${mute ? 'text-yellow-400' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${mute ? 'bg-yellow-400' : 'border border-text-muted'}`} />
          Mute {mute && '✓'}
        </button>
        <button
          onClick={() => { onToggleHammer(); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${hammer ? 'text-cyan-400' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${hammer ? 'bg-cyan-400' : 'border border-text-muted'}`} />
          Hammer {hammer && '✓'}
        </button>
        <div className="border-t border-dark-border my-1" />
        <button
          onClick={() => { onSetOctave(1); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${octaveShift === 1 ? 'text-cyan-400' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${octaveShift === 1 ? 'bg-accent-primary ring-2 ring-cyan-400 ring-inset' : 'border border-text-muted'}`} />
          Oct+ {octaveShift === 1 && '✓'}
        </button>
        <button
          onClick={() => { onSetOctave(0); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${octaveShift === 0 ? 'text-accent-primary' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${octaveShift === 0 ? 'bg-accent-primary' : 'border border-text-muted'}`} />
          Normal {octaveShift === 0 && '✓'}
        </button>
        <button
          onClick={() => { onSetOctave(-1); onClose(); }}
          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-dark-bgActive flex items-center gap-2 ${octaveShift === -1 ? 'text-pink-400' : 'text-text-secondary'}`}
        >
          <span className={`w-3 h-3 rounded-sm ${octaveShift === -1 ? 'bg-accent-primary ring-2 ring-pink-400 ring-inset' : 'border border-text-muted'}`} />
          Oct- {octaveShift === -1 && '✓'}
        </button>
        <div className="border-t border-dark-border my-1" />
        {/* Velocity slider */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary">Velocity</span>
            <span className="text-xs text-text-primary font-mono">{localVelocity}</span>
          </div>
          <input
            type="range"
            min={MIDI_VELOCITY_MIN}
            max={MIDI_VELOCITY_MAX}
            value={localVelocity}
            onChange={handleVelocityChange}
            className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
          <div className="flex justify-between mt-1 text-[10px] text-text-muted">
            <button
              onClick={() => { onSetVelocity(64); setLocalVelocity(64); }}
              className="hover:text-text-secondary"
            >
              50%
            </button>
            <button
              onClick={() => { onSetVelocity(100); setLocalVelocity(100); }}
              className="hover:text-text-secondary"
            >
              Default
            </button>
            <button
              onClick={() => { onSetVelocity(MIDI_VELOCITY_MAX); setLocalVelocity(MIDI_VELOCITY_MAX); }}
              className="hover:text-text-secondary"
            >
              Max
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Specialized cell for note rows with full interaction support
interface NoteCellProps {
  noteIndex: number;
  stepIndex: number;
  isActive: boolean;
  isCurrentStep: boolean;
  isTriggered?: boolean; // Flash when note plays
  isFocused?: boolean;
  accent?: boolean;
  slide?: boolean;
  mute?: boolean;    // TT-303: Silent step
  hammer?: boolean;  // TT-303: Legato without glide
  octaveShift?: number;
  velocity?: number;
  cellSize?: number; // Dynamic cell size (14-28px), defaults to 28
  trailOpacity?: number; // Trail effect opacity (0-1), 0 = no trail
  instrumentColor?: string; // Tailwind color class from synth info
  onClick: (noteIndex: number, stepIndex: number, modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean }) => void;
  onToggleAccent?: (stepIndex: number) => void;
  onToggleSlide?: (stepIndex: number) => void;
  onToggleMute?: (stepIndex: number) => void;
  onToggleHammer?: (stepIndex: number) => void;
  onSetOctave?: (stepIndex: number, shift: number) => void;
  onSetVelocity?: (stepIndex: number, velocity: number) => void;
  onFocus?: () => void;
}

export const NoteGridCell: React.FC<NoteCellProps> = memo(({
  noteIndex,
  stepIndex,
  isActive,
  isCurrentStep,
  isTriggered = false,
  isFocused = false,
  accent = false,
  slide = false,
  mute = false,
  hammer = false,
  octaveShift = 0,
  velocity = 100,
  cellSize = 28,
  trailOpacity = 0,
  instrumentColor = 'text-accent-primary',
  onClick,
  onToggleAccent,
  onToggleSlide,
  onToggleMute,
  onToggleHammer,
  onSetOctave,
  onSetVelocity,
  onFocus,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Handle modifier keys
    if (isActive) {
      if (e.shiftKey && onToggleAccent) {
        onToggleAccent(stepIndex);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && onToggleSlide) {
        onToggleSlide(stepIndex);
        return;
      }
      if (e.altKey && onSetOctave) {
        // Cycle octave: 0 -> 1 -> -1 -> 0
        const newShift = octaveShift === 0 ? 1 : octaveShift === 1 ? -1 : 0;
        onSetOctave(stepIndex, newShift);
        return;
      }
    }

    onClick(noteIndex, stepIndex, {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    });
  }, [onClick, noteIndex, stepIndex, isActive, onToggleAccent, onToggleSlide, onSetOctave, octaveShift]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isActive) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isActive]);

  const handleCloseMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleToggleAccent = useCallback(() => {
    onToggleAccent?.(stepIndex);
  }, [onToggleAccent, stepIndex]);

  const handleToggleSlide = useCallback(() => {
    onToggleSlide?.(stepIndex);
  }, [onToggleSlide, stepIndex]);

  const handleToggleMute = useCallback(() => {
    onToggleMute?.(stepIndex);
  }, [onToggleMute, stepIndex]);

  const handleToggleHammer = useCallback(() => {
    onToggleHammer?.(stepIndex);
  }, [onToggleHammer, stepIndex]);

  const handleSetOctave = useCallback((shift: number) => {
    onSetOctave?.(stepIndex, shift);
  }, [onSetOctave, stepIndex]);

  const handleSetVelocity = useCallback((vel: number) => {
    onSetVelocity?.(stepIndex, vel);
  }, [onSetVelocity, stepIndex]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isActive || !onSetVelocity) return;
    e.preventDefault();

    // Adjust velocity by ±5 per scroll step
    const delta = e.deltaY > 0 ? -VELOCITY_WHEEL_STEP : VELOCITY_WHEEL_STEP;
    const newVelocity = Math.max(MIDI_VELOCITY_MIN, Math.min(MIDI_VELOCITY_MAX, velocity + delta));
    onSetVelocity(stepIndex, newVelocity);
  }, [isActive, onSetVelocity, stepIndex, velocity]);

  const handleFocus = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  // Calculate velocity indicator - use ring width instead of opacity for punchy colors
  const getVelocityRing = () => {
    if (!isActive || velocity >= 100) return '';
    // Lower velocity = thinner inner shadow to indicate softer hit
    if (velocity < 50) return 'ring-1 ring-inset ring-black/30';
    if (velocity < 80) return 'ring-1 ring-inset ring-black/15';
    return '';
  };

  // Determine base color based on state - match button colors exactly
  const getBaseClasses = () => {
    if (!isActive) {
      return 'bg-dark-bgTertiary hover:bg-dark-bgActive border-dark-border';
    }
    // Apply instrument color to active cells
    const colorClass = instrumentColor.replace('text-', '');
    
    // Accent notes get brighter version of instrument color
    if (accent) {
      return `bg-${colorClass} hover:brightness-110 border-${colorClass}/50`;
    }
    // Normal notes get the instrument color with some opacity
    return `bg-${colorClass}/80 hover:brightness-110 border-${colorClass}/50`;
  };

  // Determine border color based on octave shift
  const getOctaveBorderClasses = () => {
    if (!isActive || octaveShift === 0) return '';
    // Octave up: cyan/teal border
    if (octaveShift > 0) return 'ring-2 ring-cyan-400 ring-inset';
    // Octave down: pink/magenta border
    return 'ring-2 ring-pink-400 ring-inset';
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onFocus={handleFocus}
        tabIndex={isFocused ? 0 : -1}
        style={{ 
          width: `${cellSize}px`, 
          height: `${cellSize}px`,
        }}
        className={`
          rounded border relative
          transition-[transform,box-shadow] duration-75
          ${getBaseClasses()}
          ${isCurrentStep && !isTriggered ? 'bg-accent-primary/30' : getOctaveBorderClasses()}
          ${isFocused && !isCurrentStep ? 'ring-2 ring-text-secondary ring-offset-1 ring-offset-dark-bg' : ''}
          ${isActive ? 'shadow-sm' : ''}
          ${isTriggered && isActive ? '!bg-white scale-[1.35] shadow-2xl shadow-white/70 !border-white' : ''}
          ${getVelocityRing()}
          focus:outline-none
        `}
        title={isActive ? `Velocity: ${velocity} | Shift+click: accent, Ctrl+click: slide, Alt+click: octave, Scroll: velocity` : ''}
        aria-label={`Step ${stepIndex + 1}, Note ${NOTE_NAMES[noteIndex]}${isActive ? `, Active` : ''}`}
        aria-pressed={isActive}
      >
        {/* Trail overlay - renders on top of everything */}
        {trailOpacity > 0 && (
          <div 
            className="absolute inset-0 rounded pointer-events-none"
            style={{
              backgroundColor: `rgba(239, 68, 68, ${trailOpacity * 0.4})`,
              zIndex: 5,
            }}
          />
        )}
        {/* Slide indicator - diagonal line */}
        {isActive && slide && !mute && (
          <span className="absolute inset-0 flex items-center justify-center text-white/90 text-xs font-bold z-10">
            ↗
          </span>
        )}
        {/* Mute indicator */}
        {isActive && mute && (
          <span className="absolute inset-0 flex items-center justify-center text-yellow-400 text-xs font-bold z-10">
            M
          </span>
        )}
        {/* Hammer indicator */}
        {isActive && hammer && !mute && (
          <span className="absolute inset-0 flex items-center justify-center text-cyan-400 text-xs font-bold z-10">
            H
          </span>
        )}
      </button>

      {/* Context menu */}
      {contextMenu && (
        <NoteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          accent={accent}
          slide={slide}
          mute={mute}
          hammer={hammer}
          octaveShift={octaveShift}
          velocity={velocity}
          onToggleAccent={handleToggleAccent}
          onToggleSlide={handleToggleSlide}
          onToggleMute={handleToggleMute}
          onToggleHammer={handleToggleHammer}
          onSetOctave={handleSetOctave}
          onSetVelocity={handleSetVelocity}
          onClose={handleCloseMenu}
        />
      )}
    </>
  );
});

// Toggle cell for accent/slide/octave rows
interface ToggleCellProps {
  stepIndex: number;
  isActive: boolean;
  isCurrentStep: boolean;
  color: 'accent' | 'slide' | 'octave';
  onClick: (stepIndex: number) => void;
}

export const ToggleCell: React.FC<ToggleCellProps> = memo(({
  stepIndex,
  isActive,
  isCurrentStep,
  color,
  onClick,
}) => {
  const handleClick = React.useCallback(() => {
    onClick(stepIndex);
  }, [onClick, stepIndex]);

  return (
    <GridCell
      isActive={isActive}
      isCurrentStep={isCurrentStep}
      onClick={handleClick}
      color={color}
    />
  );
});
