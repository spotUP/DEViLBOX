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
import { applyVelocityCurve, PAD_INSTRUMENT_BASE } from '../../types/drumpad';
import type { ScratchActionId } from '../../types/drumpad';
import { DJ_FX_ACTION_MAP } from '../../engine/drumpad/DjFxActions';
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
          if (pad.djFxAction) {
            DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
            setFxPadActive(padId, false);
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

    // Vocoder PTT (push-to-talk via pad hold)
    if (pad.pttAction) {
      useVocoderStore.getState().setPTT(true);
    }

    // DJ FX with quantization
    if (pad.djFxAction) {
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
        _heldPads.add(padId);
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

        // For sample-only pads (no sustained synth), auto-release after decay.
        // Synth pads sustain while held — releasePad handles note-off.
        if (!pad.synthConfig) {
          const releaseDelayMs = Math.max(pad.decay, 100);
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
    _heldPads.delete(padId);

    // Restore joystick-modulated synth params to pre-modulation values
    resetDrumPadModulation(padId);

    _noteRepeat?.stopRepeat(padId);

    if (!currentProgram || !_engine) return;
    const pad = currentProgram.pads.find(p => p.id === padId);
    if (!pad) return;

    if (pad.djFxAction) {
      DJ_FX_ACTION_MAP[pad.djFxAction]?.disengage();
      setFxPadActive(padId, false);
    }

    // Stop scratch action on release (finish current cycle gracefully)
    if (pad.scratchAction) {
      SCRATCH_ACTION_HANDLERS[pad.scratchAction]?.(false);
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
      if (!PAD_VIEWS.has(view)) return;
      if (message.note === undefined || message.note < MIDI_PAD_LO || message.note > MIDI_PAD_HI) return;

      // Track current MIDI device (use channel as proxy for device ID)
      const deviceKey = `ch${message.channel}`;
      if (_currentDeviceId !== deviceKey) {
        _currentDeviceId = deviceKey;
      }

      const bank = currentBankRef.current;
      const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[bank];
      
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
      
      // Map note to pad index (0-15)
      // Standard GM drum mapping: note 36 = pad 0 (kick), 37 = pad 1, ...
      let padIndex: number;
      if (learnedNotes.length > 0) {
        padIndex = learnedNotes.indexOf(message.note);
        if (padIndex === -1) {
          // Note not in learned set — fall back to GM drum mapping
          padIndex = ((message.note - 36) % 16 + 16) % 16;
        }
      } else {
        padIndex = ((message.note - 36) % 16 + 16) % 16;
      }
      
      const padId = bankOffset + padIndex + 1;

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
