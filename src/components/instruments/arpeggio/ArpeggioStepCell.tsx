/**
 * ArpeggioStepCell - Individual step cell for the tracker-style grid
 */

import React, { useState, useRef, useEffect } from 'react';
import type { ArpeggioStep } from '@typedefs/instrument';

interface ArpeggioStepCellProps {
  stepIndex: number;
  step: ArpeggioStep;
  isActive: boolean;
  isSelected: boolean;
  onUpdate: (step: ArpeggioStep) => void;
  onSelect: () => void;
}

// Note name helper
const getNoteOffset = (semitones: number): string => {
  const absVal = Math.abs(semitones);
  const octave = Math.floor(absVal / 12);
  const noteInOctave = absVal % 12;
  const notes = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];

  if (semitones === 0) return 'R';

  const sign = semitones < 0 ? '-' : '+';
  if (octave >= 1) {
    return `${sign}${octave}o${noteInOctave > 0 ? '+' + noteInOctave : ''}`;
  }
  return notes[noteInOctave] || `${sign}${absVal}`;
};

// Format volume display
const formatVolume = (vol?: number): string => {
  if (vol === undefined || vol === 100) return '--';
  return String(vol).padStart(2, '0');
};

// Format gate display
const formatGate = (gate?: number): string => {
  if (gate === undefined || gate === 100) return '--';
  return String(gate).padStart(2, '0');
};

// Get effect abbreviation
const getEffectAbbrev = (effect?: ArpeggioStep['effect']): string => {
  switch (effect) {
    case 'accent': return 'AC';
    case 'slide': return 'SL';
    case 'skip': return 'SK';
    default: return '--';
  }
};

export const ArpeggioStepCell: React.FC<ArpeggioStepCellProps> = ({
  stepIndex,
  step,
  isActive,
  isSelected,
  onUpdate,
  onSelect,
}) => {
  const [editingField, setEditingField] = useState<'offset' | 'volume' | 'gate' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const handleDoubleClick = (field: 'offset' | 'volume' | 'gate') => {
    setEditingField(field);
    if (field === 'offset') {
      setEditValue(String(step.noteOffset));
    } else if (field === 'volume') {
      setEditValue(String(step.volume ?? 100));
    } else if (field === 'gate') {
      setEditValue(String(step.gate ?? 100));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const commitEdit = () => {
    const value = parseInt(editValue, 10);
    if (!isNaN(value)) {
      if (editingField === 'offset') {
        onUpdate({ ...step, noteOffset: Math.max(-24, Math.min(36, value)) });
      } else if (editingField === 'volume') {
        onUpdate({ ...step, volume: Math.max(0, Math.min(100, value)) });
      } else if (editingField === 'gate') {
        onUpdate({ ...step, gate: Math.max(0, Math.min(100, value)) });
      }
    }
    setEditingField(null);
  };

  const cycleEffect = () => {
    const effects: ArpeggioStep['effect'][] = ['none', 'accent', 'slide', 'skip'];
    const currentIndex = effects.indexOf(step.effect || 'none');
    const nextEffect = effects[(currentIndex + 1) % effects.length];
    onUpdate({ ...step, effect: nextEffect === 'none' ? undefined : nextEffect });
  };

  const adjustOffset = (delta: number) => {
    onUpdate({
      ...step,
      noteOffset: Math.max(-24, Math.min(36, step.noteOffset + delta)),
    });
  };

  return (
    <div
      onClick={onSelect}
      className={`
        grid grid-cols-[2rem_3rem_2rem_2rem_2rem] gap-px text-[10px] font-mono
        border-b border-gray-800 cursor-pointer transition-colors
        ${isActive ? 'bg-yellow-500/30' : isSelected ? 'bg-blue-500/20' : 'hover:bg-gray-800/50'}
      `}
    >
      {/* Step number */}
      <div
        className={`
          flex items-center justify-center py-1
          ${isActive ? 'text-yellow-400 font-bold' : 'text-gray-600'}
        `}
      >
        {String(stepIndex).padStart(2, '0')}
      </div>

      {/* Note offset */}
      <div
        className={`
          flex items-center justify-center py-1 cursor-text
          ${step.noteOffset > 0 ? 'text-green-400' : step.noteOffset < 0 ? 'text-red-400' : 'text-white'}
        `}
        onDoubleClick={() => handleDoubleClick('offset')}
        onWheel={(e) => adjustOffset(e.deltaY > 0 ? -1 : 1)}
      >
        {editingField === 'offset' ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="w-full bg-transparent text-center outline-none"
          />
        ) : (
          <span>
            {step.noteOffset >= 0 ? '+' : ''}{step.noteOffset}
            <span className="text-gray-600 ml-0.5">{getNoteOffset(step.noteOffset)}</span>
          </span>
        )}
      </div>

      {/* Volume */}
      <div
        className={`
          flex items-center justify-center py-1 cursor-text
          ${step.volume !== undefined && step.volume < 100 ? 'text-purple-400' : 'text-gray-600'}
        `}
        onDoubleClick={() => handleDoubleClick('volume')}
      >
        {editingField === 'volume' ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="w-full bg-transparent text-center outline-none"
          />
        ) : (
          formatVolume(step.volume)
        )}
      </div>

      {/* Gate */}
      <div
        className={`
          flex items-center justify-center py-1 cursor-text
          ${step.gate !== undefined && step.gate < 100 ? 'text-cyan-400' : 'text-gray-600'}
        `}
        onDoubleClick={() => handleDoubleClick('gate')}
      >
        {editingField === 'gate' ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="w-full bg-transparent text-center outline-none"
          />
        ) : (
          formatGate(step.gate)
        )}
      </div>

      {/* Effect */}
      <div
        className={`
          flex items-center justify-center py-1 cursor-pointer
          ${step.effect === 'accent' ? 'text-orange-400' :
            step.effect === 'slide' ? 'text-blue-400' :
            step.effect === 'skip' ? 'text-red-400' : 'text-gray-600'}
        `}
        onClick={(e) => {
          e.stopPropagation();
          cycleEffect();
        }}
      >
        {getEffectAbbrev(step.effect)}
      </div>
    </div>
  );
};
