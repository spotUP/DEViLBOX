/**
 * PadGrid - 4x4 grid of drum pads (MPC-style)
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from './PadButton';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';

interface PadGridProps {
  onPadSelect: (padId: number) => void;
  selectedPadId: number | null;
}

export const PadGrid: React.FC<PadGridProps> = ({
  onPadSelect,
  selectedPadId,
}) => {
  // Track velocity for each pad (for visual feedback)
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});

  const { programs, currentProgramId } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);

  // Audio engine instance
  const engineRef = useRef<DrumPadEngine | null>(null);

  // Initialize audio engine with singleton AudioContext
  useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);

    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  const handlePadTrigger = useCallback(async (padId: number, velocity: number) => {
    // Update velocity for visual feedback
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));

    // Ensure AudioContext is resumed (browser autoplay policy)
    await resumeAudioContext();

    // Trigger audio playback
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        engineRef.current.triggerPad(pad, velocity);
      }
    }

    // Fade out velocity indicator after a short delay
    setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
    }, 200);
  }, [currentProgram]);

  // Arrange pads in 4x4 grid (memoized for performance)
  const rows = useMemo(() => {
    if (!currentProgram) return [];
    return [
      currentProgram.pads.slice(0, 4),
      currentProgram.pads.slice(4, 8),
      currentProgram.pads.slice(8, 12),
      currentProgram.pads.slice(12, 16),
    ];
  }, [currentProgram]);

  if (!currentProgram) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        No program loaded
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {/* Program info */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-white">{currentProgram.name}</div>
          <div className="text-xs text-text-muted font-mono">{currentProgram.id}</div>
        </div>
        <div className="text-xs text-text-muted">
          {currentProgram.pads.filter(p => p.sample !== null).length} / 16 pads loaded
        </div>
      </div>

      {/* 4x4 Pad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {rows.flat().map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            isSelected={selectedPadId === pad.id}
            velocity={padVelocities[pad.id] || 0}
            onTrigger={handlePadTrigger}
            onSelect={onPadSelect}
          />
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="text-[10px] text-text-muted text-center mt-2 font-mono">
        Click pads to trigger • Shift+Click to select for editing
      </div>
    </div>
  );
};
