/**
 * AcidPatternEditor - Up to 32-Step Pattern Editor for TB-303
 *
 * db303-style acid bassline pattern editor with:
 * - Up to 32 steps with note, relative octave, accent, slide, gate, mute, hammer
 * - Visual step indicator during playback
 * - Pattern management (save/load/clear/randomize)
 * - TT-303 extensions: mute (silent step) and hammer (legato without glide)
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

  const handleMuteToggle = (step: number) => {
    pattern.setMute(step, !pattern.getMute(step));
    if (onChange) onChange(pattern);
  };

  const handleHammerToggle = (step: number) => {
    pattern.setHammer(step, !pattern.getHammer(step));
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
                {gate && !note.mute ? `${noteNames[note.key]}${note.octave > 0 ? '+' : ''}${note.octave}` : note.mute ? 'MUT' : '---'}
              </div>

              {/* Flags */}
              <div className="flex justify-center gap-1 mt-1">
                {note.accent && (
                  <span className="text-xs text-ft2-highlight">A</span>
                )}
                {note.slide && (
                  <span className="text-xs text-ft2-highlight">S</span>
                )}
                {note.mute && (
                  <span className="text-xs text-yellow-400">M</span>
                )}
                {note.hammer && (
                  <span className="text-xs text-cyan-400">H</span>
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
                    Octave (relative)
                  </label>
                  <select
                    value={pattern.getOctave(selectedStep)}
                    onChange={(e) => handleOctaveChange(selectedStep, parseInt(e.target.value))}
                    className="w-full bg-ft2-bg text-ft2-text border border-ft2-border rounded p-2"
                  >
                    <option value="-1">-1 (Down)</option>
                    <option value="0">0 (Root)</option>
                    <option value="1">+1 (Up)</option>
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

                {/* Mute - TT-303 extension */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pattern.getMute(selectedStep)}
                      onChange={() => handleMuteToggle(selectedStep)}
                      className="w-4 h-4"
                    />
                    <span className="text-ft2-text">Mute</span>
                    <span className="text-xs text-ft2-textDim">(silent step)</span>
                  </label>
                </div>

                {/* Hammer - TT-303 extension */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pattern.getHammer(selectedStep)}
                      onChange={() => handleHammerToggle(selectedStep)}
                      className="w-4 h-4"
                    />
                    <span className="text-ft2-text">Hammer</span>
                    <span className="text-xs text-ft2-textDim">(legato, no slide)</span>
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
