/**
 * useMIDIPadRouting — Full-featured MIDI pad → DrumPad routing.
 *
 * Uses a module-level singleton DrumPadEngine so the same engine is shared
 * regardless of how many call sites mount the hook (App.tsx for global MIDI
 * routing + PadGrid for UI-driven triggering).
 *
 * Features:
 *   - Sample playback via DrumPadEngine
 *   - Synth triggering via ToneEngine (with oneshot auto-release)
 *   - DJ FX actions with beat quantization
 *   - Scratch actions
 *   - Note repeat
 *   - Velocity curves, mute groups, master level, bus levels sync
 *   - MIDI notes 36-43 → first 8 pads of current bank (drumpad/dj/vj views)
 */

import { useEffect, useRef, useCallback } from 'react';
import { getMIDIManager } from '../../midi/MIDIManager';
import type { MIDIMessage } from '../../midi/types';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useTransportStore } from '../../stores/useTransportStore';
import { useUIStore } from '../../stores/useUIStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { NoteRepeatEngine } from '../../engine/drumpad/NoteRepeatEngine';
import type { NoteRepeatRate } from '../../engine/drumpad/NoteRepeatEngine';
import { getToneEngine } from '../../engine/ToneEngine';
import { getAudioContext } from '../../audio/AudioContextSingleton';
import { applyVelocityCurve, PAD_INSTRUMENT_BASE, MPK_SLOT_COUNT, mpkSlotId } from '../../types/drumpad';
import type { ScratchActionId } from '../../types/drumpad';
import { DJ_FX_ACTION_MAP } from '../../engine/drumpad/DjFxActions';
import { DUB_ACTION_HANDLERS } from '../../engine/drumpad/DubActions';
import { getDJEngineIfActive } from '../../engine/dj/DJEngine';
import { quantizeAction, getQuantizeMode } from '../../engine/dj/DJQuantizedFX';
import { resetDrumPadModulation } from '../../midi/performance/parameterRouter';
import { useVocoderStore } from '../../stores/useVocoderStore';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchUzi, djScratchTwiddle, djScratch8Crab, djScratch3Flare,
  djScratchLaser, djScratchPhaser, djScratchTweak, djScratchDrag, djScratchVibrato,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132,
} from '../../engine/keyboard/commands/djScratch';

/* ── Scratch action lookup ── */
const SCRATCH_ACTION_HANDLERS: Record<ScratchActionId, (start?: boolean) => boolean> = {
  scratch_baby: djScratchBaby, scratch_trans: djScratchTrans,
  scratch_flare: djScratchFlare, scratch_hydro: djScratchHydro,
  scratch_crab: djScratchCrab, scratch_orbit: djScratchOrbit,
  scratch_chirp: djScratchChirp, scratch_stab: djScratchStab,
  scratch_scribble: djScratchScrbl, scratch_tear: djScratchTear,
  scratch_uzi: djScratchUzi, scratch_twiddle: djScratchTwiddle,
  scratch_8crab: djScratch8Crab, scratch_3flare: djScratch3Flare,
  scratch_laser: djScratchLaser, scratch_phaser: djScratchPhaser,
  scratch_tweak: djScratchTweak, scratch_drag: djScratchDrag,
  scratch_vibrato: djScratchVibrato, scratch_stop: djScratchStop,
  fader_lfo_off: djFaderLFOOff, fader_lfo_1_4: djFaderLFO14,
  fader_lfo_1_8: djFaderLFO18, fader_lfo_1_16: djFaderLFO116,
  fader_lfo_1_32: djFaderLFO132,
};

// Accept wide MIDI note range - auto-detect controller mapping
const MIDI_PAD_LO = 0;    // Accept any MIDI note
const MIDI_PAD_HI = 127;  // Full MIDI range

// Auto-learned note mapping (stored in module scope, persisted to localStorage)
// Key: MIDI device ID, Value: learned note array
const _deviceMappings = new Map<string, number[]>();
let _currentDeviceId: string | null = null;
let _learningMode: 'off' | 'auto' | 'manual' = 'off';
let _manualLearnIndex = 0;

// Load all learned mappings from localStorage
try {
  const stored = localStorage.getItem('devilbox_midi_pad_mappings');
  if (stored) {
    const obj = JSON.parse(stored);
    Object.entries(obj).forEach(([deviceId, notes]) => {
      _deviceMappings.set(deviceId, notes as number[]);
    });
    console.log('[MIDI Pads] Loaded learned mappings for', _deviceMappings.size, 'devices');
  }
} catch (e) {
  console.warn('[MIDI Pads] Failed to load learned mappings:', e);
}

// Save all learned mappings to localStorage
function saveLearning() {
  try {
    const obj: Record<string, number[]> = {};
    _deviceMappings.forEach((notes, deviceId) => {
      obj[deviceId] = notes;
    });
    localStorage.setItem('devilbox_midi_pad_mappings', JSON.stringify(obj));
    console.log('[MIDI Pads] Saved learned mappings');
  } catch (e) {
    console.warn('[MIDI Pads] Failed to save learned mappings:', e);
  }
}

// Wipe any stale MIDI-learn bindings from the deprecated slot-binding
// feature so old localStorage entries don't silently redirect pad notes
// after an upgrade. MPK slot switching is Program-Change-only now.
try { localStorage.removeItem('devilbox_mpk_slot_bindings'); } catch { /* ignore */ }

// Get current device's learned notes
function getCurrentMapping(): number[] {
  if (!_currentDeviceId) return [];
  return _deviceMappings.get(_currentDeviceId) || [];
}

// Set current device's learned notes
function setCurrentMapping(notes: number[]) {
  if (!_currentDeviceId) return;
  _deviceMappings.set(_currentDeviceId, notes);
  saveLearning();
}

// Start auto-detection mode - collects unique notes then sorts them
export function startMIDIPadAutoDetect() {
  if (!_currentDeviceId) {
    console.warn('[MIDI Pads] No MIDI device connected');
    return;
  }
  _deviceMappings.set(_currentDeviceId, []);
  _learningMode = 'auto';
  console.log('[MIDI Pads] Auto-detect started - play all 16 pads');
}

// Start manual learn mode - learns pads in order (pad 1, pad 2, pad 3...)
export function startMIDIPadManualLearn() {
  if (!_currentDeviceId) {
    console.warn('[MIDI Pads] No MIDI device connected');
    return;
  }
  _deviceMappings.set(_currentDeviceId, []);
  _manualLearnIndex = 0;
  _learningMode = 'manual';
  console.log('[MIDI Pads] Manual learn started - press pad 1');
}

// Stop learning mode
export function stopMIDIPadLearning() {
  const learnedNotes = getCurrentMapping();
  
  if (_learningMode === 'auto' && learnedNotes.length > 0) {
    learnedNotes.sort((a, b) => a - b);
    setCurrentMapping(learnedNotes);
  }
  
  if (learnedNotes.length > 0) {
    console.log('[MIDI Pads] Learning complete:', learnedNotes);
  }
  
  _learningMode = 'off';
  _manualLearnIndex = 0;
}

// Get learning status (for UI display)
export function getMIDIPadLearningStatus() {
  return {
    mode: _learningMode,
    deviceId: _currentDeviceId,
    learnedCount: getCurrentMapping().length,
    currentPad: _learningMode === 'manual' ? _manualLearnIndex + 1 : null,
    notes: getCurrentMapping(),
  };
}

// Reset learned mapping for current device
export function resetMIDIPadLearning() {
  if (!_currentDeviceId) {
    console.warn('[MIDI Pads] No MIDI device connected');
    return;
  }
  _deviceMappings.delete(_currentDeviceId);
  _learningMode = 'off';
  _manualLearnIndex = 0;
  saveLearning();
  console.log('[MIDI Pads] Learned mapping reset for device:', _currentDeviceId);
}

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  (window as any).startMIDIPadAutoDetect = startMIDIPadAutoDetect;
  (window as any).startMIDIPadManualLearn = startMIDIPadManualLearn;
  (window as any).stopMIDIPadLearning = stopMIDIPadLearning;
  (window as any).getMIDIPadLearningStatus = getMIDIPadLearningStatus;
  (window as any).resetMIDIPadLearning = resetMIDIPadLearning;
}
const PAD_VIEWS = new Set(['drumpad', 'dj', 'vj']);

/* ── Module-level singleton engine ── */
let _engine: DrumPadEngine | null = null;
let _noteRepeat: NoteRepeatEngine | null = null;
let _refCount = 0;
const _heldPads = new Set<number>();
const _pendingReleases = new Map<number, ReturnType<typeof setTimeout>>();
// Active dub-action releasers keyed by padId — release is called on pad
// release / releaseAllHeld / engine teardown. One-shot throws never register
// here (their engage returns null).
const _dubReleasers = new Map<number, () => void>();
/** Failsafe watchdog timers — a dub action stuck "on" for more than
 *  DUB_RELEASE_TIMEOUT_MS auto-releases so a lost MIDI note-off (or UI
 *  race that drops a pointer-up) can't leave the siren / filter drop /
 *  hold engaged forever. Cleared when the pad releases normally. */
const _dubReleaseTimers = new Map<number, ReturnType<typeof setTimeout>>();
const DUB_RELEASE_TIMEOUT_MS = 30_000;

/**
 * Panic-flush for the hook-side dub releasers. Called from PadGrid /
 * DJSamplerPanel on `dub-panic` / `dj-panic` so quantized throws and
 * hold-mode dub releasers don't linger in the module map after their
 * engine-side cancels have already been fired by `clearAllPendingThrows`.
 * Fires every releaser (so any held state the releaser guards gets
 * restored), then clears the map.
 */
export function clearDubReleasers(): void {
  const snapshot = Array.from(_dubReleasers.values());
  _dubReleasers.clear();
  for (const t of _dubReleaseTimers.values()) clearTimeout(t);
  _dubReleaseTimers.clear();
  for (const release of snapshot) {
    try { release(); } catch { /* ok */ }
  }
}

/** Returns the currently held pad IDs (for joystick modulation routing) */
export function getHeldDrumPads(): number[] {
  return Array.from(_heldPads);
}

/** Returns the singleton DrumPadEngine instance (for direct voice filter modulation) */
export function getDrumPadEngine(): DrumPadEngine | null {
  return _engine;
}

/** Returns the singleton NoteRepeatEngine instance (for panic / shared access). */
export function getNoteRepeatEngine(): NoteRepeatEngine | null {
  return _noteRepeat;
}

function getOrCreateEngine(): DrumPadEngine {
  if (!_engine) {
    const ctx = getAudioContext();
    _engine = new DrumPadEngine(ctx);
    _noteRepeat = new NoteRepeatEngine(_engine);
    useDrumPadStore.getState().loadFromIndexedDB(ctx);
    // If a DJ engine is already up, attach its mixer so dub-action pads can
    // tap deck audio. Otherwise the attach happens when the DJ view mounts
    // (DJSamplerPanel calls attachDJMixer after creating its own engine too,
    // but this covers the standalone-with-DJ-active case).
    try {
      const dj = getDJEngineIfActive();
      if (dj) _engine.attachDJMixer(dj.mixer);
    } catch { /* DJ engine not available */ }
  }
  return _engine;
}

function disposeEngineIfUnused(): void {
  if (_refCount <= 0 && _engine) {
    _noteRepeat?.dispose();
    _engine.dispose();
    _pendingReleases.forEach(t => clearTimeout(t));
    _pendingReleases.clear();
    _heldPads.clear();
    _engine = null;
    _noteRepeat = null;
  }
}

/* ── MIDI handler registration (once globally) ── */
let _midiRegistered = false;

export function useMIDIPadRouting() {
  const { programs, currentProgramId, currentBank } = useDrumPadStore();
  const currentProgram = programs.get(currentProgramId);
  const setFxPadActive = useDrumPadStore(s => s.setFxPadActive);

  const noteRepeatEnabled = useDrumPadStore(s => s.noteRepeatEnabled);
  const noteRepeatRate = useDrumPadStore(s => s.noteRepeatRate);
  const bpm = useTransportStore(s => s.bpm);
  const busLevels = useDrumPadStore(s => s.busLevels);

  // Stable ref to the engine
  const engineRef = useRef<DrumPadEngine | null>(null);

  // ── Lifecycle: acquire / release singleton ──
  useEffect(() => {
    _refCount++;
    engineRef.current = getOrCreateEngine();
    return () => {
      _refCount--;
      disposeEngineIfUnused();
      engineRef.current = null;
    };
  }, []);

  // ── Sync engine state ──
  useEffect(() => {
    if (_engine && currentProgram) {
      _engine.setMasterLevel(currentProgram.masterLevel);
    }
  }, [currentProgram?.masterLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (_engine && currentProgram) {
      _engine.setMuteGroups(currentProgram.pads);
      // Pre-build effects chains for pads that have FX presets assigned
      const padsWithEffects = currentProgram.pads.filter(p => p.effects && p.effects.length > 0);
      if (padsWithEffects.length > 0) {
        _engine.updatePadEffects(padsWithEffects);
      }
    }
  }, [currentProgram]);

  useEffect(() => {
    if (_noteRepeat) _noteRepeat.setEnabled(noteRepeatEnabled);
  }, [noteRepeatEnabled]);

  useEffect(() => {
    if (_noteRepeat) _noteRepeat.setRate(noteRepeatRate as NoteRepeatRate);
  }, [noteRepeatRate]);

  useEffect(() => {
    if (_noteRepeat) _noteRepeat.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    if (!_engine || !busLevels) return;
    for (const [bus, level] of Object.entries(busLevels)) {
      _engine.setOutputLevel(bus, level);
    }
  }, [busLevels]);

  // ── Release all held pads ──
  const releaseAllHeld = useCallback(() => {
    _heldPads.forEach(padId => {
      _noteRepeat?.stopRepeat(padId);
      if (currentProgram && _engine) {
        const pad = currentProgram.pads.find(p => p.id === padId);
        if (pad) {
          // Stop scratch actions — previously this loop only covered
          // djFxAction/dubAction/pttAction/synth, leaving a scratch pad
          // running forever on bank switch / ESC / dj-panic. The handler
          // with start=false is the canonical "finish current cycle" path.
          if (pad.scratchAction) {
            SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(false);
          }
          if (pad.djFxAction) {
            DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
            setFxPadActive(padId, false);
          }
          if (pad.dubAction) {
            const release = _dubReleasers.get(padId);
            if (release) { release(); _dubReleasers.delete(padId); }
          }
          if (pad.pttAction) {
            useVocoderStore.getState().setPTT(false);
          }
          if (pad.playMode === 'sustain') {
            _engine.stopPad(padId, pad.release / 1000);
          }
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
              const pending = _pendingReleases.get(instId);
              if (pending) { clearTimeout(pending); _pendingReleases.delete(instId); }
              if (config) {
                const note = pad.instrumentNote || 'C4';
                getToneEngine().triggerNoteRelease(instId, note, 0, config);
              }
            } catch { /* ignore */ }
          }
        }
      }
    });
    // Also clear any orphaned dub releasers — defensive: if a dub pad
    // somehow registered a releaser but the pad left _heldPads via a code
    // path that skipped the release call, dubPanic() will also clean them,
    // but we do it here for the same belt-and-braces reason.
    _dubReleasers.forEach((release) => { try { release(); } catch { /* ok */ } });
    _dubReleasers.clear();
    _heldPads.clear();
  }, [currentProgram, setFxPadActive]);

  const triggerPad = useCallback((padId: number, velocity: number) => {
    const ctx = getAudioContext();
    if (ctx.state === 'closed') return;
    if (ctx.state === 'suspended') { ctx.resume(); }

    if (!currentProgram || !_engine) return;
    const pad = currentProgram.pads.find(p => p.id === padId);
    if (!pad) return;

    const curvedVelocity = applyVelocityCurve(velocity, pad.velocityCurve);

    // Scratch actions (start on note-on, stop on note-off via releasePad)
    if (pad.scratchAction) {
      SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(true);
    }

    // Dub-bus action — King Tubby-style deck tap/throw/mute/siren.
    // Throws (oneshot) fire-and-forget; holds register a releaser on the
    // module-level `_dubReleasers` map so pad release / panic closes them.
    if (pad.dubAction && _engine) {
      // Stop any prior releaser for this pad so re-triggering doesn't leak.
      const prior = _dubReleasers.get(padId);
      if (prior) { prior(); _dubReleasers.delete(padId); }
      const priorTimer = _dubReleaseTimers.get(padId);
      if (priorTimer) { clearTimeout(priorTimer); _dubReleaseTimers.delete(padId); }
      const handler = DUB_ACTION_HANDLERS[pad.dubAction];
      if (handler) {
        const settings = useDrumPadStore.getState().dubBus;
        const bpm = useTransportStore.getState().bpm;
        const release = handler.engage(_engine, settings, bpm);
        if (release) {
          _dubReleasers.set(padId, release);
          // Failsafe watchdog — if nothing releases the pad within 30 s
          // (lost MIDI note-off, pointer-up race, window blur while held),
          // auto-release so the effect doesn't linger forever.
          const timer = setTimeout(() => {
            _dubReleaseTimers.delete(padId);
            const stillActive = _dubReleasers.get(padId);
            if (stillActive === release) {
              console.warn(`[DubBus] Pad ${padId} auto-released after ${DUB_RELEASE_TIMEOUT_MS / 1000}s — no note-off received`);
              _dubReleasers.delete(padId);
              _heldPads.delete(padId);
              try { release(); } catch { /* ok */ }
            }
          }, DUB_RELEASE_TIMEOUT_MS);
          _dubReleaseTimers.set(padId, timer);
        }
      } else {
        // Stored pad references an action that no longer exists (schema drift).
        // Warn loudly so it's visible in the console but don't crash.
        console.warn(`[DubBus] Pad ${padId}: unknown dubAction '${pad.dubAction}' — re-assign the pad or reset its dub action in the context menu.`);
      }
    }

    // Vocoder PTT (push-to-talk via pad hold)
    if (pad.pttAction) {
      useVocoderStore.getState().setPTT(true);
    }

    // DJ FX — behavior depends on pad.playMode:
    //   'sustain'  = hold to engage, disengage on release   (filter sweeps, EQ kills)
    //   'toggle'   = click to engage, click again to disengage  (echo out, brake)
    //   'oneshot'  = fire + let the action run its own timeline  (beat jumps, air horn)
    if (pad.djFxAction) {
      const fxMode = pad.playMode ?? 'sustain';

      // Toggle OFF: second press on an already-active toggle pad disengages.
      if (fxMode === 'toggle' && _heldPads.has(padId)) {
        DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
        setFxPadActive(padId, false);
        _heldPads.delete(padId);
        return;
      }

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
        // Only 'sustain' and 'toggle' need held-state tracking so releasePad
        // can disengage (sustain) or the next press can disengage (toggle).
        // 'oneshot' fires and forgets — no disengage path.
        if (fxMode !== 'oneshot') _heldPads.add(padId);
      };

      if (shouldQuantize && getQuantizeMode() !== 'off') {
        quantizeAction('A', engageFx, { allowSolo: true, kind: 'play' });
      } else {
        engageFx();
      }
    }

    // Sample playback
    if (pad.sample) {
      _engine.triggerPad(pad, curvedVelocity);
    }

    // Synth trigger
    if (pad.synthConfig || pad.instrumentId != null) {
      try {
        const engine = getToneEngine();
        const note = pad.instrumentNote || 'C4';
        const normalizedVel = curvedVelocity / 127;

        let instId: number;
        let config: any;
        if (pad.synthConfig) {
          instId = PAD_INSTRUMENT_BASE + pad.id;
          config = { ...pad.synthConfig, id: instId };
        } else {
          instId = pad.instrumentId!;
          config = useInstrumentStore.getState().getInstrument(instId);
          if (!config) return;
        }

        engine.triggerNoteAttack(instId, note, 0, normalizedVel, config);

        // Auto-release for pads that fire-and-forget. Two paths:
        //   1. Sample-only pads — legacy behavior, use `pad.decay` (ms).
        //   2. Synth pads in oneshot mode — DubSiren / Air Horn / Riser.
        //      `pad.decay` defaults to 200 ms (short for drum hits) but a
        //      Dub Siren's authored envelope (decay + release) can be
        //      2+ seconds. Using 200 ms cuts sirens off mid-phase before
        //      the LFO has even completed one cycle.
        //
        // For oneshot synths, derive the hold time from the synth's own
        // envelope: attack + decay + release, capped at 8 s so runaway
        // presets don't lock a voice forever.
        const isOneshotSynth = !!pad.synthConfig && pad.playMode === 'oneshot';
        if (!pad.synthConfig || isOneshotSynth) {
          let releaseDelayMs: number;
          if (isOneshotSynth && pad.synthConfig?.synthType === 'DubSiren') {
            // DubSiren has no amp envelope — its audible duration comes from
            // internal reverb.decay + delay feedback tail. Pad.decay=200ms
            // default would cut siren off before the LFO finishes one cycle.
            // Estimate the tail from the preset's reverb + delay settings,
            // fall back to 2s if neither is configured. Capped at 8s to
            // prevent accidentally-wild presets from locking a voice forever.
            const ds = (pad.synthConfig as unknown as { dubSiren?: {
              reverb?: { decay?: number; wet?: number };
              delay?: { time?: number; feedback?: number; wet?: number };
            } }).dubSiren;
            const reverbTailMs = ds?.reverb?.decay ? ds.reverb.decay * 1000 : 0;
            // Geometric decay: time for feedback to drop to -60 dB.
            // ln(0.001) / ln(feedback) delay cycles, each `time` seconds.
            let delayTailMs = 0;
            if (ds?.delay?.feedback && ds.delay.time) {
              const fb = Math.min(0.95, Math.max(0, ds.delay.feedback));
              if (fb > 0.01) {
                const cycles = Math.log(0.001) / Math.log(fb);
                delayTailMs = cycles * ds.delay.time * 1000;
              }
            }
            const tailMs = Math.max(reverbTailMs, delayTailMs);
            releaseDelayMs = Math.max(500, Math.min(8000, tailMs + 500));
            if (tailMs === 0) releaseDelayMs = 2000; // no tail info — default
          } else if (isOneshotSynth && pad.synthConfig?.envelope) {
            const env = pad.synthConfig.envelope;
            // Envelope values are in ms per the store convention.
            const total = (env.attack ?? 0) + (env.decay ?? 0) + (env.release ?? 0);
            releaseDelayMs = Math.max(Math.min(total + 200, 8000), 500);
          } else {
            releaseDelayMs = Math.max(pad.decay, 100);
          }
          const existing = _pendingReleases.get(instId);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            try { engine.triggerNoteRelease(instId, note, 0, config); } catch { /* ignore */ }
            _pendingReleases.delete(instId);
          }, releaseDelayMs);
          _pendingReleases.set(instId, timer);
        }
      } catch { /* ignore synth errors */ }
    }

    // Always track held state for release
    _heldPads.add(padId);

    // Note repeat
    if (noteRepeatEnabled && _noteRepeat) {
      _noteRepeat.startRepeat(pad, velocity);
      _heldPads.add(padId);
    }
  }, [currentProgram, setFxPadActive, noteRepeatEnabled]);

  // ── Full-featured pad release ──
  const releasePad = useCallback((padId: number) => {
    if (!_heldPads.has(padId)) return;

    if (!currentProgram || !_engine) return;
    const pad = currentProgram.pads.find(p => p.id === padId);
    if (!pad) return;

    // Toggle-mode djFxAction pads: note-off is a no-op — the pad stays
    // 'held' so the next press can disengage it.
    if (pad.djFxAction && pad.playMode === 'toggle') {
      return;
    }

    _heldPads.delete(padId);

    // Restore joystick-modulated synth params to pre-modulation values
    resetDrumPadModulation(padId);

    _noteRepeat?.stopRepeat(padId);

    if (pad.djFxAction) {
      // Only sustain mode disengages on release. Oneshot actions run their
      // own timeline; toggle was handled above.
      if (pad.playMode === 'sustain') {
        DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
        setFxPadActive(padId, false);
      }
    }

    // Stop scratch action on release (finish current cycle gracefully)
    if (pad.scratchAction) {
      SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(false);
    }

    // Release dub-bus action (hold-style only; throws already self-released).
    if (pad.dubAction) {
      const release = _dubReleasers.get(padId);
      if (release) { release(); _dubReleasers.delete(padId); }
      // Cancel the failsafe watchdog — normal release path beat it.
      const timer = _dubReleaseTimers.get(padId);
      if (timer) { clearTimeout(timer); _dubReleaseTimers.delete(padId); }
    }

    // Release vocoder PTT
    if (pad.pttAction) {
      useVocoderStore.getState().setPTT(false);
    }

    // Stop sample playback — only for sustain-mode pads.
    // Oneshot pads play to completion regardless of when you release.
    if (pad.playMode === 'sustain') {
      _engine.stopPad(padId, pad.release / 1000);
    }

    // Release synth note and cancel any pending auto-release
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
        // Cancel auto-release timer since user released manually
        const pending = _pendingReleases.get(instId);
        if (pending) { clearTimeout(pending); _pendingReleases.delete(instId); }
        if (config) {
          const note = pad.instrumentNote || 'C4';
          getToneEngine().triggerNoteRelease(instId, note, 0, config);
        }
      } catch { /* ignore */ }
    }
  }, [currentProgram, setFxPadActive]);

  // ── MIDI handler (register once globally, uses latest callbacks via refs) ──
  const triggerRef = useRef(triggerPad);
  const releaseRef = useRef(releasePad);
  triggerRef.current = triggerPad;
  releaseRef.current = releasePad;

  const currentBankRef = useRef(currentBank);
  currentBankRef.current = currentBank;

  useEffect(() => {
    if (_midiRegistered) return;
    _midiRegistered = true;

    const manager = getMIDIManager();

    const handler = (message: MIDIMessage) => {
      const view = useUIStore.getState().activeView;

      // Program Change — the MPK Mini sends these from PROG SELECT + pad.
      // PC value 0-7 loads DEViLBOX slot 1-8. Checked before the PAD_VIEWS
      // guard so slot swaps happen even from tracker/mixer views.
      if (message.type === 'programChange' && message.program !== undefined) {
        const slot = (message.program % MPK_SLOT_COUNT) + 1;
        const id = mpkSlotId(slot);
        const store = useDrumPadStore.getState();
        if (store.programs.has(id)) store.loadProgram(id);
        return;
      }

      if (!PAD_VIEWS.has(view)) return;

      if (message.note === undefined || message.note < MIDI_PAD_LO || message.note > MIDI_PAD_HI) return;

      // Track current MIDI device (use channel as proxy for device ID)
      const deviceKey = `ch${message.channel}`;
      if (_currentDeviceId !== deviceKey) {
        _currentDeviceId = deviceKey;
      }

      const learnedNotes = getCurrentMapping();
      
      // Learning mode: collect notes
      if (_learningMode !== 'off' && message.type === 'noteOn') {
        const maxPads = useDrumPadStore.getState().controllerPadCount;
        if (_learningMode === 'auto') {
          // Auto mode: collect unique notes, sort later
          if (!learnedNotes.includes(message.note)) {
            learnedNotes.push(message.note);
            setCurrentMapping(learnedNotes);
            console.log(`[MIDI Pads] Auto-learned note ${message.note} (${learnedNotes.length}/${maxPads})`);
            
            if (learnedNotes.length === maxPads) {
              stopMIDIPadLearning();
            }
          }
        } else if (_learningMode === 'manual') {
          // Manual mode: learn pads in order (1, 2, 3...)
          learnedNotes[_manualLearnIndex] = message.note;
          setCurrentMapping(learnedNotes);
          console.log(`[MIDI Pads] Learned pad ${_manualLearnIndex + 1} → note ${message.note}`);
          _manualLearnIndex++;
          
          if (_manualLearnIndex === maxPads) {
            stopMIDIPadLearning();
          } else {
            console.log(`[MIDI Pads] Press pad ${_manualLearnIndex + 1}`);
          }
        }
        // Don't trigger pads during learning
        return;
      }
      
      // Map note to pad index (0-15) — MPK's PAD BANK A/B toggle sends
      // different note ranges (36-43 vs 44-51) so DEViLBOX banks A/B are
      // driven directly by the incoming note. No currentBank offset applied.
      let padIndex: number;
      if (learnedNotes.length > 0) {
        padIndex = learnedNotes.indexOf(message.note);
        if (padIndex === -1) {
          padIndex = ((message.note - 36) % 16 + 16) % 16;
        }
      } else {
        padIndex = ((message.note - 36) % 16 + 16) % 16;
      }

      const padId = padIndex + 1;

      if (message.type === 'noteOn' && message.velocity) {
        triggerRef.current(padId, message.velocity);
      } else if (message.type === 'noteOff' || (message.type === 'noteOn' && message.velocity === 0)) {
        releaseRef.current(padId);
      }
    };

    manager.addMessageHandler(handler);

    return () => {
      manager.removeMessageHandler(handler);
      _midiRegistered = false;
    };
  }, []); // Only register once — uses refs for latest state

  return { triggerPad, releasePad, releaseAllHeld, engineRef };
}
