/**
 * TB303Sequencer - 16-step acid bassline sequencer
 * Inspired by acidBros with glass-morphism design
 */

import React, { useState, useCallback, useRef } from 'react';
import { PianoPopover } from './PianoPopover';
import './TB303Sequencer.css';

export interface TB303Step {
  active: boolean;
  note: string; // 'C', 'C#', 'D', etc.
  octave: number; // 1, 2, or 3
  accent: boolean;
  slide: boolean;
}

interface TB303SequencerProps {
  steps: TB303Step[];
  currentStep?: number;
  isPlaying?: boolean;
  onStepChange?: (stepIndex: number, step: TB303Step) => void;
  onStepToggle?: (stepIndex: number) => void;
  unitId?: number; // 1 or 2
}

export const TB303Sequencer: React.FC<TB303SequencerProps> = ({
  steps,
  currentStep = -1,
  isPlaying = false,
  onStepChange,
  onStepToggle,
  unitId = 1,
}) => {
  const [popoverState, setPopoverState] = useState<{
    visible: boolean;
    stepIndex: number;
    x: number;
    y: number;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const handleStepClick = useCallback((index: number) => {
    if (onStepToggle) {
      onStepToggle(index);
    }
  }, [onStepToggle]);

  const handleNoteClick = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverState({
      visible: true,
      stepIndex: index,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  const handleOctaveToggle = useCallback((e: React.MouseEvent, index: number, targetOct: number) => {
    e.stopPropagation();
    if (!onStepChange) return;

    const step = steps[index];
    const newOct = step.octave === targetOct ? 2 : targetOct;
    onStepChange(index, { ...step, octave: newOct });
  }, [steps, onStepChange]);

  const handleToggle = useCallback((e: React.MouseEvent, index: number, prop: 'accent' | 'slide') => {
    e.stopPropagation();
    if (!onStepChange) return;

    const step = steps[index];
    onStepChange(index, { ...step, [prop]: !step[prop] });
  }, [steps, onStepChange]);

  const handlePopoverChange = useCallback((stepIndex: number, updates: Partial<TB303Step>) => {
    if (!onStepChange) return;
    const step = steps[stepIndex];
    onStepChange(stepIndex, { ...step, ...updates });
  }, [steps, onStepChange]);

  const handlePopoverClose = useCallback(() => {
    setPopoverState(null);
  }, []);

  const handlePopoverNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!popoverState) return;

    const newIndex = direction === 'prev'
      ? (popoverState.stepIndex - 1 + 16) % 16
      : (popoverState.stepIndex + 1) % 16;

    setPopoverState({ ...popoverState, stepIndex: newIndex });
  }, [popoverState]);

  return (
    <>
      <div ref={gridRef} className="tb303-sequencer">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`
              tb303-step
              ${step.active ? 'active' : ''}
              ${isPlaying && i === currentStep ? 'current' : ''}
            `}
            onClick={() => handleStepClick(i)}
          >
            {/* LED Indicator */}
            <div className="step-led" />

            {/* Note Display */}
            <div
              className="step-note"
              onClick={(e) => handleNoteClick(e, i)}
            >
              {step.note}
            </div>

            {/* Octave Controls */}
            <div className="step-octave-btns">
              <div
                className={`octave-btn ${step.octave === 1 ? 'active' : ''}`}
                onClick={(e) => handleOctaveToggle(e, i, 1)}
              >
                DN
              </div>
              <div
                className={`octave-btn ${step.octave === 3 ? 'active' : ''}`}
                onClick={(e) => handleOctaveToggle(e, i, 3)}
              >
                UP
              </div>
            </div>

            {/* Accent & Slide Controls */}
            <div className="step-toggles">
              <div
                className={`toggle-btn accent ${step.accent ? 'active' : ''}`}
                onClick={(e) => handleToggle(e, i, 'accent')}
              >
                AC
              </div>
              <div
                className={`toggle-btn slide ${step.slide ? 'active' : ''}`}
                onClick={(e) => handleToggle(e, i, 'slide')}
              >
                SL
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Piano Popover */}
      {popoverState?.visible && (
        <PianoPopover
          step={steps[popoverState.stepIndex]}
          stepIndex={popoverState.stepIndex}
          position={{ x: popoverState.x, y: popoverState.y }}
          onChange={(updates) => handlePopoverChange(popoverState.stepIndex, updates)}
          onClose={handlePopoverClose}
          onNavigate={handlePopoverNavigate}
          unitId={unitId}
        />
      )}
    </>
  );
};
