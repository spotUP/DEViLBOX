/**
 * PianoPopover - Piano keyboard note selector for TB-303 sequencer
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import type { TB303Step } from './TB303Sequencer';
import { getToneEngine } from '@engine/ToneEngine';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import './PianoPopover.css';

interface PianoPopoverProps {
  step: TB303Step;
  stepIndex: number;
  position: { x: number; y: number };
  onChange: (updates: Partial<TB303Step>) => void;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  unitId?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#

export const PianoPopover: React.FC<PianoPopoverProps> = ({
  step,
  stepIndex,
  position,
  onChange,
  onClose,
  onNavigate,
  unitId = 1,
}) => {
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleNoteClick = useCallback((note: string) => {
    onChange({ note });
    // Preview sound if enabled
    if (previewEnabled) {
      try {
        const engine = getToneEngine();
        const instrument = useInstrumentStore.getState().instruments.find(i => i.id === unitId);
        if (instrument && engine) {
          // Build full note with octave (default octave 2 for TB-303 range)
          const noteOctave = step.octave ?? 2;
          const fullNote = `${note}${noteOctave}`;
          // Trigger a short preview note
          engine.triggerNote(unitId, fullNote, 0.2, Tone.now(), 0.8, instrument, step.accent, step.slide);
        }
      } catch (e) {
        // Silently ignore preview errors
        console.debug('[PianoPopover] Preview error:', e);
      }
    }
  }, [onChange, previewEnabled, unitId, step.octave, step.accent, step.slide]);

  const handleOctaveClick = useCallback((targetOct: number) => {
    const newOct = step.octave === targetOct ? 2 : targetOct;
    onChange({ octave: newOct });
  }, [step.octave, onChange]);

  const handleToggle = useCallback((prop: 'accent' | 'slide' | 'mute' | 'hammer') => {
    onChange({ [prop]: !step[prop] });
  }, [step, onChange]);

  // Position the popover
  const style: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: 'translate(-50%, -100%) translateY(-10px)',
    zIndex: 10000,
  };

  return (
    <>
      {/* Overlay */}
      <div className="piano-popover-overlay" />

      {/* Popover */}
      <div ref={popoverRef} className="piano-popover" style={style}>
        {/* Header */}
        <div className="popover-header">
          <div className="step-navigation">
            <button
              className="nav-btn"
              onClick={() => onNavigate('prev')}
              aria-label="Previous step"
            >
              ‹
            </button>
            <div className="step-indicator">
              Step {(stepIndex + 1).toString().padStart(2, '0')}
            </div>
            <button
              className="nav-btn"
              onClick={() => onNavigate('next')}
              aria-label="Next step"
            >
              ›
            </button>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div className="popover-controls">
          {/* Octave Selector */}
          <div className="control-group">
            <div className="control-label">Octave</div>
            <div className="octave-selector">
              <button
                className={`octave-select-btn ${step.octave === 1 ? 'active' : ''}`}
                onClick={() => handleOctaveClick(1)}
              >
                DN
              </button>
              <button
                className={`octave-select-btn ${step.octave === 2 ? 'active' : ''}`}
                onClick={() => handleOctaveClick(2)}
              >
                MID
              </button>
              <button
                className={`octave-select-btn ${step.octave === 3 ? 'active' : ''}`}
                onClick={() => handleOctaveClick(3)}
              >
                UP
              </button>
            </div>
          </div>

          {/* Modifiers */}
          <div className="control-group">
            <div className="control-label">Modifiers</div>
            <div className="modifier-toggles">
              <button
                className={`modifier-btn accent ${step.accent ? 'active' : ''}`}
                onClick={() => handleToggle('accent')}
              >
                <span>AC</span>
              </button>
              <button
                className={`modifier-btn slide ${step.slide ? 'active' : ''}`}
                onClick={() => handleToggle('slide')}
              >
                <span>SL</span>
              </button>
            </div>
          </div>

          {/* TT-303 Extensions */}
          <div className="control-group">
            <div className="control-label">TT-303</div>
            <div className="modifier-toggles">
              <button
                className={`modifier-btn mute ${step.mute ? 'active' : ''}`}
                onClick={() => handleToggle('mute')}
                title="Mute - silent step, data preserved"
              >
                <span>MT</span>
              </button>
              <button
                className={`modifier-btn hammer ${step.hammer ? 'active' : ''}`}
                onClick={() => handleToggle('hammer')}
                title="Hammer - legato without pitch glide"
              >
                <span>HM</span>
              </button>
            </div>
          </div>

          {/* Preview Toggle */}
          <div className="preview-toggle">
            <input
              type="checkbox"
              id={`preview-${unitId}-${stepIndex}`}
              checked={previewEnabled}
              onChange={(e) => setPreviewEnabled(e.target.checked)}
            />
            <label htmlFor={`preview-${unitId}-${stepIndex}`}>
              Preview Sound
            </label>
          </div>
        </div>

        {/* Piano Keyboard */}
        <div className="piano-keyboard-container">
          {/* White keys layer (flex) */}
          <div className="piano-keyboard-white-layer">
            {NOTE_NAMES.map((note, i) => {
              if (BLACK_KEYS.includes(i)) return null;
              const isSelected = step.note === note;
              return (
                <div
                  key={note}
                  className={`piano-key white ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleNoteClick(note)}
                >
                  <div className="key-label">{note}</div>
                </div>
              );
            })}
          </div>
          
          {/* Black keys layer (absolute) */}
          <div className="piano-keyboard-black-layer">
            {NOTE_NAMES.map((note, i) => {
              if (!BLACK_KEYS.includes(i)) return null;
              const isSelected = step.note === note;
              
              // Calculate horizontal position
              const whiteKeysBefore = NOTE_NAMES.slice(0, i).filter((_, idx) => !BLACK_KEYS.includes(idx)).length;
              const whiteKeyWidth = 100 / 7; // 7 white keys in octave
              const leftPos = (whiteKeysBefore * whiteKeyWidth) - (whiteKeyWidth * 0.25);

              return (
                <div
                  key={note}
                  className={`piano-key black ${isSelected ? 'selected' : ''}`}
                  style={{ left: `${leftPos}%`, width: `${whiteKeyWidth * 0.6}%` }}
                  onClick={() => handleNoteClick(note)}
                >
                  <div className="key-label">{note}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
