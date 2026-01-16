/**
 * GridCell - Individual cell in the grid sequencer
 *
 * Note cells support:
 * - Visual indicators for accent, slide, octave shift
 * - Modifier keys: Shift=accent, Ctrl/Cmd=slide, Alt=octave cycle
 * - Right-click context menu
 */

import React, { memo, useState, useCallback } from 'react';

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
  octaveShift: number;
  onToggleAccent: () => void;
  onToggleSlide: () => void;
  onSetOctave: (shift: number) => void;
  onClose: () => void;
}

const NoteContextMenu: React.FC<NoteContextMenuProps> = ({
  x,
  y,
  accent,
  slide,
  octaveShift,
  onToggleAccent,
  onToggleSlide,
  onSetOctave,
  onClose,
}) => {
  return (
    <>
      {/* Backdrop to close menu */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div
        className="fixed z-50 bg-dark-bgSecondary border border-dark-border rounded shadow-lg py-1 min-w-[120px]"
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
  accent?: boolean;
  slide?: boolean;
  octaveShift?: number;
  onClick: (noteIndex: number, stepIndex: number, modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean }) => void;
  onToggleAccent?: (stepIndex: number) => void;
  onToggleSlide?: (stepIndex: number) => void;
  onSetOctave?: (stepIndex: number, shift: number) => void;
}

export const NoteGridCell: React.FC<NoteCellProps> = memo(({
  noteIndex,
  stepIndex,
  isActive,
  isCurrentStep,
  accent = false,
  slide = false,
  octaveShift = 0,
  onClick,
  onToggleAccent,
  onToggleSlide,
  onSetOctave,
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

  const handleSetOctave = useCallback((shift: number) => {
    onSetOctave?.(stepIndex, shift);
  }, [onSetOctave, stepIndex]);

  // Determine base color based on state
  const getBaseClasses = () => {
    if (!isActive) {
      return 'bg-dark-bgTertiary hover:bg-dark-bgActive border-dark-border';
    }
    // Accent notes get orange tint
    if (accent) {
      return 'bg-accent-warning/80 hover:bg-accent-warning border-accent-warning';
    }
    return 'bg-accent-primary hover:bg-accent-primary/80 border-accent-primary/50';
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
        className={`
          w-7 h-7 rounded transition-all duration-75 border relative
          ${getBaseClasses()}
          ${isCurrentStep ? 'ring-2 ring-accent-primary ring-offset-1 ring-offset-dark-bg' : getOctaveBorderClasses()}
          ${isActive ? 'shadow-sm' : ''}
        `}
        title={isActive ? 'Shift+click: accent, Ctrl+click: slide, Alt+click: octave' : ''}
      >
        {/* Slide indicator - diagonal line */}
        {isActive && slide && (
          <span className="absolute inset-0 flex items-center justify-center text-white/90 text-xs font-bold">
            ↗
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
          octaveShift={octaveShift}
          onToggleAccent={handleToggleAccent}
          onToggleSlide={handleToggleSlide}
          onSetOctave={handleSetOctave}
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
