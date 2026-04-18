/**
 * DJSamplerPanel - Compact inline drum pad sampler for DJ view
 *
 * Routes audio through the DJ mixer's sampler input (bypasses crossfader,
 * goes through master FX + limiter). Reuses the existing drumpad store
 * and PadButton component.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from '../drumpad/PadButton';
import { DubBusPanel } from '../drumpad/DubBusPanel';
import { DJ_PAD_PRESETS } from '../../constants/djPadPresets';
import { DUB_ACTION_HANDLERS } from '../../engine/drumpad/DubActions';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '../../engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '../../engine/drumpad/NoteRepeatEngine';
import { getAudioContext, resumeAudioContext } from '../../audio/AudioContextSingleton';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import { useTransportStore } from '../../stores/useTransportStore';
import type { PadBank, ScratchActionId } from '../../types/drumpad';
import { getBankPads } from '../../types/drumpad';
import { CustomSelect } from '@components/common/CustomSelect';
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
  fader_lfo_off: djFaderLFOOff,
  fader_lfo_1_4: djFaderLFO14,
  fader_lfo_1_8: djFaderLFO18,
  fader_lfo_1_16: djFaderLFO116,
  fader_lfo_1_32: djFaderLFO132,
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
  const velocityTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const noteRepeatEnabledRef = useRef(false);

  // Audio engine refs
  const engineRef = useRef<DrumPadEngine | null>(null);
  const noteRepeatRef = useRef<NoteRepeatEngine | null>(null);
  // Active dub-action releasers per pad — called on pad release / panic. Throws
  // (oneshot) never register here; their engage returns null and tails out alone.
  const dubReleasersRef = useRef<Map<number, () => void>>(new Map());

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
    const engine = new DrumPadEngine(audioContext, destination);
    engineRef.current = engine;
    noteRepeatRef.current = new NoteRepeatEngine(engine);

    // Attach DJ mixer so dub-action pads can tap deck audio (King Tubby-style
    // echo throws). Safe to skip if DJ isn't up — engine no-ops on dub actions.
    if (djEngine) engine.attachDJMixer(djEngine.mixer);

    // Ensure samples are loaded
    useDrumPadStore.getState().loadFromIndexedDB(audioContext);

    return () => {
      engine.detachDJMixer();
      noteRepeatRef.current?.dispose();
      engine.dispose();
      // Release any outstanding dub-action holds before tearing down.
      for (const release of dubReleasersRef.current.values()) {
        try { release(); } catch { /* ok */ }
      }
      dubReleasersRef.current.clear();
      // Clear all velocity flash timers
      for (const timer of velocityTimersRef.current.values()) {
        clearTimeout(timer);
      }
      velocityTimersRef.current.clear();
    };
  }, []);

  // ── DJ panic: silence local engine when ESC panic fires ──
  useEffect(() => {
    const onPanic = () => {
      noteRepeatRef.current?.stopAll();
      engineRef.current?.stopAll();
      // Close any in-flight dub-action releasers so siren / mute-dub /
      // filter-drop don't stay stuck on after panic.
      for (const release of dubReleasersRef.current.values()) {
        try { release(); } catch { /* ok */ }
      }
      dubReleasersRef.current.clear();
    };
    window.addEventListener('dj-panic', onPanic);
    return () => window.removeEventListener('dj-panic', onPanic);
  }, []);

  // ── Dub Bus: mirror store settings into the live engine ──
  // Subscribes to store.dubBus and pushes changes to the DrumPadEngine's
  // shared SpringReverb/SpaceEcho bus. Per-voice sends read pad.dubSend
  // directly at trigger time, so we don't need to sync those here.
  const dubBus = useDrumPadStore((s) => s.dubBus);
  useEffect(() => {
    engineRef.current?.setDubBusSettings(dubBus);
  }, [dubBus]);

  // Sync master level
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mute groups + pre-build effects chains
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
      const padsWithEffects = currentProgram.pads.filter(p => p.effects && p.effects.length > 0);
      if (padsWithEffects.length > 0) {
        engineRef.current.updatePadEffects(padsWithEffects);
      }
    }
  }, [currentProgram]);

  // Sync note repeat
  // Load a factory pad preset (King Tubby Dub Kit, DJ FX, etc.) and run its
  // onApply hook so e.g. the Dub Bus flips on for dub-action kits. Kept here
  // instead of the generic program dropdown so the DJ view gets the kit picker
  // without needing to switch to the full drumpad manager.
  const loadFactoryPreset = useCallback((presetId: string) => {
    const preset = DJ_PAD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const program = preset.create();
    useDrumPadStore.getState().saveProgram(program);
    loadProgram(program.id);
    useDrumPadStore.getState().setBank('A');
    preset.onApply?.({
      setDubBus: useDrumPadStore.getState().setDubBus,
    });
  }, [loadProgram]);

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

        // Dub-bus action — King Tubby throws / holds / mutes / siren / filter.
        // Fires before sample playback so even pads with both (rare) start
        // their dub gesture on the pad's transient hit.
        if (pad.dubAction) {
          const prior = dubReleasersRef.current.get(padId);
          if (prior) { prior(); dubReleasersRef.current.delete(padId); }
          const handler = DUB_ACTION_HANDLERS[pad.dubAction];
          if (handler) {
            const settings = useDrumPadStore.getState().dubBus;
            const release = handler.engage(engineRef.current, settings, bpm);
            if (release) dubReleasersRef.current.set(padId, release);
          }
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

    // Clear any existing velocity timer for this pad before setting a new one
    const existingTimer = velocityTimersRef.current.get(padId);
    if (existingTimer) clearTimeout(existingTimer);
    velocityTimersRef.current.set(padId, setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
      velocityTimersRef.current.delete(padId);
    }, 200));
  }, [currentProgram, bpm]);

  const handlePadRelease = useCallback((padId: number) => {
    // Dub-action releasers live on their own lifecycle; release even if the
    // pad wasn't flagged as held (throws never register held, but siren /
    // filter-drop / mute-dub do).
    const release = dubReleasersRef.current.get(padId);
    if (release) {
      release();
      dubReleasersRef.current.delete(padId);
    }

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

  const bankButtons: PadBank[] = ['A', 'B'];
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
          <CustomSelect
            value={currentProgramId}
            onChange={(v) => loadProgram(v)}
            options={programList.map(p => ({
              value: p.id,
              label: p.name,
            }))}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-dark-surface border border-dark-border rounded text-text-secondary cursor-pointer"
          />
          {/* Factory preset picker — loads the King Tubby dub kit / DJ FX /
              one-shots / scratch master / dj complete / dub moves minimal
              and runs their onApply hooks (e.g. auto-enable Dub Bus). */}
          <CustomSelect
            value=""
            onChange={loadFactoryPreset}
            placeholder="Preset..."
            options={DJ_PAD_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-dark-surface border border-dark-border rounded text-text-secondary cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {/* Bank buttons */}
          {bankButtons.map(bank => (
            <button
              key={bank}
              onClick={() => setBank(bank)}
              className={`w-5 h-5 text-[9px] font-bold font-mono rounded transition-colors ${
                currentBank === bank
                  ? 'bg-amber-600 text-text-primary'
                  : 'bg-dark-surface border border-dark-border text-text-muted hover:text-text-primary'
              }`}
            >
              {bank}
            </button>
          ))}
          <span className="text-[9px] font-mono text-text-muted ml-1">
            {bankLoadedCount}/16
          </span>
          <DubBusPanel />
          <button
            onClick={() => engineRef.current?.stopAll()}
            className="px-1.5 py-0.5 text-[9px] font-mono text-red-400 hover:text-red-300 bg-dark-surface border border-dark-border rounded transition-colors"
            title="Stop all"
          >
            ■
          </button>
          <button
            onClick={onClose}
            className="px-1.5 py-0.5 text-[9px] font-mono text-text-muted hover:text-text-primary bg-dark-surface border border-dark-border rounded transition-colors"
          >
            X
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
