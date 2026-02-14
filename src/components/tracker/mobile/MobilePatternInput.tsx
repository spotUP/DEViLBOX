/**
 * MobilePatternInput - Context-aware bottom input panel for mobile tracker
 * Switches between piano keyboard (notes) and hex grid (effects/volume/instrument)
 * Vivid Tracker-inspired mobile input system
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTrackerStore } from '@stores';
import { Piano, Hash, Delete, ChevronLeft, ChevronRight, Copy, Scissors, ChevronDown, ChevronUp } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface MobilePatternInputProps {
  onNoteInput: (note: number) => void;
  onHexInput: (value: number) => void;
  onDelete: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onCollapseChange?: (isCollapsed: boolean) => void;
}

// Note names for the piano keyboard
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // Indices of black keys (sharps)

export const MobilePatternInput: React.FC<MobilePatternInputProps> = ({
  onNoteInput,
  onHexInput,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onCollapseChange,
}) => {
  const { cursor, currentOctave, setCurrentOctave } = useTrackerStore();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Determine input mode based on cursor column
  const inputMode = useMemo(() => {
    if (cursor.columnType === 'note') return 'piano';
    if (cursor.columnType === 'instrument' ||
        cursor.columnType === 'volume' ||
        cursor.columnType === 'effTyp' ||
        cursor.columnType === 'effParam') return 'hex';
    return 'piano'; // Default
  }, [cursor.columnType]);

  // Handle piano key press
  const handleNotePress = useCallback((semitone: number) => {
    const xmNote = (currentOctave * 12) + semitone + 1; // XM format: 1-96
    haptics.light();
    onNoteInput(xmNote);
  }, [currentOctave, onNoteInput]);

  // Handle note-off
  const handleNoteOff = useCallback(() => {
    haptics.medium();
    onNoteInput(97); // XM note-off value
  }, [onNoteInput]);

  // Handle octave change
  const handleOctaveDown = useCallback(() => {
    if (currentOctave > 0) {
      haptics.light();
      setCurrentOctave(currentOctave - 1);
    }
  }, [currentOctave, setCurrentOctave]);

  const handleOctaveUp = useCallback(() => {
    if (currentOctave < 7) {
      haptics.light();
      setCurrentOctave(currentOctave + 1);
    }
  }, [currentOctave, setCurrentOctave]);

  // Handle hex button press
  const handleHexPress = useCallback((value: number) => {
    haptics.light();
    onHexInput(value);
  }, [onHexInput]);

  // Handle delete with haptic feedback
  const handleDeletePress = useCallback(() => {
    haptics.medium();
    onDelete();
  }, [onDelete]);

  // Collapse/expand handler
  const toggleCollapse = useCallback(() => {
    haptics.selection();
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
  }, [isCollapsed, onCollapseChange]);

  // Long-press context menu handlers
  const handleLongPressStart = useCallback(() => {
    haptics.heavy();
    setShowContextMenu(true);
  }, []);

  const handleContextAction = useCallback((action: () => void) => {
    haptics.success();
    action();
    setShowContextMenu(false);
  }, []);

  return (
    <div className="mobile-pattern-input safe-bottom">
      {/* Mode indicator bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bgTertiary border-t border-dark-border">
        <div className="flex items-center gap-2">
          {inputMode === 'piano' ? (
            <>
              <Piano size={16} className="text-accent-primary" />
              <span className="text-xs font-mono text-text-secondary">
                NOTE INPUT
              </span>
            </>
          ) : (
            <>
              <Hash size={16} className="text-accent-secondary" />
              <span className="text-xs font-mono text-text-secondary">
                {cursor.columnType.toUpperCase()}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Context menu toggle */}
          <button
            onClick={handleLongPressStart}
            className="p-1.5 rounded bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors"
            aria-label="Show context menu"
          >
            <Copy size={14} className="text-text-muted" />
          </button>

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors"
            aria-label={isCollapsed ? "Expand input" : "Collapse input"}
          >
            {isCollapsed ? (
              <ChevronUp size={14} className="text-text-muted" />
            ) : (
              <ChevronDown size={14} className="text-text-muted" />
            )}
          </button>
        </div>
      </div>

      {/* Input area */}
      {!isCollapsed && (
        <div className="p-2 bg-dark-bgSecondary">
        {inputMode === 'piano' ? (
          <PianoKeyboard
            currentOctave={currentOctave}
            onNotePress={handleNotePress}
            onNoteOff={handleNoteOff}
            onOctaveDown={handleOctaveDown}
            onOctaveUp={handleOctaveUp}
            onDelete={handleDeletePress}
          />
        ) : (
          <HexGrid
            onHexPress={handleHexPress}
            onDelete={handleDeletePress}
          />
        )}
      </div>
      )}

      {/* Context menu overlay */}
      {showContextMenu && (
        <ContextMenu
          onCopy={onCopy ? () => handleContextAction(onCopy) : undefined}
          onCut={onCut ? () => handleContextAction(onCut) : undefined}
          onPaste={onPaste ? () => handleContextAction(onPaste) : undefined}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
};

/**
 * PianoKeyboard - Horizontal scrollable piano with octave controls
 */
interface PianoKeyboardProps {
  currentOctave: number;
  onNotePress: (semitone: number) => void;
  onNoteOff: () => void;
  onOctaveDown: () => void;
  onOctaveUp: () => void;
  onDelete: () => void;
}

const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  currentOctave,
  onNotePress,
  onNoteOff,
  onOctaveDown,
  onOctaveUp,
  onDelete,
}) => {
  // Handle touch with pressure sensitivity (iOS 3D Touch / Force Touch)
  const handleKeyTouch = useCallback((semitone: number, _e: React.TouchEvent) => {
    // TODO: Implement velocity sensitivity from touch.force (iOS 3D Touch)
    // const touch = e.touches[0];
    // const force = touch.force || 1.0;
    // const velocity = Math.min(127, Math.floor(force * 127));
    // Pass velocity to onNoteInput when implemented

    // For now, just trigger the note (velocity handling can be added to onNoteInput later)
    onNotePress(semitone);
  }, [onNotePress]);

  return (
    <div className="flex flex-col gap-2">
      {/* Octave and utility controls */}
      <div className="flex items-center gap-2">
        {/* Octave controls */}
        <div className="flex items-center gap-1 bg-dark-bgTertiary rounded-lg p-1">
          <button
            onClick={onOctaveDown}
            disabled={currentOctave === 0}
            className="piano-octave-btn"
            aria-label="Octave down"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="px-3 py-1 min-w-[48px] text-center">
            <span className="text-xs text-text-muted font-mono">OCT</span>
            <div className="text-lg font-bold text-accent-primary font-mono">
              {currentOctave}
            </div>
          </div>
          <button
            onClick={onOctaveUp}
            disabled={currentOctave === 7}
            className="piano-octave-btn"
            aria-label="Octave up"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Note-off and delete buttons */}
        <button
          onClick={onNoteOff}
          className="flex-1 piano-utility-btn"
        >
          <span className="font-mono text-sm">---</span>
          <span className="text-[10px] text-text-muted">OFF</span>
        </button>

        <button
          onClick={onDelete}
          className="flex-1 piano-utility-btn"
        >
          <Delete size={18} />
          <span className="text-[10px] text-text-muted">DEL</span>
        </button>
      </div>

      {/* Piano keys - single octave with scroll */}
      <div className="relative h-[120px] bg-dark-bg rounded-lg overflow-hidden">
        <div className="absolute inset-0 flex">
          {NOTE_NAMES.map((name, semitone) => {
            const isBlackKey = BLACK_KEYS.includes(semitone);
            return (
              <button
                key={semitone}
                onTouchStart={(e) => handleKeyTouch(semitone, e)}
                onClick={() => onNotePress(semitone)}
                className={`piano-key ${isBlackKey ? 'piano-key-black' : 'piano-key-white'}`}
                aria-label={`${name}${currentOctave}`}
              >
                <span className="piano-key-label">
                  {name}
                  <span className="text-[10px] opacity-60">{currentOctave}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * HexGrid - 4x4 grid for hexadecimal input (0-F)
 */
interface HexGridProps {
  onHexPress: (value: number) => void;
  onDelete: () => void;
}

const HexGrid: React.FC<HexGridProps> = ({ onHexPress, onDelete }) => {
  const hexValues = useMemo(() => {
    const values = [];
    for (let i = 0; i < 16; i++) {
      values.push(i.toString(16).toUpperCase());
    }
    return values;
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Hex grid - 4x4 */}
      <div className="grid grid-cols-4 gap-2">
        {hexValues.map((hex, index) => (
          <button
            key={hex}
            onClick={() => onHexPress(index)}
            className="hex-btn"
            aria-label={`Hex ${hex}`}
          >
            {hex}
          </button>
        ))}
      </div>

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="hex-btn hex-btn-delete w-full"
      >
        <Delete size={20} />
        <span className="text-sm">DELETE</span>
      </button>
    </div>
  );
};

/**
 * ContextMenu - Quick actions overlay
 */
interface ContextMenuProps {
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  onCopy,
  onCut,
  onPaste,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-dark-bgSecondary rounded-t-2xl p-4 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs font-mono text-text-muted text-center mb-2">
            QUICK ACTIONS
          </div>

          {onCopy && (
            <button onClick={onCopy} className="context-menu-btn">
              <Copy size={18} />
              <span>Copy</span>
            </button>
          )}

          {onCut && (
            <button onClick={onCut} className="context-menu-btn">
              <Scissors size={18} />
              <span>Cut</span>
            </button>
          )}

          {onPaste && (
            <button onClick={onPaste} className="context-menu-btn">
              <Copy size={18} className="rotate-180" />
              <span>Paste</span>
            </button>
          )}

          <button onClick={onClose} className="context-menu-btn context-menu-btn-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobilePatternInput;
