/**
 * MobilePatternInput - Context-aware bottom input panel for mobile tracker
 * Switches between piano keyboard (notes) and hex grid (effects/volume/instrument)
 * Vivid Tracker-inspired mobile input system
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useTrackerStore } from '@stores';
import { Piano, Hash, Delete, ChevronLeft, ChevronRight, Copy, Scissors, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
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
    <div className="mobile-pattern-input safe-area-bottom">
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
          {/* Help link */}
          <button
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: '?' });
              window.dispatchEvent(event);
            }}
            className="p-1.5 rounded bg-dark-bgSecondary hover:bg-dark-bgHover transition-colors"
            aria-label="Help"
          >
            <HelpCircle size={14} className="text-text-muted" />
          </button>

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
          <PianoKeyboard
            mode={inputMode}
            currentOctave={currentOctave}
            onNotePress={handleNotePress}
            onHexPress={handleHexPress}
            onNoteOff={handleNoteOff}
            onOctaveDown={handleOctaveDown}
            onOctaveUp={handleOctaveUp}
            onDelete={handleDeletePress}
          />
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
 * Supports both Note input and Hex (0-F) input modes
 */
interface PianoKeyboardProps {
  mode: 'piano' | 'hex';
  currentOctave: number;
  onNotePress: (semitone: number) => void;
  onHexPress: (value: number) => void;
  onNoteOff: () => void;
  onOctaveDown: () => void;
  onOctaveUp: () => void;
  onDelete: () => void;
}

const HEX_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  mode,
  currentOctave,
  onNotePress,
  onHexPress,
  onNoteOff,
  onOctaveDown,
  onOctaveUp,
  onDelete,
}) => {
  // Handle touch with pressure sensitivity (iOS 3D Touch / Force Touch)
  const handleKeyTouch = useCallback((semitone: number, _e: React.TouchEvent) => {
    if (mode === 'piano') {
      onNotePress(semitone);
    } else {
      onHexPress(semitone);
    }
  }, [mode, onNotePress, onHexPress]);

  const handleKeyClick = useCallback((semitone: number) => {
    if (mode === 'piano') {
      onNotePress(semitone);
    } else {
      onHexPress(semitone);
    }
  }, [mode, onNotePress, onHexPress]);

  // For hex mode, we show 16 semitones (C to D# in next octave)
  // For piano mode, we show 12 semitones (full octave)
  const numSemitones = mode === 'hex' ? 16 : 12;
  const semitones = Array.from({ length: numSemitones }, (_, i) => i);

  return (
    <div className="flex flex-col gap-2">
      {/* Octave and utility controls */}
      <div className="flex items-center gap-2 h-[56px]">
        {/* Octave controls - Only show in piano mode */}
        {mode === 'piano' ? (
          <div className="flex items-center gap-1 bg-dark-bgTertiary rounded-lg p-1 h-full">
            <button
              onClick={onOctaveDown}
              disabled={currentOctave === 0}
              className="piano-octave-btn h-full"
              aria-label="Octave down"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-1 min-w-[48px] text-center flex flex-col justify-center">
              <span className="text-[10px] text-text-muted font-mono leading-none mb-1">OCT</span>
              <div className="text-lg font-bold text-accent-primary font-mono leading-none">
                {currentOctave}
              </div>
            </div>
            <button
              onClick={onOctaveUp}
              disabled={currentOctave === 7}
              className="piano-octave-btn h-full"
              aria-label="Octave up"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center px-4 bg-dark-bgTertiary rounded-lg h-full">
            <span className="text-xs font-bold text-accent-secondary font-mono tracking-wider">
              HEX INPUT (0-F)
            </span>
          </div>
        )}

        {/* Note-off and delete buttons */}
        <button
          onClick={onNoteOff}
          className="flex-1 piano-utility-btn h-full"
        >
          <span className="font-mono text-sm">---</span>
          <span className="text-[10px] text-text-muted">OFF</span>
        </button>

        <button
          onClick={onDelete}
          className="flex-1 piano-utility-btn h-full"
        >
          <Delete size={18} />
          <span className="text-[10px] text-text-muted">DEL</span>
        </button>
      </div>

      {/* Piano keys - dynamic layout */}
      <div className="relative h-[120px] bg-dark-bg rounded-lg overflow-hidden">
        {/* White keys layer (flex) */}
        <div className="absolute inset-0 flex">
          {semitones.map((semitone) => {
            const isBlack = BLACK_KEYS.includes(semitone % 12);
            if (isBlack) return null;
            
            const label = mode === 'hex' ? HEX_VALUES[semitone] : NOTE_NAMES[semitone % 12];
            const octave = mode === 'hex' ? '' : currentOctave;

            return (
              <button
                key={semitone}
                onTouchStart={(e) => handleKeyTouch(semitone, e)}
                onClick={() => handleKeyClick(semitone)}
                className="piano-key piano-key-white"
                aria-label={mode === 'hex' ? `Hex ${label}` : `${label}${octave}`}
              >
                <span className="piano-key-label">
                  {label}
                  <span className="text-[10px] opacity-60">{octave}</span>
                </span>
              </button>
            );
          })}
        </div>
        
        {/* Black keys layer (absolute) */}
        <div className="absolute inset-0 pointer-events-none">
          {semitones.map((semitone) => {
            const isBlack = BLACK_KEYS.includes(semitone % 12);
            if (!isBlack) return null;

            // Calculate position based on white key positions
            const octaveOffset = Math.floor(semitone / 12);
            const noteInOctave = semitone % 12;
            const whiteKeysBeforeInOctave = NOTE_NAMES.slice(0, noteInOctave).filter((_, i) => !BLACK_KEYS.includes(i)).length;
            const totalWhiteKeys = mode === 'hex' ? 9 : 7; // 9 white keys for 16 semitones, 7 for 12
            const whiteKeyWidth = 100 / totalWhiteKeys;
            const leftPos = ((octaveOffset * 7 + whiteKeysBeforeInOctave) * whiteKeyWidth) - (whiteKeyWidth * 0.25);
            
            const label = mode === 'hex' ? HEX_VALUES[semitone] : NOTE_NAMES[semitone % 12];
            const octave = mode === 'hex' ? '' : currentOctave;

            return (
              <button
                key={semitone}
                onTouchStart={(e) => handleKeyTouch(semitone, e)}
                onClick={() => handleKeyClick(semitone)}
                className="piano-key-black pointer-events-auto"
                style={{ left: `${leftPos}%`, width: `${whiteKeyWidth * 0.6}%` }}
                aria-label={mode === 'hex' ? `Hex ${label}` : `${label}${octave}`}
              >
                <span className="piano-key-label">
                  {label}
                  <span className="text-[10px] opacity-60">{octave}</span>
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
        className="w-full bg-dark-bgSecondary rounded-t-2xl p-4 safe-area-bottom"
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
