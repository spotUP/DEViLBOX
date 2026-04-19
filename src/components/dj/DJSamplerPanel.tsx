/**
 * DJSamplerPanel - Compact inline drum pad sampler for DJ view.
 *
 * Uses the shared `useMIDIPadRouting` singleton engine — the same one MIDI
 * triggers use — so touch and MIDI produce identical audio (same FX chain,
 * same dub bus, same routing through the DJ mixer). Earlier versions ran a
 * second local DrumPadEngine here, which caused divergent audio paths and
 * duplicated WASM / noise sources.
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { PadButton } from '../drumpad/PadButton';
import { DubBusPanel } from '../drumpad/DubBusPanel';
import { DJ_PAD_PRESETS } from '../../constants/djPadPresets';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { resumeAudioContext } from '../../audio/AudioContextSingleton';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import type { PadBank } from '../../types/drumpad';
import { getBankPads } from '../../types/drumpad';
import { CustomSelect } from '@components/common/CustomSelect';
import { useMIDIPadRouting, clearDubReleasers } from '@/hooks/drumpad/useMIDIPadRouting';
import { bpmSyncedEchoRate, getActiveBpm } from '../../engine/dub/DubActions';
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';

// ============================================================================
// COMPONENT
// ============================================================================

interface DJSamplerPanelProps {
  onClose: () => void;
}

export const DJSamplerPanel: React.FC<DJSamplerPanelProps> = ({ onClose }) => {
  const [padVelocities, setPadVelocities] = useState<Record<number, number>>({});
  const [selectedPadId, setSelectedPadId] = useState<number | null>(null);
  const velocityTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Shared full-featured pad engine (also handles MIDI routing). This hook
  // owns the singleton DrumPadEngine and dispatches every pad action type
  // (sample, synth, DJ FX, scratch, PTT, dub). Touch events from this panel
  // go through the exact same path as MIDI hits.
  const {
    triggerPad: hookTriggerPad,
    releasePad: hookReleasePad,
    releaseAllHeld,
    engineRef,
  } = useMIDIPadRouting();

  // Store state
  const { programs, currentProgramId, currentBank, setBank, loadProgram } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);

  // ── DJ mixer attach (mount-only, with a short retry) ──
  // The singleton may have been created before the DJ engine came up (e.g.
  // user visited the tracker view first). Attach on mount; if DJ isn't up
  // yet, retry once after 200 ms. MUST NOT run on every dubBus change —
  // re-attach disconnects/reconnects masterGain which under load produces
  // an audible click, and DubBusPanel knob twiddles would otherwise fire it.
  useEffect(() => {
    const attach = () => {
      const engine = engineRef.current;
      if (!engine) return false;
      try {
        const dj = getDJEngineIfActive();
        if (dj) { engine.attachDJMixer(dj.mixer); return true; }
      } catch { /* ok */ }
      return false;
    };
    if (!attach()) {
      const t = setTimeout(attach, 200);
      return () => clearTimeout(t);
    }
  }, [engineRef]);

  // ── DJ panic: silence + flush the dub bus when ESC panic fires ──
  // The hook's releaseAllHeld clears every per-pad releaser registered via
  // the hook; engine.dubPanic() additionally flushes the SpaceEcho +
  // SpringReverb internal delay lines so the bus is ready for clean restart.
  useEffect(() => {
    const onPanic = () => {
      releaseAllHeld();
      engineRef.current?.dubPanic();
      clearDubReleasers();
      // Sync the store so the Dub Bus UI reflects the killed state.
      useDrumPadStore.getState().setDubBus({ enabled: false });
      for (const timer of velocityTimersRef.current.values()) clearTimeout(timer);
      velocityTimersRef.current.clear();
      setPadVelocities({});
    };
    const onDubPanic = () => {
      engineRef.current?.dubPanic();
      clearDubReleasers();
      useDrumPadStore.getState().setDubBus({ enabled: false });
    };
    window.addEventListener('dj-panic', onPanic);
    window.addEventListener('dub-panic', onDubPanic);
    return () => {
      window.removeEventListener('dj-panic', onPanic);
      window.removeEventListener('dub-panic', onDubPanic);
    };
  }, [releaseAllHeld, engineRef]);

  // ── Dub Bus: mirror store settings into the live engine ──
  // Derives echo rate from the active deck's BPM when sync is on — a
  // 140 BPM record crossfader'd in won't sync to the tracker's 120 BPM.
  // Subscribing to deck BPM + crossfader means echoes track the mix.
  const dubBus = useDrumPadStore((s) => s.dubBus);
  const transportBpm = useTransportStore((s) => s.bpm);
  const djDeckSig = useDJStore((s) =>
    `${s.decks.A.isPlaying ? s.decks.A.beatGrid?.bpm || s.decks.A.detectedBPM : 0}|` +
    `${s.decks.B.isPlaying ? s.decks.B.beatGrid?.bpm || s.decks.B.detectedBPM : 0}|` +
    `${s.decks.C.isPlaying ? s.decks.C.beatGrid?.bpm || s.decks.C.detectedBPM : 0}|` +
    `${s.crossfaderPosition}`
  );
  useEffect(() => {
    const bpm = getActiveBpm();
    const synced = bpmSyncedEchoRate(bpm, dubBus.echoSyncDivision, dubBus.echoRateMs);
    engineRef.current?.setDubBusSettings({ ...dubBus, echoRateMs: synced });
  }, [dubBus, transportBpm, djDeckSig, engineRef]);

  // Sync master level
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel, engineRef, currentProgram]);

  // Sync mute groups + pre-build effects chains
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMuteGroups(currentProgram.pads);
      const padsWithEffects = currentProgram.pads.filter(p => p.effects && p.effects.length > 0);
      if (padsWithEffects.length > 0) {
        engineRef.current.updatePadEffects(padsWithEffects);
      }
    }
  }, [currentProgram, engineRef]);

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

  // ── Pad trigger / release ──
  // Thin wrappers over the hook: flash the velocity indicator + forward to
  // the shared engine. All the actual audio routing (sample / synth / DJ FX
  // / scratch / dub-action) happens inside the hook's triggerPad.
  const handlePadTrigger = useCallback(async (padId: number, velocity: number) => {
    setPadVelocities(prev => ({ ...prev, [padId]: velocity }));
    await resumeAudioContext();
    hookTriggerPad(padId, velocity);

    const existingTimer = velocityTimersRef.current.get(padId);
    if (existingTimer) clearTimeout(existingTimer);
    velocityTimersRef.current.set(padId, setTimeout(() => {
      setPadVelocities(prev => ({ ...prev, [padId]: 0 }));
      velocityTimersRef.current.delete(padId);
    }, 200));
  }, [hookTriggerPad]);

  const handlePadRelease = useCallback((padId: number) => {
    hookReleasePad(padId);
  }, [hookReleasePad]);

  // ── Bank pads ──
  const bankPads = useMemo(() => {
    if (!currentProgram) return [];
    return getBankPads(currentProgram.pads, currentBank);
  }, [currentProgram, currentBank]);

  // ── Program list for selector ──
  const programList = useMemo(() => Array.from(programs.values()), [programs]);

  // Cleanup velocity timers on unmount
  useEffect(() => () => {
    for (const timer of velocityTimersRef.current.values()) clearTimeout(timer);
    velocityTimersRef.current.clear();
  }, []);

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
