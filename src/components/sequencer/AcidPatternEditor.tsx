/**
 * AcidPatternEditor - 16-Step Pattern Editor for TB-303
 *
 * Classic acid bassline pattern editor with:
 * - 16 steps with note, octave, accent, slide, gate
 * - Visual step indicator during playback
 * - Pattern management (save/load/clear/randomize)
 */

import React, { useState } from 'react';
import { AcidPattern } from '@engine/AcidSequencer';

interface AcidPatternEditorProps {
  pattern: AcidPattern;
  currentStep?: number;
  isPlaying?: boolean;
  onChange?: (pattern: AcidPattern) => void;
}

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const AcidPatternEditor: React.FC<AcidPatternEditorProps> = ({
  pattern,
  currentStep = -1,
  isPlaying = false,
  onChange,
}) => {
  const [selectedStep, setSelectedStep] = useState(0);
  const numSteps = pattern.getNumSteps();

  const handleNoteChange = (step: number, key: number) => {
    pattern.setKey(step, key);
    if (onChange) onChange(pattern);
  };

  const handleOctaveChange = (step: number, octave: number) => {
    pattern.setOctave(step, octave);
    if (onChange) onChange(pattern);
  };

  const handleAccentToggle = (step: number) => {
    pattern.setAccent(step, !pattern.getAccent(step));
    if (onChange) onChange(pattern);
  };

  const handleSlideToggle = (step: number) => {
    pattern.setSlide(step, !pattern.getSlide(step));
    if (onChange) onChange(pattern);
  };

  const handleGateToggle = (step: number) => {
    pattern.setGate(step, !pattern.getGate(step));
    if (onChange) onChange(pattern);
  };

  const handleClear = () => {
    pattern.clear();
    if (onChange) onChange(pattern);
  };

  const handleRandomize = () => {
    pattern.randomize();
    if (onChange) onChange(pattern);
  };

  return (
    <div className="space-y-4">
      {/* Pattern Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleClear}
          className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
        >
          Clear
        </button>
        <button
          onClick={handleRandomize}
          className="px-3 py-1 bg-ft2-header text-white rounded hover:bg-ft2-cursor hover:text-ft2-bg"
        >
          Randomize
        </button>
      </div>

      {/* Step Grid */}
      <div className="grid grid-cols-16 gap-1">
        {Array.from({ length: numSteps }).map((_, step) => {
          const note = pattern.getNote(step);
          if (!note) return null;

          const isCurrentStep = isPlaying && step === currentStep;
          const isSelected = step === selectedStep;
          const gate = note.gate;

          return (
            <div
              key={step}
              onClick={() => setSelectedStep(step)}
              className={`
                border-2 p-2 cursor-pointer rounded transition-colors
                ${isCurrentStep ? 'border-ft2-highlight bg-ft2-cursor' : ''}
                ${isSelected && !isCurrentStep ? 'border-ft2-cursor' : 'border-ft2-border'}
                ${gate ? 'bg-ft2-panel' : 'bg-ft2-bg opacity-50'}
                hover:border-ft2-highlight
              `}
            >
              {/* Step number */}
              <div className="text-xs text-ft2-textDim text-center mb-1">
                {step + 1}
              </div>

              {/* Note */}
              <div className="text-sm text-ft2-text text-center font-mono">
                {gate ? `${noteNames[note.key]}${note.octave + 2}` : '---'}
              </div>

              {/* Flags */}
              <div className="flex justify-center gap-1 mt-1">
                {note.accent && (
                  <span className="text-xs text-ft2-highlight">A</span>
                )}
                {note.slide && (
                  <span className="text-xs text-ft2-highlight">S</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Editor */}
      {selectedStep >= 0 && selectedStep < numSteps && (
        <div className="border border-ft2-border rounded p-4 bg-ft2-panel">
          <h3 className="text-ft2-highlight font-bold mb-3">
            Step {selectedStep + 1}
          </h3>

          <div className="space-y-3">
            {/* Gate */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pattern.getGate(selectedStep)}
                  onChange={() => handleGateToggle(selectedStep)}
                  className="w-4 h-4"
                />
                <span className="text-ft2-text">Gate</span>
              </label>
            </div>

            {pattern.getGate(selectedStep) && (
              <>
                {/* Note */}
                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Note
                  </label>
                  <select
                    value={pattern.getKey(selectedStep)}
                    onChange={(e) => handleNoteChange(selectedStep, parseInt(e.target.value))}
                    className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded p-2"
                  >
                    {noteNames.map((name, key) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Octave */}
                <div>
                  <label className="block text-ft2-textDim text-sm mb-1">
                    Octave
                  </label>
                  <select
                    value={pattern.getOctave(selectedStep)}
                    onChange={(e) => handleOctaveChange(selectedStep, parseInt(e.target.value))}
                    className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded p-2"
                  >
                    <option value="0">2 (C2-B2)</option>
                    <option value="1">3 (C3-B3)</option>
                    <option value="2">4 (C4-B4)</option>
                    <option value="3">5 (C5-B5)</option>
                  </select>
                </div>

                {/* Accent */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pattern.getAccent(selectedStep)}
                      onChange={() => handleAccentToggle(selectedStep)}
                      className="w-4 h-4"
                    />
                    <span className="text-ft2-text">Accent</span>
                  </label>
                </div>

                {/* Slide */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pattern.getSlide(selectedStep)}
                      onChange={() => handleSlideToggle(selectedStep)}
                      className="w-4 h-4"
                    />
                    <span className="text-ft2-text">Slide</span>
                  </label>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
