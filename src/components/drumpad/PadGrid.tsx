/**
 * PadGrid - 4x4 grid of drum pads (MPC-style)
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from './PadButton';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';
import { useOrientation } from '@hooks/useOrientation';
import type { ScratchActionId } from '../../types/drumpad';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '../../engine/keyboard/commands/djScratch';

const SCRATCH_ACTION_HANDLERS: Record<ScratchActionId, () => boolean> = {
  // Basic patterns
  scratch_baby:     djScratchBaby,
  scratch_trans:    djScratchTrans,
  scratch_flare:    djScratchFlare,
  scratch_hydro:    djScratchHydro,
  scratch_crab:     djScratchCrab,
  scratch_orbit:    djScratchOrbit,
  // Extended patterns
  scratch_chirp:    djScratchChirp,
  scratch_stab:     djScratchStab,
  scratch_scribble: djScratchScrbl,
  scratch_tear:     djScratchTear,
  // Advanced patterns
  scratch_uzi:      djScratchUzi,
  scratch_twiddle:  djScratchTwiddle,
  scratch_8crab:    djScratch8Crab,
  scratch_3flare:   djScratch3Flare,
  scratch_laser:    djScratchLaser,
  scratch_phaser:   djScratchPhaser,
  scratch_tweak:    djScratchTweak,
  scratch_drag:     djScratchDrag,
  scratch_vibrato:  djScratchVibrato,
  // Control
  scratch_stop:     djScratchStop,
  lfo_off:          djFaderLFOOff,
  lfo_14:           djFaderLFO14,
  lfo_18:           djFaderLFO18,
  lfo_116:          djFaderLFO116,
  lfo_132:          djFaderLFO132,
};

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

  // Track focused pad for keyboard navigation
  const [focusedPadId, setFocusedPadId] = useState<number>(1);

  const { isPortrait } = useOrientation();
  const gridCols = isPortrait ? 2 : 4; // 2x8 grid on portrait, 4x4 on landscape

  const { programs, currentProgramId } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);

  // Audio engine instance
  const engineRef = useRef<DrumPadEngine | null>(null);

  // Grid container ref for keyboard focus
  const gridRef = useRef<HTMLDivElement>(null);

  // Initialize audio engine + load persisted samples from IndexedDB
  useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);

    // Load persisted audio samples from IndexedDB
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);

    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  // Sync master level to engine whenever it changes
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]);

  // Sync bus levels from store to engine
  const busLevels = useDrumPadStore(s => s.busLevels);
  useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  const handlePadTrigger = useCallback(async (padId: number, velocity: number) => {
    // Update velocity for visual feedback
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));

    // Ensure AudioContext is resumed (browser autoplay policy)
    await resumeAudioContext();

    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        // Fire DJ scratch action if assigned (in addition to any sample)
        if (pad.scratchAction) {
          SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.();
        }
        // Trigger audio playback if sample is loaded
        if (pad.sample) {
          engineRef.current.triggerPad(pad, velocity);
        }
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

  // Keyboard navigation (arrow keys)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if focus is on input element
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      let newFocusedId = focusedPadId;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          newFocusedId = focusedPadId > 1 ? focusedPadId - 1 : 16;
          break;
        case 'ArrowRight':
          event.preventDefault();
          newFocusedId = focusedPadId < 16 ? focusedPadId + 1 : 1;
          break;
        case 'ArrowUp':
          event.preventDefault();
          newFocusedId = focusedPadId > 4 ? focusedPadId - 4 : focusedPadId + 12;
          break;
        case 'ArrowDown':
          event.preventDefault();
          newFocusedId = focusedPadId <= 12 ? focusedPadId + 4 : focusedPadId - 12;
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          // Trigger focused pad with medium velocity
          handlePadTrigger(focusedPadId, 100);
          break;
        case 'Tab':
          // Don't prevent default for Tab - let it navigate normally
          // Just update our focus state to match
          if (event.shiftKey) {
            newFocusedId = focusedPadId > 1 ? focusedPadId - 1 : 16;
          } else {
            newFocusedId = focusedPadId < 16 ? focusedPadId + 1 : 1;
          }
          break;
        default:
          return;
      }

      if (newFocusedId !== focusedPadId) {
        setFocusedPadId(newFocusedId);
        // Announce to screen readers
        const pad = currentProgram?.pads.find(p => p.id === newFocusedId);
        if (pad) {
          // Create hidden live region for announcements if it doesn't exist
          let liveRegion = document.getElementById('pad-navigation-announcer');
          if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'pad-navigation-announcer';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
          }
          liveRegion.textContent = `Pad ${pad.id}: ${pad.name}${pad.sample ? '' : ' (empty)'}`;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedPadId, currentProgram, handlePadTrigger]);

  if (!currentProgram) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        No program loaded
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {/* Program info + export/import */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-white">{currentProgram.name}</div>
          <div className="text-xs text-text-muted font-mono">{currentProgram.id}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => engineRef.current?.stopAll()}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-red-400 bg-dark-surface border border-dark-border rounded transition-colors"
            title="Stop all playing pads"
          >
            Stop All
          </button>
          <button
            onClick={async () => {
              const blob = await useDrumPadStore.getState().exportAllConfigs();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${currentProgram.name || 'drumpad'}.dvbpads`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-white bg-dark-surface border border-dark-border rounded transition-colors"
            title="Export all programs + samples"
          >
            Export
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.dvbpads';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const audioContext = getAudioContext();
                  await useDrumPadStore.getState().importConfigs(file, audioContext);
                } catch (err) {
                  console.error('[PadGrid] Import failed:', err);
                }
              };
              input.click();
            }}
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-white bg-dark-surface border border-dark-border rounded transition-colors"
            title="Import programs + samples (.dvbpads)"
          >
            Import
          </button>
          <div className="text-xs text-text-muted">
            {currentProgram.pads.filter(p => p.sample !== null).length} / 16
          </div>
        </div>
      </div>

      {/* Responsive Pad Grid (4x4 landscape, 2x8 portrait) */}
      <div
        ref={gridRef}
        className={`grid gap-2 ${gridCols === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}
        role="grid"
        aria-label="Drum pad grid"
      >
        {rows.flat().map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            isSelected={selectedPadId === pad.id}
            isFocused={focusedPadId === pad.id}
            velocity={padVelocities[pad.id] || 0}
            onTrigger={handlePadTrigger}
            onSelect={onPadSelect}
            onFocus={() => setFocusedPadId(pad.id)}
          />
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="text-[10px] text-text-muted text-center mt-2 font-mono">
        Click/Enter to trigger • Shift+Click to select • Arrow keys to navigate
      </div>
    </div>
  );
};
