/**
 * PadGrid - 4x4 grid of drum pads (MPC-style)
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from './PadButton';
import { ContextMenu, useContextMenu } from '@components/common/ContextMenu';
import { usePadContextMenu } from '@/hooks/drumpad/usePadContextMenu';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '../../engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '../../engine/drumpad/NoteRepeatEngine';
import { getAudioContext } from '../../audio/AudioContextSingleton';
import { getToneEngine } from '../../engine/ToneEngine';
import { useTransportStore } from '../../stores/useTransportStore';
import { useOrientation } from '@hooks/useOrientation';
import type { ScratchActionId, PadBank } from '../../types/drumpad';
import { getBankPads, applyVelocityCurve, PAD_INSTRUMENT_BASE } from '../../types/drumpad';
import { DJ_FX_ACTION_MAP } from '../../engine/drumpad/DjFxActions';
import { quantizeAction, getQuantizeMode } from '../../engine/dj/DJQuantizedFX';
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
  onEmptyPadClick?: (padId: number) => void;
  selectedPadId: number | null;
  performanceMode?: boolean;
}

export const PadGrid: React.FC<PadGridProps> = ({
  onPadSelect,
  onEmptyPadClick,
  selectedPadId,
  performanceMode = false,
}) => {
  // Context menu state
  const contextMenu = useContextMenu();
  const [contextMenuPadId, setContextMenuPadId] = useState<number | null>(null);

  // Pad mode from store
  const setFxPadActive = useDrumPadStore(s => s.setFxPadActive);

  // Track velocity for each pad (for visual feedback)
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const velocityTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Track pending synth release timeouts (clean up on unmount/bank switch)
  const pendingReleasesRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Track focused pad for keyboard navigation (uses bank-relative IDs)
  const [focusedPadId, setFocusedPadId] = useState<number>(1);

  // Ref for noteRepeatEnabled to avoid stale closure in callbacks
  const noteRepeatEnabledRef = useRef(false);

  // Track held pads for sustain mode
  const heldPadsRef = useRef<Set<number>>(new Set());

  // Current bank
  const { currentBank, setBank } = useDrumPadStore();

  const { isPortrait } = useOrientation();
  const gridCols = isPortrait ? 2 : 4; // 2x8 grid on portrait, 4x4 on landscape

  const { programs, currentProgramId } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);

  // Audio engine instance
  const engineRef = useRef<DrumPadEngine | null>(null);
  const noteRepeatRef = useRef<NoteRepeatEngine | null>(null);

  // Grid container ref for keyboard focus
  const gridRef = useRef<HTMLDivElement>(null);

  // Initialize audio engine + load persisted samples from IndexedDB
  useEffect(() => {
    const audioContext = getAudioContext();
    engineRef.current = new DrumPadEngine(audioContext);
    noteRepeatRef.current = new NoteRepeatEngine(engineRef.current);

    // Load persisted audio samples from IndexedDB
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);

    return () => {
      noteRepeatRef.current?.dispose();
      engineRef.current?.dispose();
      // Clean up pending synth release timers
      pendingReleasesRef.current.forEach(t => clearTimeout(t));
      pendingReleasesRef.current.clear();
      // Clean up velocity fade timers
      Object.values(velocityTimersRef.current).forEach(t => clearTimeout(t));
    };
  }, []);

  // Sync master level to engine whenever it changes
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]);

  // Sync mute groups to engine when program changes
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
    }
  }, [currentProgram]);

  // Sync note repeat state
  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);
  const bpm = useTransportStore(s => s.bpm);

  // Reset focused pad and clear visual state when bank changes
  // Also release all held pads to prevent audio leaking across banks
  useEffect(() => {
    const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
    setFocusedPadId(bankOffset + 1);
    setPadVelocities({});
    
    // Release all held pads when switching banks (direct cleanup, not via callback)
    heldPadsRef.current.forEach(padId => {
      // Stop note repeat
      noteRepeatRef.current?.stopRepeat(padId);
      
      if (currentProgram && engineRef.current) {
        const pad = currentProgram.pads.find(p => p.id === padId);
        if (pad) {
          // Disengage DJ FX
          if (pad.djFxAction) {
            DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
            setFxPadActive(padId, false);
          }
          // Stop sustain samples
          if (pad.playMode === 'sustain') {
            engineRef.current.stopPad(padId, pad.release / 1000);
            // Release synth voices
            if (pad.synthConfig || pad.instrumentId != null) {
              try {
                let instId: number;
                let config: any;
                if (pad.synthConfig) {
                  instId = PAD_INSTRUMENT_BASE + pad.id;
                  config = { ...pad.synthConfig, id: instId };
                } else {
                  instId = pad.instrumentId!;
                  config = useInstrumentStore.getState().getInstrument(instId);
                }
                if (config) {
                  const note = pad.instrumentNote || 'C3';
                  getToneEngine().triggerNoteRelease(instId, note, 0, config);
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
    });
    heldPadsRef.current.clear();
  }, [currentBank, currentProgram, setFxPadActive]);

  useEffect(() => {
    noteRepeatEnabledRef.current = noteRepeatEnabled;
    noteRepeatRef.current?.setEnabled(noteRepeatEnabled);
  }, [noteRepeatEnabled]);

  useEffect(() => {
    noteRepeatRef.current?.setRate(noteRepeatRate as NoteRepeatRate);
  }, [noteRepeatRate]);

  useEffect(() => {
    noteRepeatRef.current?.setBpm(bpm);
  }, [bpm]);

  // Sync bus levels from store to engine
  const busLevels = useDrumPadStore(s => s.busLevels);
  useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  const handlePadTrigger = useCallback((padId: number, velocity: number) => {
    // Fire audio FIRST — synchronously, before any React state updates.
    // The AudioContext is resumed on first user gesture; after that this is a no-op check.
    const ctx = getAudioContext();
    if (ctx.state === 'closed') return; // Cannot play on closed context
    if (ctx.state === 'suspended') {
      // Only needed once per session — fire-and-forget, don't await
      ctx.resume();
    }

    // Always use actual pad data (no more mode mappings)
    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        const curvedVelocity = applyVelocityCurve(velocity, pad.velocityCurve);

        if (pad.scratchAction) {
          SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.();
        }
        if (pad.djFxAction) {
          // Quantize FX triggers for rhythmic effects (stutter, delay, tape stop)
          // This prevents out-of-sync triggers during live performance
          const shouldQuantize = 
            pad.djFxAction.startsWith('fx_stutter') ||
            pad.djFxAction.startsWith('fx_dub_echo') ||
            pad.djFxAction.startsWith('fx_tape_echo') ||
            pad.djFxAction.startsWith('fx_ping_pong') ||
            pad.djFxAction === 'fx_tape_stop' ||
            pad.djFxAction === 'fx_vinyl_brake';

          const engageFx = () => {
            if (!pad.djFxAction) return;
            DJ_FX_ACTION_MAP[pad.djFxAction]?.engage();
            setFxPadActive(padId, true);
            heldPadsRef.current.add(padId);
          };

          if (shouldQuantize && getQuantizeMode() !== 'off') {
            // Use deck 'A' as reference for beat quantization
            quantizeAction('A', engageFx, { allowSolo: true, kind: 'play' });
          } else {
            // Non-rhythmic effects or quantize=off fire immediately
            engageFx();
          }
        }
        if (pad.sample) {
          engineRef.current.triggerPad(pad, curvedVelocity);
        }
        if (pad.synthConfig || pad.instrumentId != null) {
          try {
            const engine = getToneEngine();
            const note = pad.instrumentNote || 'C3';
            const normalizedVel = curvedVelocity / 127;
            
            // Determine instrument ID and config
            let instId: number;
            let config: any;
            
            if (pad.synthConfig) {
              instId = PAD_INSTRUMENT_BASE + pad.id;
              config = { ...pad.synthConfig, id: instId };
              
              // Debug logging for pad synths
              if (process.env.NODE_ENV === 'development') {
                console.log(`[PadGrid] Triggering pad ${pad.id} "${pad.name}":`, {
                  note,
                  synthType: config.synthType,
                  drumType: config.drumMachine?.drumType,
                  io808Type: config.parameters?.io808Type,
                  tr909Type: config.parameters?.tr909Type,
                  velocity: normalizedVel,
                });
              }
            } else {
              instId = pad.instrumentId!;
              config = useInstrumentStore.getState().getInstrument(instId);
              if (!config) return; // Instrument not found
            }
            
            // Trigger note
            engine.triggerNoteAttack(instId, note, 0, normalizedVel, config);
            
            // Auto-release for oneshot mode
            if (pad.playMode === 'oneshot') {
              const releaseDelayMs = Math.max(pad.decay, 100);
              const existingTimer = pendingReleasesRef.current.get(instId);
              if (existingTimer) clearTimeout(existingTimer);
              const timer = setTimeout(() => {
                try { engine.triggerNoteRelease(instId, note, 0, config); } catch { /* ignore */ }
                pendingReleasesRef.current.delete(instId);
              }, releaseDelayMs);
              pendingReleasesRef.current.set(instId, timer);
            }
          } catch (err) {
            console.warn('[PadGrid] Synth trigger failed:', err);
          }
        }
        if (pad.playMode === 'sustain') {
          heldPadsRef.current.add(padId);
        }
        if (noteRepeatEnabledRef.current && noteRepeatRef.current) {
          noteRepeatRef.current.startRepeat(pad, velocity);
          heldPadsRef.current.add(padId);
        }
      }
    }

    // Visual feedback AFTER audio — don't let React re-render delay the trigger
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));

    // Fade out velocity indicator — clear any pending timer for this pad first
    if (velocityTimersRef.current[padId]) {
      clearTimeout(velocityTimersRef.current[padId]);
    }
    velocityTimersRef.current[padId] = setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
      delete velocityTimersRef.current[padId];
    }, 200);
  }, [currentProgram, setFxPadActive]);

  const handlePadRelease = useCallback((padId: number) => {
    if (!heldPadsRef.current.has(padId)) return;
    heldPadsRef.current.delete(padId);

    // Stop note repeat
    noteRepeatRef.current?.stopRepeat(padId);

    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        // Disengage DJ FX on release
        if (pad.djFxAction) {
          DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
          setFxPadActive(padId, false);
        }
        if (pad.playMode === 'sustain') {
          // Release sample voice
          engineRef.current.stopPad(padId, pad.release / 1000);
          
          // Release synth voice
          if (pad.synthConfig || pad.instrumentId != null) {
            try {
              let instId: number;
              let config: any;
              
              if (pad.synthConfig) {
                instId = PAD_INSTRUMENT_BASE + pad.id;
                config = { ...pad.synthConfig, id: instId };
              } else {
                instId = pad.instrumentId!;
                config = useInstrumentStore.getState().getInstrument(instId);
              }
              
              if (config) {
                const note = pad.instrumentNote || 'C3';
                getToneEngine().triggerNoteRelease(instId, note, 0, config);
              }
            } catch { /* ignore release errors */ }
          }
        }
      }
    }
  }, [currentProgram, setFxPadActive]);

  // Get pads for current bank (memoized for performance)
  const bankPads = useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);

  // Arrange pads in 4x4 grid (memoized for performance)
  const rows = useMemo(() => {
    if (bankPads.length === 0) return [];
    return [
      bankPads.slice(0, 4),
      bankPads.slice(4, 8),
      bankPads.slice(8, 12),
      bankPads.slice(12, 16),
    ];
  }, [bankPads]);

  // Keyboard navigation (arrow keys) - bank-aware
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

      // Calculate bank-aware bounds
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];
      const bankStart = bankOffset + 1;
      const bankEnd = bankOffset + 16;

      let newFocusedId = focusedPadId;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          break;
        case 'ArrowRight':
          event.preventDefault();
          newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
          break;
        case 'ArrowUp':
          event.preventDefault();
          newFocusedId = focusedPadId > bankStart + 3 ? focusedPadId - 4 : focusedPadId + 12;
          break;
        case 'ArrowDown':
          event.preventDefault();
          newFocusedId = focusedPadId <= bankEnd - 4 ? focusedPadId + 4 : focusedPadId - 12;
          break;
        case 'Enter':
        case ' ':
          // Only trigger if not already held (prevent key repeat spam)
          if (!event.repeat) {
            event.preventDefault();
            handlePadTrigger(focusedPadId, 100);
          }
          break;
        case 'Tab':
          // Don't prevent default for Tab - let it navigate normally
          if (event.shiftKey) {
            newFocusedId = focusedPadId > bankStart ? focusedPadId - 1 : bankEnd;
          } else {
            newFocusedId = focusedPadId < bankEnd ? focusedPadId + 1 : bankStart;
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

    const handleKeyUp = (event: KeyboardEvent) => {
      // Release pad on Enter/Space keyup (for sustain mode and DJ FX)
      if (event.key === 'Enter' || event.key === ' ') {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'
        ) {
          return;
        }
        event.preventDefault();
        handlePadRelease(focusedPadId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [focusedPadId, currentProgram, currentBank, handlePadTrigger, handlePadRelease]);

  if (!currentProgram) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        No program loaded
      </div>
    );
  }

  const handleQuickAssign = useCallback((padId: number, _rect: DOMRect) => {
    setContextMenuPadId(padId);
    const event = { clientX: _rect.left + _rect.width / 2, clientY: _rect.top + _rect.height / 2, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent;
    contextMenu.open(event);
  }, [contextMenu]);

  const contextMenuCallbacks = useMemo(() => ({
    onEdit: (id: number) => onPadSelect(id),
    onWizard: (id: number) => onEmptyPadClick?.(id),
    onPreview: (id: number) => {
      const engine = engineRef.current;
      if (engine) {
        const prog = useDrumPadStore.getState().programs.get(useDrumPadStore.getState().currentProgramId);
        const p = prog?.pads.find(pp => pp.id === id);
        if (p) engine.triggerPad(p, 100);
      }
    },
    onRename: (id: number) => {
      const prog = useDrumPadStore.getState().programs.get(useDrumPadStore.getState().currentProgramId);
      const p = prog?.pads.find(pp => pp.id === id);
      const newName = window.prompt('Pad name:', p?.name || `Pad ${id}`);
      if (newName !== null) {
        useDrumPadStore.getState().updatePad(id, { name: newName });
      }
    },
    onLoadSample: (id: number) => {
      onPadSelect(id);
      onEmptyPadClick?.(id);
    },
  }), [onPadSelect, onEmptyPadClick]);

  const contextMenuItems = usePadContextMenu(contextMenuPadId, contextMenuCallbacks);

  const bankButtons: PadBank[] = ['A', 'B', 'C', 'D'];
  const bankLoadedCount = bankPads.filter(p => p.sample !== null || p.synthConfig || p.instrumentId != null).length;
  const totalLoadedCount = currentProgram.pads.filter(p => p.sample !== null || p.synthConfig || p.instrumentId != null).length;

  return (
    <div className="flex flex-col gap-2 p-4">
      {/* Program info + export/import (hidden in performance mode) */}
      {!performanceMode && (
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-text-primary">{currentProgram.name}</div>
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
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
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
            className="px-2 py-1 text-[10px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
            title="Import programs + samples (.dvbpads)"
          >
            Import
          </button>
          <div className="text-xs text-text-muted" title={`${totalLoadedCount} samples across all banks`}>
            {bankLoadedCount}/16 ({totalLoadedCount}/64)
          </div>
        </div>
      </div>
      )}

      {/* Bank selector */}
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] font-mono text-text-muted mr-1">BANK</span>
        {bankButtons.map(bank => (
          <button
            key={bank}
            onClick={() => setBank(bank)}
            className={`px-3 py-1 text-xs font-bold font-mono rounded transition-colors ${
              currentBank === bank
                ? 'bg-accent-primary text-text-primary'
                : 'bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary'
            }`}
          >
            {bank}
          </button>
        ))}
      </div>

      {/* Responsive Pad Grid (4x4 landscape, 2x8 portrait) */}
      <div
        ref={gridRef}
        className={`grid ${performanceMode ? 'gap-3' : 'gap-2'} ${gridCols === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}
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
            onRelease={handlePadRelease}
            onSelect={onPadSelect}
            onEmptyPadClick={onEmptyPadClick}
            onFocus={() => setFocusedPadId(pad.id)}
            onQuickAssign={handleQuickAssign}
          />
        ))}
      </div>

      {/* Keyboard hint (hidden in performance mode) */}
      {!performanceMode && (
        <div className="text-[10px] text-text-muted text-center mt-2 font-mono">
          Click/Enter to trigger • Shift+Click to select • Arrow keys to navigate
        </div>
      )}

      {/* Context menu */}
      <ContextMenu
        items={contextMenuItems}
        position={contextMenu.position}
        onClose={() => { contextMenu.close(); setContextMenuPadId(null); }}
      />
    </div>
  );
};
