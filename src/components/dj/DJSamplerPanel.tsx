/**
 * DJSamplerPanel - Compact inline drum pad sampler for DJ view
 *
 * Routes audio through the DJ mixer's sampler input (bypasses crossfader,
 * goes through master FX + limiter). Reuses the existing drumpad store
 * and PadButton component.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from '../drumpad/PadButton';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '../../engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '../../engine/drumpad/NoteRepeatEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import { useTransportStore } from '../../stores/useTransportStore';
import type { PadBank, ScratchActionId } from '../../types/drumpad';
import { getBankPads } from '../../types/drumpad';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '../../engine/keyboard/commands/djScratch';

const SCRATCH_ACTION_HANDLERS: Record<ScratchActionId, () => boolean> = {
  scratch_baby: djScratchBaby,
  scratch_trans: djScratchTrans,
  scratch_flare: djScratchFlare,
  scratch_hydro: djScratchHydro,
  scratch_crab: djScratchCrab,
  scratch_orbit: djScratchOrbit,
  scratch_chirp: djScratchChirp,
  scratch_stab: djScratchStab,
  scratch_scribble: djScratchScrbl,
  scratch_tear: djScratchTear,
  scratch_uzi: djScratchUzi,
  scratch_twiddle: djScratchTwiddle,
  scratch_8crab: djScratch8Crab,
  scratch_3flare: djScratch3Flare,
  scratch_laser: djScratchLaser,
  scratch_phaser: djScratchPhaser,
  scratch_tweak: djScratchTweak,
  scratch_drag: djScratchDrag,
  scratch_vibrato: djScratchVibrato,
  scratch_stop: djScratchStop,
  lfo_off: djFaderLFOOff,
  lfo_14: djFaderLFO14,
  lfo_18: djFaderLFO18,
  lfo_116: djFaderLFO116,
  lfo_132: djFaderLFO132,
};

// ============================================================================
// COMPONENT
// ============================================================================

interface DJSamplerPanelProps {
  onClose: () => void;
}

export const DJSamplerPanel: React.FC<DJSamplerPanelProps> = ({ onClose }) => {
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const heldPadsRef = useRef<Set<number>>(new Set());
  const noteRepeatEnabledRef = useRef(false);

  // Audio engine refs
  const engineRef = useRef<DrumPadEngine | null>(null);
  const noteRepeatRef = useRef<NoteRepeatEngine | null>(null);

  // Store state
  const { programs, currentProgramId, currentBank, setBank, loadProgram } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);

  // Note repeat
  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);
  const bpm = useTransportStore(s => s.bpm);
  const busLevels = useDrumPadStore(s => s.busLevels);

  // ── Initialize engine routed through DJ mixer ──
  useEffect(() => {
    const audioContext = getAudioContext();
    const djEngine = getDJEngineIfActive();

    // Route through DJ mixer's sampler input if available, else fallback to destination
    const destination = djEngine?.mixer.samplerInput ?? undefined;
    engineRef.current = new DrumPadEngine(audioContext, destination);
    noteRepeatRef.current = new NoteRepeatEngine(engineRef.current);

    // Ensure samples are loaded
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);

    return () => {
      noteRepeatRef.current?.dispose();
      engineRef.current?.dispose();
    };
  }, []);

  // Sync master level
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mute groups
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
    }
  }, [currentProgram]);

  // Sync note repeat
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

  // Sync bus levels
  useEffect(() => {
    if (!engineRef.current || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      engineRef.current.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  // ── Pad trigger / release ──
  const handlePadTrigger = useCallback(async (padId: number, velocity: number) => {
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));
    await resumeAudioContext();

    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad) {
        if (pad.scratchAction) {
          SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.();
        }
        if (pad.sample) {
          engineRef.current.triggerPad(pad, velocity);
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

    setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
    }, 200);
  }, [currentProgram]);

  const handlePadRelease = useCallback((padId: number) => {
    if (!heldPadsRef.current.has(padId)) return;
    heldPadsRef.current.delete(padId);
    noteRepeatRef.current?.stopRepeat(padId);

    if (currentProgram && engineRef.current) {
      const pad = currentProgram.pads.find(p => p.id === padId);
      if (pad && pad.playMode === 'sustain') {
        engineRef.current.stopPad(padId, pad.release / 1000);
      }
    }
  }, [currentProgram]);

  // ── Bank pads ──
  const bankPads = useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);

  // ── Program list for selector ──
  const programList = useMemo(() => Array.from(programs.values()), [programs]);

  if (!currentProgram) return null;

  const bankButtons: PadBank[] = ['A', 'B', 'C', 'D'];
  const bankLoadedCount = bankPads.filter(p => p.sample !== null).length;

  return (
    <div className="flex flex-col gap-1 bg-dark-bgSecondary border border-dark-border rounded-lg p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
            Sampler
          </span>
          {/* Program selector */}
          <select
            value={currentProgramId}
            onChange={(e) => loadProgram(e.target.value)}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-dark-surface border border-dark-border rounded text-text-secondary cursor-pointer"
          >
            {programList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Bank buttons */}
          {bankButtons.map(bank => (
            <button
              key={bank}
              onClick={() => setBank(bank)}
              className={`w-5 h-5 text-[9px] font-bold font-mono rounded transition-colors ${
                currentBank === bank
                  ? 'bg-amber-600 text-white'
                  : 'bg-dark-surface border border-dark-border text-text-muted hover:text-white'
              }`}
            >
              {bank}
            </button>
          ))}
          <span className="text-[9px] font-mono text-text-muted ml-1">
            {bankLoadedCount}/16
          </span>
          <button
            onClick={() => engineRef.current?.stopAll()}
            className="px-1.5 py-0.5 text-[9px] font-mono text-red-400 hover:text-red-300 bg-dark-surface border border-dark-border rounded transition-colors"
            title="Stop all"
          >
            ■
          </button>
          <button
            onClick={onClose}
            className="px-1.5 py-0.5 text-[9px] font-mono text-text-muted hover:text-white bg-dark-surface border border-dark-border rounded transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Compact 4×4 pad grid */}
      <div className="grid grid-cols-4 gap-1">
        {bankPads.map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            isSelected={selectedPadId === pad.id}
            velocity={padVelocities[pad.id] || 0}
            onTrigger={handlePadTrigger}
            onRelease={handlePadRelease}
            onSelect={setSelectedPadId}
            className="!min-h-[40px] !text-[8px]"
          />
        ))}
      </div>
    </div>
  );
};
