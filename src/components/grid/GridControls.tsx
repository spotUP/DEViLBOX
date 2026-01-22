/**
 * GridControls - Control bar for the grid sequencer
 *
 * Provides octave selection, pattern length, scale selection, clear, and random generation.
 */

import React, { useState } from 'react';
import { Trash2, Shuffle, ChevronUp, ChevronDown, Cable, Wand2 } from 'lucide-react';
import { ScaleSelector } from './ScaleSelector';
import { MIDILearnPanel } from './MIDILearnPanel';

interface GridControlsProps {
  baseOctave: number;
  onBaseOctaveChange: (octave: number) => void;
  maxSteps: number;
  onMaxStepsChange: (steps: number) => void;
  onResizeAllPatterns: (steps: number) => void;
  scaleKey: string;
  rootNote: number;
  onScaleChange: (scaleKey: string) => void;
  onRootNoteChange: (rootNote: number) => void;
  onClearAll: () => void;
  onRandomize?: () => void;
  onAcidGenerator?: () => void;
}

export const GridControls: React.FC<GridControlsProps> = ({
  baseOctave,
  onBaseOctaveChange,
  maxSteps,
  onMaxStepsChange,
  onResizeAllPatterns,
  scaleKey,
  rootNote,
  onScaleChange,
  onRootNoteChange,
  onClearAll,
  onRandomize,
  onAcidGenerator,
}) => {
  const [showMIDIPanel, setShowMIDIPanel] = useState(false);

  return (
    <>
      <div className="flex items-center gap-4 p-2 bg-dark-bgSecondary border-b border-dark-border">
      {/* Base Octave */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted uppercase">Octave</span>
        <div className="flex items-center">
          <button
            onClick={() => onBaseOctaveChange(Math.max(1, baseOctave - 1))}
            disabled={baseOctave <= 1}
            className="p-1 rounded hover:bg-dark-bgActive text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown size={14} />
          </button>
          <span className="w-8 text-center text-sm font-mono text-text-primary">
            {baseOctave}
          </span>
          <button
            onClick={() => onBaseOctaveChange(Math.min(6, baseOctave + 1))}
            disabled={baseOctave >= 6}
            className="p-1 rounded hover:bg-dark-bgActive text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp size={14} />
          </button>
        </div>
        <span className="text-xs text-text-muted">
          C{baseOctave} - C{baseOctave + 2}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-dark-border" />

      {/* Pattern Length */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted uppercase">Steps</span>
        <select
          value={maxSteps}
          onChange={(e) => onMaxStepsChange(Number(e.target.value))}
          className="px-2 py-1 text-sm bg-dark-bgTertiary border border-dark-border rounded text-text-primary"
        >
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={12}>12</option>
          <option value={16}>16</option>
          <option value={24}>24</option>
          <option value={32}>32</option>
          <option value={64}>64</option>
        </select>
        <button
          onClick={() => onResizeAllPatterns(maxSteps)}
          className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-dark-bgActive rounded transition-colors"
          title="Apply this step count to all patterns"
        >
          Apply All
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-dark-border" />

      {/* Scale Selection */}
      <ScaleSelector
        scaleKey={scaleKey}
        rootNote={rootNote}
        onScaleChange={onScaleChange}
        onRootNoteChange={onRootNoteChange}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-dark-border" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowMIDIPanel(!showMIDIPanel)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            showMIDIPanel
              ? 'bg-accent-primary text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgActive'
          }`}
          title="MIDI Learn"
        >
          <Cable size={12} />
          MIDI
        </button>
        {onAcidGenerator && (
          <button
            onClick={onAcidGenerator}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-dark-bgActive rounded transition-colors"
            title="Generate 303 acid pattern"
          >
            <Wand2 size={12} />
            Acid
          </button>
        )}
        {onRandomize && (
          <button
            onClick={onRandomize}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-dark-bgActive rounded transition-colors"
            title="Generate random pattern"
          >
            <Shuffle size={12} />
            Random
          </button>
        )}
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-accent-error hover:bg-accent-error/10 rounded transition-colors"
          title="Clear all steps"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
    </div>

    {/* MIDI Learn Panel (collapsible) */}
    {showMIDIPanel && (
      <div className="border-b border-dark-border p-3 bg-dark-bg">
        <MIDILearnPanel onClose={() => setShowMIDIPanel(false)} />
      </div>
    )}
    </>
  );
};
