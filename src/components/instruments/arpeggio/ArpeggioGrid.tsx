/**
 * ArpeggioGrid - Tracker-style 16-row grid editor
 *
 * Features:
 * - Visual step display with current position indicator
 * - Editable columns: Step#, Note Offset, Volume, Gate, Effect
 * - Keyboard navigation (arrow keys, Tab)
 * - Add/remove steps
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import type { ArpeggioStep } from '@typedefs/instrument';
import { ArpeggioStepCell } from './ArpeggioStepCell';

interface ArpeggioGridProps {
  steps: ArpeggioStep[];
  currentStep: number;
  isPlaying: boolean;
  onChange: (steps: ArpeggioStep[]) => void;
  maxSteps?: number;
}

export const ArpeggioGrid: React.FC<ArpeggioGridProps> = ({
  steps,
  currentStep,
  isPlaying,
  onChange,
  maxSteps = 16,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(steps.length - 1, i + 1));
          break;
        case 'Delete':
        case 'Backspace':
          if (steps.length > 1) {
            e.preventDefault();
            // Inline the remove logic to avoid stale closure
            const newSteps = steps.filter((_, i) => i !== selectedIndex);
            onChange(newSteps);
            setSelectedIndex(Math.min(selectedIndex, newSteps.length - 1));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [steps, selectedIndex, onChange]);

  const handleUpdateStep = useCallback((index: number, step: ArpeggioStep) => {
    const newSteps = [...steps];
    newSteps[index] = step;
    onChange(newSteps);
  }, [steps, onChange]);

  const handleAddStep = () => {
    if (steps.length >= maxSteps) return;
    const lastStep = steps[steps.length - 1] || { noteOffset: 0 };
    onChange([...steps, { noteOffset: lastStep.noteOffset }]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    const newSteps = steps.filter((_, i) => i !== index);
    onChange(newSteps);
    setSelectedIndex(Math.min(index, newSteps.length - 1));
  };

  const handleClearStep = (index: number) => {
    handleUpdateStep(index, { noteOffset: 0 });
  };

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2rem_3rem_2rem_2rem_2rem] gap-px text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center justify-center py-1.5">#</div>
        <div className="flex items-center justify-center py-1.5">Note</div>
        <div className="flex items-center justify-center py-1.5" title="Volume">Vol</div>
        <div className="flex items-center justify-center py-1.5" title="Gate Length">Gt</div>
        <div className="flex items-center justify-center py-1.5" title="Effect">FX</div>
      </div>

      {/* Steps */}
      <div className="max-h-[240px] overflow-y-auto">
        {steps.map((step, index) => (
          <ArpeggioStepCell
            key={index}
            stepIndex={index}
            step={step}
            isActive={isPlaying && currentStep === index}
            isSelected={selectedIndex === index}
            onUpdate={(s) => handleUpdateStep(index, s)}
            onSelect={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-800/30 border-t border-gray-800">
        <div className="text-[10px] text-gray-500">
          {steps.length}/{maxSteps} steps
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleClearStep(selectedIndex)}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear selected step"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => handleRemoveStep(selectedIndex)}
            disabled={steps.length <= 1}
            className={`
              p-1 transition-colors
              ${steps.length <= 1
                ? 'text-gray-700 cursor-not-allowed'
                : 'text-gray-500 hover:text-red-400'
              }
            `}
            title="Remove step"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={handleAddStep}
            disabled={steps.length >= maxSteps}
            className={`
              p-1 transition-colors
              ${steps.length >= maxSteps
                ? 'text-gray-700 cursor-not-allowed'
                : 'text-gray-500 hover:text-green-400'
              }
            `}
            title="Add step"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
