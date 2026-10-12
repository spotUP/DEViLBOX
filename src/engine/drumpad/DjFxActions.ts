/**
 * DjFxActions — Momentary DJ effects triggered from drum pads.
 *
 * Each action engages an audio effect on the master bus on press,
 * and disengages it on release. Uses native Web Audio nodes for
 * zero-latency, direct audio manipulation.
 *
 * Architecture:
 *   Master output → DJ FX bypass/engage → speakers
 *   Pad press → engage() creates/connects effect nodes
 *   Pad release → disengage() disconnects/destroys effect nodes
 */

import * as Tone from 'tone';
import { bpmToMs, type SyncDivision } from '../bpmSync';
import { useTransportStore } from '../../stores/useTransportStore';
import { useDJStore } from '../../stores/useDJStore';
import { getDJEngine } from '../dj/DJEngine';
import { filterSweep, filterReset, echoOut, instantEQKill, quantizedEQKill, cancelAllAutomation, getQuantizeMode, setQuantizeMode, type QuantizeMode } from '../dj/DJQuantizedFX';
import { beatJump, triggerHotCue } from '../dj/DJBeatJump';
import { togglePlay, cueDeck, setDeckLineLoop, clearDeckLineLoop, setDeckPitch, setDeckChannelMuteMask, getDeckChannelMuteMask, deckChannelMutable, setDeckSlipEnabled, setDeckKeyLock, setDeckEchoSend, setDeckEchoParams, setDeckReverbSend, setDeckFilter } from '../dj/DJActions';
import { syncBPMToOther } from '../dj/DJAutoSync';
import { SCRATCH_PATTERNS, type ScratchPattern } from '../dj/DJScratchEngine';
import { getGesture, SCRATCH_GESTURES } from '../dj/scratch/scratchGestureCatalog';
import type { ScratchGestureId, ScratchRole, ScratchSource } from '../dj/scratch/scratchTypes';
import type { ScratchCue } from '../dj/scratch/ScratchRecordVoice';
import { getScratchVoicePool, getScratchVoicePoolIfActive, type PerformHandle } from '../dj/scratch/scratchVoicePool';
import { ambienceFor } from '../dj/scratch/scratchBus';
import { handSpeedFactor } from '../dj/scratch/scratchHandSpeed';
import { playDeckPattern, stopDeckPattern, finishDeckPatternCycle, spinbackDeck, rewindDeck } from '../dj/DJActions';
import { realTimers } from '../dj/autodj/executorTimers';
import type { DeckId } from '../dj/DeckEngine';
import type { DubBusSettings } from '../../types/dub';
import { getDrumPadEngine } from '../../hooks/drumpad/useMIDIPadRouting';

// ─── Types ────────────────────────────────────────────────────────

export type DjFxActionId =
  // Stutter / Glitch
  | 'fx_stutter_4' | 'fx_stutter_8' | 'fx_stutter_16'
  // Delay / Echo
  | 'fx_dub_echo' | 'fx_tape_echo' | 'fx_ping_pong'
  // Filter
  | 'fx_filter_hp_sweep' | 'fx_filter_lp_sweep' | 'fx_filter_bp_sweep'
  // Reverb / Space
  | 'fx_reverb_wash' | 'fx_reverb_spring'
  // Modulation
  | 'fx_flanger' | 'fx_phaser' | 'fx_ring_mod'
  // Distortion
  | 'fx_bitcrush' | 'fx_overdrive'
  // Tape / Vinyl
  | 'fx_tape_stop' | 'fx_vinyl_brake' | 'fx_half_speed'
  // One-shot sounds
  | 'fx_dub_siren' | 'fx_air_horn' | 'fx_laser' | 'fx_noise_riser'
  // Deck FX (real DJ engine effects targeting the active deck)
  | 'fx_deck_hpf_sweep' | 'fx_deck_lpf_sweep' | 'fx_deck_filter_reset'
  | 'fx_deck_echo_out' | 'fx_deck_echo_throw' | 'fx_deck_reverb_out'
  | 'fx_deck_filter_rise' | 'fx_deck_filter_release'
  | 'fx_deck_kill_lo' | 'fx_deck_kill_mid' | 'fx_deck_kill_hi'
  | 'fx_deck_brake'
  | 'fx_deck_spinback'
  | 'fx_deck_rewind'
  | 'fx_deck_jump_m16' | 'fx_deck_jump_m4' | 'fx_deck_jump_m1'
  | 'fx_deck_jump_p1' | 'fx_deck_jump_p4' | 'fx_deck_jump_p16'
  // Hot Cues (trigger/set on active deck)
  | 'fx_hotcue_1' | 'fx_hotcue_2' | 'fx_hotcue_3' | 'fx_hotcue_4'
  | 'fx_hotcue_5' | 'fx_hotcue_6' | 'fx_hotcue_7' | 'fx_hotcue_8'
  // Loop controls (active deck)
  | 'fx_loop_toggle' | 'fx_loop_half' | 'fx_loop_double'
  // Transport (active deck)
  | 'fx_deck_play' | 'fx_deck_cue'
  // Sync
  | 'fx_sync'
  // Crossfader (momentary cut)
  | 'fx_xfader_cut_a' | 'fx_xfader_cut_b'
  // Channel mute toggles (active deck, channels 1-8)
  | 'fx_ch_mute_1' | 'fx_ch_mute_2' | 'fx_ch_mute_3' | 'fx_ch_mute_4'
  | 'fx_ch_mute_5' | 'fx_ch_mute_6' | 'fx_ch_mute_7' | 'fx_ch_mute_8'
  // Key shift (active deck)
  | 'fx_key_up' | 'fx_key_down' | 'fx_key_reset'
  // Quantize cycle
  | 'fx_quantize_cycle'
  // Slip mode toggle
  | 'fx_slip_toggle'
  // Key lock toggle
  | 'fx_keylock_toggle'
  // Scratch gestures (owner scratch plan sections 81, 82; D2 one action path):
  // one per catalogue gesture, on the active deck or - with `record` /
  // a CRATE source - on the scratch record voice (section 16).
  | `fx_scratch_${ScratchGestureId}`
  | 'fx_scratch_stop' | 'fx_scratch_throw' | 'fx_scratch_cue' | 'fx_scratch_anchor'
  | 'fx_scratch_loop' | 'fx_scratch_record' | 'fx_scratch_release';

/**
 * Options a caller may pass when firing an action. Deck actions default to
 * the active deck; the Auto DJ names the deck it performs on and the beat
 * length of the move (plan sections 17-19, 53).
 */
export interface DjFxFireOptions {
  deck?: DeckId;
  /** Who fired it (fireDjFx passes it on): a gesture that fires other actions fires them as the same source. */
  source?: DjFxSource;
  /** Length of the move in beats (sweeps, echo tails). */
  beats?: number;
  /** Amount 0..1 (send level, depth). */
  amount?: number;
  // ── Scratch (owner scratch plan sections 16, 82, 84) ──
  /** Catalogue record id: the gesture plays on the scratch record voice, not a deck. */
  record?: string;
  /** Anchor to cue (attack / vowel / tail / a word / seconds of record). */
  anchor?: ScratchCue;
  /** Section 84 source model; a CRATE source routes to the record voice. */
  scratchSource?: ScratchSource;
  /** Musical role of the event (ambience by role, voice choice). */
  role?: ScratchRole;
  /** Record gestures: context time (seconds) the gesture starts at, sample-accurate (the executor's planned beat). */
  at?: number;
  /** Release: let the running pattern cycle finish instead of a hard stop. */
  finishCycle?: boolean;
  /** Deck gestures: called with the quantize wait when the start is deferred. */
  onWaiting?: (ms: number) => void;
  /** Spinback: stop the deck once the reverse ends (a spinback exit: the record is pulled out). */
  stopAfter?: boolean;
}

export interface DjFxAction {
  id: DjFxActionId;
  name: string;
  category: 'stutter' | 'delay' | 'filter' | 'reverb' | 'modulation' | 'distortion' | 'tape' | 'oneshot' | 'deck' | 'hotcue' | 'loop' | 'transport' | 'mixer' | 'channel' | 'scratch';
  mode: 'momentary' | 'oneshot'; // momentary = hold to engage, oneshot = fire and forget
  engage: (opts?: DjFxFireOptions) => void;
  disengage: (opts?: DjFxFireOptions) => void;
}

// ─── State tracking ───────────────────────────────────────────────

interface ActiveFxState {
  nodes: AudioNode[];
  timer?: ReturnType<typeof setTimeout>;
  oscillator?: OscillatorNode;
  cleanup?: () => void;
}

const activeFx = new Map<DjFxActionId, ActiveFxState>();

function getCtx(): AudioContext {
  return Tone.getContext().rawContext as AudioContext;
}

/**
 * Get the raw Web Audio GainNode that carries ALL master audio
 * (both DJ mixer and tracker output). This is the Tone.js Destination's
 * internal output gain, sitting just before ctx.destination.
 */
function getMasterOutputNode(): GainNode | null {
  try {
    const dest = Tone.getDestination();
    // Destination.output is a Tone.js Gain whose ._gainNode is the raw GainNode
    const toneGain = (dest as any).output;
    if (toneGain?._gainNode) return toneGain._gainNode as GainNode;
    // Fallback: Destination.output.output for double-wrapped case
    if (toneGain?.output) return toneGain.output as GainNode;
    return null;
  } catch {
    return null;
  }
}

function getBpm(): number {
  return useTransportStore.getState().bpm || 120;
}

function cleanupFx(id: DjFxActionId): void {
  const state = activeFx.get(id);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  if (state.oscillator) try { state.oscillator.stop(); } catch { /* */ }
  if (state.cleanup) state.cleanup();
  for (const node of state.nodes) {
    try { node.disconnect(); } catch { /* */ }
  }
  activeFx.delete(id);
}

// ─── DubBus-routed FX helpers ──────────────────────────────────────
// Echo, reverb, and flanger pads route through the real DubBus (SpaceEcho
// WASM + Aelapse spring reverb WASM) instead of creating naive standalone
// Web Audio delay lines. This gives every pad the authentic Jamaican dub
// sound — tape saturation, wow/flutter, spring tank, sidechain pump.

interface DubBusFxState {
  savedSettings: DubBusSettings;
  tapReleaser: (() => void) | null;
  wasEnabled: boolean;
}

const dubBusFxStates = new Map<DjFxActionId, DubBusFxState>();

/**
 * Engage a dub-bus-routed FX: save current settings, push the pad's
 * personality, enable the bus if needed, and open the active deck tap.
 */
function engageDubBusFx(
  id: DjFxActionId,
  overrides: Partial<DubBusSettings>,
): boolean {
  const engine = getDrumPadEngine();
  if (!engine) {
    console.warn(`[DjFx:${id}] no DrumPadEngine — cannot route through DubBus`);
    return false;
  }
  const bus = engine.getDubBus();
  const saved = engine.getDubBusSettings();
  const wasEnabled = bus.isEnabled;

  // Enable the bus if it wasn't (user may not have it on)
  if (!wasEnabled) {
    engine.setDubBusSettings({ enabled: true });
  }

  // Push the pad's echo/reverb/flanger personality
  engine.setDubBusSettings(overrides);

  // Open the active deck's tap so audio flows into the bus
  const deckId = getActiveDeckId();
  const tapReleaser = bus.openDeckTap(deckId, 1.0, 0.005, 0.3);

  dubBusFxStates.set(id, { savedSettings: saved, tapReleaser, wasEnabled });
  return true;
}

/**
 * Disengage a dub-bus-routed FX: close the deck tap and restore the
 * user's prior settings. The bus's built-in mini-drain handles the
 * echo/spring tail naturally.
 */
function disengageDubBusFx(id: DjFxActionId): void {
  const state = dubBusFxStates.get(id);
  if (!state) return;
  dubBusFxStates.delete(id);

  // Close the deck tap — the DubBus mini-drain handles tail decay
  if (state.tapReleaser) state.tapReleaser();

  const engine = getDrumPadEngine();
  if (!engine) return;

  // Restore the user's prior settings
  engine.setDubBusSettings(state.savedSettings);

  // If the bus wasn't enabled before, disable it after a tail window
  if (!state.wasEnabled) {
    setTimeout(() => {
      // Only disable if no other dub-bus FX are active
      if (dubBusFxStates.size === 0) {
        try { engine.setDubBusSettings({ enabled: false }); } catch { /* ok */ }
      }
    }, 3000);
  }
}

// ─── Stutter Effects ──────────────────────────────────────────────

/**
 * Get seconds until next division boundary for beat-phase alignment.
 * Tries DJ deck elapsed position first, falls back to transport position.
 */
function getBeatOffsetSec(periodSec: number): number {
  const periodMs = periodSec * 1000;
  if (periodMs <= 0) return 0;

  let elapsedMs = 0;
  try {
    // Try DJ deck position first (most accurate when DJing)
    const djState = useDJStore.getState();
    const deckId = djState.decks.A.isPlaying ? 'A' : djState.decks.B.isPlaying ? 'B' : null;
    if (deckId) {
      const deck = getDJEngine().getDeck(deckId);
      elapsedMs = deck.playbackMode === 'audio'
        ? deck.audioPlayer.getPosition() * 1000
        : deck.replayer.getElapsedMs();
    }
  } catch { /* fallback below */ }

  if (elapsedMs <= 0) {
    // Fallback: derive from transport BPM + AudioContext time
    const bpm = getBpm();
    const beatSec = 60 / bpm;
    const ctx = getCtx();
    elapsedMs = (ctx.currentTime % beatSec) * 1000;
  }

  const phaseMs = elapsedMs % periodMs;
  return phaseMs > 0 ? (periodMs - phaseMs) / 1000 : 0;
}

function createStutter(division: SyncDivision): DjFxAction {
  const divLabel = division.replace('1/', '');
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    id: `fx_stutter_${divLabel}` as DjFxActionId,
    name: `Stutter ${division}`,
    category: 'stutter',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const periodSec = bpmToMs(getBpm(), division) / 1000;
      const ramp = 0.003; // 3ms anti-click ramp (matches DJ fader LFO)

      const masterNode = getMasterOutputNode();
      if (!masterNode) return;

      // Insert a gain gate on the master bus
      const gate = ctx.createGain();
      gate.gain.value = 1;

      try { masterNode.disconnect(); } catch { /* */ }
      masterNode.connect(gate);
      gate.connect(ctx.destination);

      // Schedule beat-aligned AudioParam automation (same approach as DJ fader LFO)
      const scheduleChops = () => {
        const now = ctx.currentTime;
        const offsetSec = getBeatOffsetSec(periodSec);
        const totalChops = 64; // ~8 bars look-ahead

        gate.gain.cancelScheduledValues(now);
        gate.gain.setValueAtTime(1, now);
        for (let i = 0; i < totalChops; i++) {
          const t = now + offsetSec + i * periodSec;
          // Beat lands here — audio OPEN so beats punch through
          gate.gain.setValueAtTime(1, t);
          // Close on the off-beat
          const mid = t + periodSec * 0.5;
          gate.gain.setValueAtTime(1, mid - ramp);
          gate.gain.linearRampToValueAtTime(0, mid);
          // Re-open before next beat
          const reopen = t + periodSec - ramp;
          gate.gain.setValueAtTime(0, reopen);
          gate.gain.linearRampToValueAtTime(1, reopen + ramp);
        }

        const totalMs = (offsetSec + totalChops * periodSec) * 1000;
        scheduleTimer = setTimeout(() => {
          if (activeFx.has(this.id)) scheduleChops();
        }, Math.max(50, totalMs - 300));
      };
      scheduleChops();

      activeFx.set(this.id, {
        nodes: [gate],
        cleanup: () => {
          if (scheduleTimer) clearTimeout(scheduleTimer);
          scheduleTimer = null;
          // Snap gate to 1 before reconnecting master
          try {
            gate.gain.cancelScheduledValues(ctx.currentTime);
            gate.gain.setValueAtTime(1, ctx.currentTime);
          } catch { /* */ }
          try {
            if (masterNode) {
              masterNode.disconnect();
              masterNode.connect(ctx.destination);
            }
          } catch { /* */ }
        },
      });
    },
    disengage() {
      cleanupFx(this.id);
    },
  };
}

// ─── Delay / Echo Effects ─────────────────────────────────────────

function createDubEcho(): DjFxAction {
  return {
    id: 'fx_dub_echo',
    name: 'Dub Echo',
    category: 'delay',
    mode: 'momentary',
    engage() {
      const delayMs = bpmToMs(getBpm(), '1/4');
      engageDubBusFx(this.id, {
        echoIntensity: 0.65,
        echoWet: 0.75,
        echoRateMs: delayMs,
        echoSyncDivision: '1/4',
        springWet: 0.45,
        returnGain: 0.85,
      });
    },
    disengage() {
      disengageDubBusFx(this.id);
    },
  };
}

function createTapeEcho(): DjFxAction {
  return {
    id: 'fx_tape_echo',
    name: 'Tape Echo',
    category: 'delay',
    mode: 'momentary',
    engage() {
      const delayMs = bpmToMs(getBpm(), '1/8d');
      engageDubBusFx(this.id, {
        echoIntensity: 0.55,
        echoWet: 0.65,
        echoRateMs: delayMs,
        echoSyncDivision: '1/8D',
        springWet: 0.35,
        returnGain: 0.80,
      });
    },
    disengage() {
      disengageDubBusFx(this.id);
    },
  };
}

function createPingPong(): DjFxAction {
  return {
    id: 'fx_ping_pong',
    name: 'Ping Pong',
    category: 'delay',
    mode: 'momentary',
    engage() {
      const delayMs = bpmToMs(getBpm(), '1/8');
      engageDubBusFx(this.id, {
        echoIntensity: 0.50,
        echoWet: 0.70,
        echoRateMs: delayMs,
        echoSyncDivision: '1/8',
        springWet: 0.30,
        returnGain: 0.80,
        // M/S width for stereo spread — the "ping-pong" character
        stereoWidth: 1.8,
      });
    },
    disengage() {
      disengageDubBusFx(this.id);
    },
  };
}

// ─── Filter Sweeps ────────────────────────────────────────────────

function createFilterSweep(type: 'highpass' | 'lowpass' | 'bandpass'): DjFxAction {
  const label = type === 'highpass' ? 'HP' : type === 'lowpass' ? 'LP' : 'BP';
  const id = `fx_filter_${type.slice(0, 2)}_sweep` as DjFxActionId;
  return {
    id,
    name: `${label} Sweep`,
    category: 'filter',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const masterNode = getMasterOutputNode();
      if (!masterNode) return;

      // Get master's current destination
      const originalDestination = ctx.destination;

      // Disconnect master from destination
      try { masterNode.disconnect(); } catch { /* */ }

      // Create filter chain
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = 8;

      // Define start and end frequencies for ping-pong sweep
      let startFreq: number;
      let endFreq: number;

      if (type === 'highpass') {
        startFreq = 20;
        endFreq = 8000;
      } else if (type === 'lowpass') {
        startFreq = 20000;
        endFreq = 200;
      } else {
        startFreq = 500;
        endFreq = 5000;
      }

      // Create ping-pong sweep: start → end → start → end (loops)
      const sweepDuration = 2; // 2 seconds per sweep
      let sweepCount = 0;

      const scheduleSweep = (fromFreq: number, toFreq: number, startTime: number) => {
        filter.frequency.setValueAtTime(fromFreq, startTime);
        filter.frequency.exponentialRampToValueAtTime(toFreq, startTime + sweepDuration);
      };

      // Initial position
      filter.frequency.value = startFreq;

      // Schedule alternating sweeps
      const now = ctx.currentTime;
      scheduleSweep(startFreq, endFreq, now);
      scheduleSweep(endFreq, startFreq, now + sweepDuration);
      scheduleSweep(startFreq, endFreq, now + sweepDuration * 2);
      scheduleSweep(endFreq, startFreq, now + sweepDuration * 3);

      // Continue scheduling sweeps via interval (max 120 iterations = 4min safety)
      let sweepIter = 0;
      const intervalId = setInterval(() => {
        sweepCount++;
        sweepIter++;
        if (sweepIter > 120) { clearInterval(intervalId); return; }
        const nextTime = ctx.currentTime;
        const isForward = sweepCount % 2 === 0;
        scheduleSweep(
          isForward ? startFreq : endFreq,
          isForward ? endFreq : startFreq,
          nextTime
        );
      }, sweepDuration * 1000);

      // Insert filter IN the signal chain (100% wet)
      masterNode.connect(filter);
      filter.connect(originalDestination);

      activeFx.set(this.id, {
        nodes: [filter],
        timer: intervalId,
        cleanup: () => {
          clearInterval(intervalId);
          try {
            masterNode.disconnect();
            masterNode.connect(originalDestination);
          } catch { /* */ }
        },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (!state) return;

      const filter = state.nodes[0] as BiquadFilterNode;
      const ctx = getCtx();

      // Clear the sweep interval
      if (state.timer) {
        clearInterval(state.timer as ReturnType<typeof setInterval>);
      }

      // Cancel any scheduled automation
      filter.frequency.cancelScheduledValues(ctx.currentTime);

      // Sweep back to neutral position over 2s (same speed as sweep-in)
      const sweepBack = 2;
      if (type === 'highpass') {
        filter.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + sweepBack);
      } else if (type === 'lowpass') {
        filter.frequency.exponentialRampToValueAtTime(20000, ctx.currentTime + sweepBack);
      } else {
        filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + sweepBack);
      }

      // Cleanup after sweep completes
      const cleanupTimer = setTimeout(() => cleanupFx(this.id), sweepBack * 1000 + 100);
      state.timer = cleanupTimer;
      activeFx.set(this.id, state);
    },
  };
}

// ─── Reverb ───────────────────────────────────────────────────────

function createReverbWash(): DjFxAction {
  return {
    id: 'fx_reverb_wash',
    name: 'Reverb Wash',
    category: 'reverb',
    mode: 'momentary',
    engage() {
      engageDubBusFx(this.id, {
        springWet: 0.85,
        echoIntensity: 0.30,
        echoWet: 0.40,
        returnGain: 0.90,
      });
    },
    disengage() {
      disengageDubBusFx(this.id);
    },
  };
}

// ─── Modulation ───────────────────────────────────────────────────

function createFlanger(): DjFxAction {
  return {
    id: 'fx_flanger',
    name: 'Flanger',
    category: 'modulation',
    mode: 'momentary',
    engage() {
      engageDubBusFx(this.id, {
        // Use the DubBus liquid sweep (parallel comb filter with LFO)
        sweepAmount: 0.65,
        sweepRateHz: 0.3,
        sweepDepthMs: 6,
        sweepFeedback: 0.78,
        echoIntensity: 0.35,
        echoWet: 0.40,
        springWet: 0.25,
        returnGain: 0.80,
      });
    },
    disengage() {
      disengageDubBusFx(this.id);
    },
  };
}

function createPhaser(): DjFxAction {
  return {
    id: 'fx_phaser',
    name: 'Phaser',
    category: 'modulation',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      // 4-stage allpass phaser
      const stages: BiquadFilterNode[] = [];
      for (let i = 0; i < 4; i++) {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.frequency.value = 1000 + i * 500;
        ap.Q.value = 0.5;
        stages.push(ap);
      }

      // Chain allpass stages
      for (let i = 0; i < stages.length - 1; i++) {
        stages[i].connect(stages[i + 1]);
      }

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.3;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2000;
      lfo.connect(lfoGain);
      for (const stage of stages) {
        lfoGain.connect(stage.frequency);
      }
      lfo.start();

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.5;
      stages[stages.length - 1].connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(stages[0]);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [...stages, lfoGain, wetGain, tap],
        oscillator: lfo,
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() { cleanupFx(this.id); },
  };
}

function createRingMod(): DjFxAction {
  return {
    id: 'fx_ring_mod',
    name: 'Ring Mod',
    category: 'modulation',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = 300;

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0; // Modulated by carrier
      carrier.connect(ringGain.gain);
      carrier.start();

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;
      ringGain.connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(ringGain);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [ringGain, wetGain, tap],
        oscillator: carrier,
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() { cleanupFx(this.id); },
  };
}

// ─── Distortion ───────────────────────────────────────────────────

function createBitcrush(): DjFxAction {
  return {
    id: 'fx_bitcrush',
    name: 'Bitcrush',
    category: 'distortion',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const masterNode = getMasterOutputNode();
      if (!masterNode) return;

      // Get master's current destination
      const originalDestination = ctx.destination;

      // Disconnect master from destination
      try { masterNode.disconnect(); } catch { /* */ }

      // Bitcrush via waveshaper quantization
      const shaper = ctx.createWaveShaper();
      const bits = 4;
      const steps = Math.pow(2, bits);
      const curve = new Float32Array(65536);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / 32768) - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      shaper.curve = curve;

      // Insert shaper IN the signal chain (100% wet)
      masterNode.connect(shaper);
      shaper.connect(originalDestination);

      activeFx.set(this.id, {
        nodes: [shaper],
        cleanup: () => {
          try {
            masterNode.disconnect();
            masterNode.connect(originalDestination);
          } catch { /* */ }
        },
      });
    },
    disengage() { cleanupFx(this.id); },
  };
}

function createOverdrive(): DjFxAction {
  return {
    id: 'fx_overdrive',
    name: 'Overdrive',
    category: 'distortion',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const masterNode = getMasterOutputNode();
      if (!masterNode) return;

      // Get master's current destination
      const originalDestination = ctx.destination;

      // Disconnect master from destination
      try { masterNode.disconnect(); } catch { /* */ }

      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * 3);
      }
      shaper.curve = curve;

      // Insert overdrive IN the signal chain (100% wet)
      masterNode.connect(shaper);
      shaper.connect(originalDestination);

      activeFx.set(this.id, {
        nodes: [shaper],
        cleanup: () => {
          try {
            masterNode.disconnect();
            masterNode.connect(originalDestination);
          } catch { /* */ }
        },
      });
    },
    disengage() { cleanupFx(this.id); },
  };
}

// ─── Tape / Vinyl Effects ─────────────────────────────────────────

/**
 * Pitch-ramp helper for tape/vinyl stop effects.
 *
 * Uses the same pattern as `createDeckBrake`: rAF-driven pitch pulldown on
 * the active deck via `setDeckPitch`, then pause and restore pitch on release.
 * Previous implementations ducked master gain instead of ramping pitch, which
 * just faded the whole mix out briefly — not the "spinning down" sound users
 * expect from tape-stop / vinyl-brake.
 */
function rampDeckStop(
  id: DjFxActionId,
  durationMs: number,
  shape: 'quadratic' | 'cubic',
  rafRef: { raf: number },
): void {
  cleanupFx(id);
  const deckId = getActiveDeckId();
  try {
    const deck = getDJEngine().getDeck(deckId);
    const startPitch = useDJStore.getState().decks[deckId]?.pitchOffset ?? 0;
    const startRate = Math.pow(2, startPitch / 12);
    const startTime = performance.now();
    const animate = () => {
      const progress = Math.min(1, (performance.now() - startTime) / durationMs);
      // quadratic = tape feel (gradual); cubic = vinyl feel (abrupt, late drop)
      const eased = shape === 'cubic' ? progress * progress * progress : progress * progress;
      const rate = startRate * Math.max(0.01, 1 - eased);
      setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
      if (progress < 1) {
        rafRef.raf = requestAnimationFrame(animate);
      } else {
        try { deck.pause(); } catch { /* */ }
        useDJStore.getState().setDeckPlaying(deckId, false);
        // Snap pitch back to the pre-stop value so the next play() resumes
        // at the DJ's tempo instead of stuck at -infinity semitones.
        setDeckPitch(deckId, startPitch);
        rafRef.raf = 0;
      }
    };
    rafRef.raf = requestAnimationFrame(animate);
  } catch { /* engine not ready */ }
}

function createTapeStop(): DjFxAction {
  const ref = { raf: 0 };
  return {
    id: 'fx_tape_stop',
    name: 'Tape Stop',
    category: 'tape',
    mode: 'oneshot',
    engage() {
      // 1.2 s quadratic ramp — leisurely tape spindown.
      rampDeckStop(this.id, 1200, 'quadratic', ref);
    },
    disengage() {
      if (ref.raf) { cancelAnimationFrame(ref.raf); ref.raf = 0; }
      cleanupFx(this.id);
    },
  };
}

function createVinylBrake(): DjFxAction {
  const ref = { raf: 0 };
  return {
    id: 'fx_vinyl_brake',
    name: 'Vinyl Brake',
    category: 'tape',
    mode: 'oneshot',
    engage() {
      // 0.5 s cubic ramp — abrupt, hand-on-platter feel.
      rampDeckStop(this.id, 500, 'cubic', ref);
    },
    disengage() {
      if (ref.raf) { cancelAnimationFrame(ref.raf); ref.raf = 0; }
      cleanupFx(this.id);
    },
  };
}

// ─── One-Shot Sounds ──────────────────────────────────────────────

function createDubSiren(): DjFxAction {
  return {
    id: 'fx_dub_siren',
    name: 'Dub Siren',
    category: 'oneshot',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      // Classic dub siren: oscillator sweeping between two pitches
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 800;

      // LFO to sweep siren pitch
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 2; // 2 Hz sweep rate
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 400; // ±400Hz sweep range
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      // Delay + feedback for spacey dub echo
      const delay = ctx.createDelay(2);
      delay.delayTime.value = bpmToMs(getBpm(), '1/4') / 1000;
      const fb = ctx.createGain();
      fb.gain.value = 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3000;

      delay.connect(filter);
      filter.connect(fb);
      fb.connect(delay);

      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.3;
      osc.connect(sirenGain);
      sirenGain.connect(delay);
      sirenGain.connect(ctx.destination);
      delay.connect(ctx.destination);
      osc.start();

      activeFx.set(this.id, {
        nodes: [lfoGain, sirenGain, delay, fb, filter],
        oscillator: osc,
        cleanup: () => { try { lfo.stop(); } catch { /* */ } },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        // Fade siren out, let echo tail ring
        const sirenGain = state.nodes[1] as GainNode;
        const fb = state.nodes[3] as GainNode;
        const ctx = getCtx();
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        state.timer = setTimeout(() => cleanupFx(this.id), 2000);
        activeFx.set(this.id, { ...state });
      }
    },
  };
}

function createAirHorn(): DjFxAction {
  return {
    id: 'fx_air_horn',
    name: 'Air Horn',
    category: 'oneshot',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      // Air horn: detuned sawtooth chord
      const freqs = [540, 545, 810, 815]; // Slightly detuned for richness
      const oscs: OscillatorNode[] = [];
      const merger = ctx.createGain();
      merger.gain.value = 0.15;

      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(merger);
        osc.start();
        oscs.push(osc);
      }

      // Envelope: quick attack, sustain while held
      const envelope = ctx.createGain();
      envelope.gain.value = 0;
      envelope.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
      merger.connect(envelope);
      envelope.connect(ctx.destination);

      activeFx.set(this.id, {
        nodes: [merger, envelope],
        oscillator: oscs[0],
        cleanup: () => {
          for (const osc of oscs) { try { osc.stop(); } catch { /* */ } }
        },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const envelope = state.nodes[1] as GainNode;
        const ctx = getCtx();
        envelope.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        state.timer = setTimeout(() => cleanupFx(this.id), 300);
        activeFx.set(this.id, { ...state });
      }
    },
  };
}

function createLaser(): DjFxAction {
  return {
    id: 'fx_laser',
    name: 'Laser',
    category: 'oneshot',
    mode: 'oneshot',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 4000;
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);

      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);

      const timer = setTimeout(() => cleanupFx(this.id), 700);
      activeFx.set(this.id, { nodes: [gain], oscillator: osc, timer });
    },
    disengage() { /* one-shot, nothing to release */ },
  };
}

function createNoiseRiser(): DjFxAction {
  return {
    id: 'fx_noise_riser',
    name: 'Noise Riser',
    category: 'oneshot',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();

      // White noise through a rising filter
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3;
      filter.frequency.value = 200;
      filter.frequency.exponentialRampToValueAtTime(12000, ctx.currentTime + 4);

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();

      activeFx.set(this.id, {
        nodes: [filter, gain],
        cleanup: () => { try { noise.stop(); } catch { /* */ } },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (!state) return;
      const ctx = getCtx();
      const now = ctx.currentTime;
      const fadeTime = 1.2;

      const gainNode = state.nodes.find(n => n instanceof GainNode) as GainNode | undefined;
      const filterNode = state.nodes.find(n => n instanceof BiquadFilterNode) as BiquadFilterNode | undefined;

      if (gainNode) {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);
      }
      // Sweep filter back down for the "falling" effect
      if (filterNode) {
        filterNode.frequency.cancelScheduledValues(now);
        filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
        filterNode.frequency.exponentialRampToValueAtTime(200, now + fadeTime);
      }

      const timer = setTimeout(() => cleanupFx(this.id), fadeTime * 1000 + 50);
      state.timer = timer as unknown as ReturnType<typeof setTimeout>;
    },
  };
}

// ─── Deck-Targeted FX (real DJ engine) ────────────────────────────

/** Returns the first playing deck (A > B > C), defaulting to A. */
function getActiveDeckId(): DeckId {
  try {
    const { decks } = useDJStore.getState();
    if (decks.B.isPlaying && !decks.A.isPlaying) return 'B';
    if (decks.C.isPlaying && !decks.A.isPlaying && !decks.B.isPlaying) return 'C';
  } catch { /* store not ready */ }
  return 'A';
}

// Track cancel functions for deck sweeps so disengage can stop them
const deckSweepCancels = new Map<string, () => void>();

function deckBeatSec(deckId: DeckId): number {
  try {
    const state = useDJStore.getState().decks[deckId];
    const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
    return 60 / bpm;
  } catch {
    return 0.5;
  }
}

/** Remember which deck a momentary action was engaged on, so its release lands on the same deck. */
const engagedDeck = new Map<string, DeckId>();

function createDeckFilterSweep(direction: 'hpf' | 'lpf'): DjFxAction {
  const target = direction === 'hpf' ? -0.85 : 0.85;
  const id = direction === 'hpf' ? 'fx_deck_hpf_sweep' : 'fx_deck_lpf_sweep';
  return {
    id: id as DjFxActionId,
    name: direction === 'hpf' ? 'Deck HPF' : 'Deck LPF',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      const cancel = filterSweep(deckId, target, opts?.beats ?? 4);
      deckSweepCancels.set(this.id, cancel);
    },
    disengage(opts) {
      // Cancel the forward sweep
      const cancel = deckSweepCancels.get(this.id);
      if (cancel) { cancel(); deckSweepCancels.delete(this.id); }
      // Sweep back to center at the same speed (4 beats)
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      const returnCancel = filterSweep(deckId, 0, 4);
      deckSweepCancels.set(this.id + '_return', returnCancel);
    },
  };
}

function createDeckFilterReset(): DjFxAction {
  return {
    id: 'fx_deck_filter_reset',
    name: 'Deck Filter Reset',
    category: 'deck',
    mode: 'oneshot',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      filterReset(deckId);
      cancelAllAutomation();
    },
    disengage() { /* one-shot — nothing to undo */ },
  };
}

/**
 * Filter rise (plan section 19, 53 "build -> filter rise"): the deck starts
 * high-passed and opens to flat over `beats` beats. Used on the incoming deck
 * of a filter build; a pad or MIDI press does the same on the active deck.
 */
function createDeckFilterRise(): DjFxAction {
  return {
    id: 'fx_deck_filter_rise',
    name: 'Deck Filter Rise',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      setDeckFilter(deckId, -0.8);
      const key = `${this.id}:${deckId}`;
      deckSweepCancels.get(key)?.();
      const cancel = filterSweep(deckId, 0, opts?.beats ?? 16, () => { setDeckFilter(deckId, 0); setDjFxActive('fx_deck_filter_rise', null); });
      deckSweepCancels.set(key, cancel);
    },
    disengage(opts) {
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      // The sweep belongs to the deck it runs on: cancelling another deck's sweep leaves this one moving.
      const key = `${this.id}:${deckId}`;
      const cancel = deckSweepCancels.get(key);
      if (cancel) { cancel(); deckSweepCancels.delete(key); }
      engagedDeck.delete(this.id);
      setDeckFilter(deckId, 0);
    },
  };
}

/**
 * Filter release (plan section 19 "release"): the deck's low end leaves
 * through a continuous high-pass rise over `beats` beats, most of it in the
 * last quarter. The outgoing deck of a blend; the pad does it on the active deck.
 */
function createDeckFilterRelease(): DjFxAction {
  return {
    id: 'fx_deck_filter_release',
    name: 'Deck Filter Release',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      const beats = opts?.beats ?? 16;
      const key = `${this.id}:${deckId}`;
      deckSweepCancels.get(key)?.();
      // Two stages: gentle to -0.35 over the first 60 %, then up to -0.9.
      const first = filterSweep(deckId, -0.35, Math.max(1, Math.floor(beats * 0.6)), () => {
        if (!deckSweepCancels.has(key)) return;
        const second = filterSweep(deckId, -0.9, Math.max(1, Math.ceil(beats * 0.4)), () => setDjFxActive('fx_deck_filter_release', null));
        deckSweepCancels.set(key, second);
      });
      deckSweepCancels.set(key, first);
    },
    disengage(opts) {
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      // The sweep belongs to the deck it runs on: cancelling another deck's sweep leaves this one moving.
      const key = `${this.id}:${deckId}`;
      const cancel = deckSweepCancels.get(key);
      if (cancel) { cancel(); deckSweepCancels.delete(key); }
      engagedDeck.delete(this.id);
      setDeckFilter(deckId, 0);
    },
  };
}

/**
 * True echo-out (plan section 18): the deck's pre-fader echo send rises
 * (beat-synced dotted eighth, feedback 0.62) while the dry signal decays and
 * the deck stops; the tail keeps ringing past the channel gain. The same
 * action for the pad, MIDI and the Auto DJ.
 */
function createDeckEchoOut(): DjFxAction {
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    id: 'fx_deck_echo_out',
    name: 'Deck Echo Out',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      const beats = opts?.beats ?? 8;
      const beatSec = deckBeatSec(deckId);
      setDeckEchoParams(deckId, beatSec * 0.75, 0.62);
      setDeckEchoSend(deckId, opts?.amount ?? 0.85);
      const cancel = echoOut(deckId, beats, () => {
        // Dry gone, deck stopped: let the tail ring, then close the send.
        if (tailTimer) clearTimeout(tailTimer);
        tailTimer = setTimeout(() => { setDeckEchoSend(deckId, 0); setDjFxActive('fx_deck_echo_out', null); tailTimer = null; }, Math.min(4000, beatSec * 8 * 1000));
      });
      deckSweepCancels.set(this.id, cancel);
    },
    disengage(opts) {
      const cancel = deckSweepCancels.get(this.id);
      if (cancel) { cancel(); deckSweepCancels.delete(this.id); }
      if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; }
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      setDeckEchoSend(deckId, 0);
    },
  };
}

/** Echo throw (plan section 53 "phrase ending -> delay throw"): a short burst into the echo, then the tail. */
function createDeckEchoThrow(): DjFxAction {
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    id: 'fx_deck_echo_throw',
    name: 'Deck Echo Throw',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      const beatSec = deckBeatSec(deckId);
      setDeckEchoParams(deckId, beatSec, 0.5);
      setDeckEchoSend(deckId, opts?.amount ?? 0.7);
      const holdMs = (opts?.beats ?? 2) * beatSec * 1000;
      if (tailTimer) clearTimeout(tailTimer);
      tailTimer = setTimeout(() => { setDeckEchoSend(deckId, 0); setDjFxActive('fx_deck_echo_throw', null); tailTimer = null; }, holdMs);
    },
    disengage(opts) {
      if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; }
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      setDeckEchoSend(deckId, 0);
    },
  };
}

/** Reverb out (plan section 53 "breakdown -> reverb expansion"): the reverb send opens while the dry decays. */
function createDeckReverbOut(): DjFxAction {
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    id: 'fx_deck_reverb_out',
    name: 'Deck Reverb Out',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      setDeckReverbSend(deckId, opts?.amount ?? 0.8);
      const beats = opts?.beats ?? 8;
      const cancel = echoOut(deckId, beats, () => {
        if (tailTimer) clearTimeout(tailTimer);
        tailTimer = setTimeout(() => { setDeckReverbSend(deckId, 0); setDjFxActive('fx_deck_reverb_out', null); tailTimer = null; }, 1500);
      });
      deckSweepCancels.set(this.id, cancel);
    },
    disengage(opts) {
      const cancel = deckSweepCancels.get(this.id);
      if (cancel) { cancel(); deckSweepCancels.delete(this.id); }
      if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; }
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      setDeckReverbSend(deckId, 0);
    },
  };
}

function createDeckEQKill(band: 'low' | 'mid' | 'high'): DjFxAction {
  const bandLabel = band === 'low' ? 'Lo' : band === 'mid' ? 'Mid' : 'Hi';
  const id = `fx_deck_kill_${band === 'low' ? 'lo' : band === 'mid' ? 'mid' : 'hi'}` as DjFxActionId;
  return {
    id,
    name: `Deck Kill ${bandLabel}`,
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      // The kill button reads the store at once; the engine follows the quantize setting.
      useDJStore.getState().setDeckEQKill(deckId, band, true);
      if (getQuantizeMode() !== 'off') quantizedEQKill(deckId, band, true); else instantEQKill(deckId, band, true);
    },
    disengage(opts) {
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      useDJStore.getState().setDeckEQKill(deckId, band, false);
      if (getQuantizeMode() !== 'off') quantizedEQKill(deckId, band, false); else instantEQKill(deckId, band, false);
    },
  };
}

/**
 * Spinback: the deck's own platter physics yanks the record back and the
 * audio follows (DJActions.spinbackDeck - the tracker's spinback, one
 * physics path). The pad's record plays on afterwards; Auto DJ's spinback
 * exit (opts.stopAfter: the record is pulled out) stops the deck once the
 * reverse ends.
 */
function createDeckSpinback(): DjFxAction {
  return {
    id: 'fx_deck_spinback',
    name: 'Spinback',
    category: 'deck',
    mode: 'oneshot',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      if (!spinbackDeck(deckId, { stopAfter: !!opts?.stopAfter, onComplete: () => setDjFxActive('fx_deck_spinback', null) })) return;
      setDjFxActive('fx_deck_spinback', deckId);
    },
    disengage() { /* the platter runs its own arc */ },
  };
}

/**
 * Rewind (the reggae sound-system rewind): the selector drags the deck's record
 * back and the SAME tune plays again from its first downbeat
 * (DJActions.rewindDeck, the deck's own platter physics). The Dub Siren wails
 * through the pull-back and the Air Horn blasts on the restart downbeat - the
 * registry's own one-shots, fired as their pads fire them. Not a spinback: the
 * spinback ends a tune, the rewind replays it.
 */
function createDeckRewind(): DjFxAction {
  return {
    id: 'fx_deck_rewind',
    name: 'Rewind',
    category: 'deck',
    mode: 'oneshot',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      const source = opts?.source ?? 'pad';
      const started = rewindDeck(deckId, {
        onRestart: () => {
          releaseDjFx('fx_dub_siren', { source });
          fireDjFx('fx_air_horn', { source });
          const beatMs = 60_000 / Math.max(60, useDJStore.getState().decks[deckId].effectiveBPM || 120);
          realTimers.setTimeout(() => releaseDjFx('fx_air_horn', { source }), beatMs);
          setDjFxActive('fx_deck_rewind', null);
        },
      });
      if (!started) return;
      setDjFxActive('fx_deck_rewind', deckId);
      fireDjFx('fx_dub_siren', { source });
    },
    disengage() { /* the hand runs its own gesture */ },
  };
}

function createDeckBrake(): DjFxAction {
  let brakeRaf = 0;
  return {
    id: 'fx_deck_brake',
    name: 'Deck Brake',
    category: 'deck',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      try {
        const deck = getDJEngine().getDeck(deckId);
        const beatSec = deckBeatSec(deckId);
        const durationMs = (opts?.beats ?? 2) * beatSec * 1000;

        const startTime = performance.now();
        const animate = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          const rate = 1 - progress * progress; // quadratic deceleration
          setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
          if (progress < 1) {
            brakeRaf = requestAnimationFrame(animate);
          } else {
            try { deck.pause(); } catch { /* */ }
            useDJStore.getState().setDeckPlaying(deckId, false);
            setDeckPitch(deckId, 0);
            setDjFxActive('fx_deck_brake', null);
          }
        };
        brakeRaf = requestAnimationFrame(animate);
      } catch { /* engine not ready */ }
    },
    disengage(opts) {
      cancelAnimationFrame(brakeRaf);
      brakeRaf = 0;
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      setDeckPitch(deckId, 0);
    },
  };
}

function createHalfSpeed(): DjFxAction {
  return {
    id: 'fx_half_speed',
    name: 'Half Speed',
    category: 'tape',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      engagedDeck.set(this.id, deckId);
      // -12 semitones = half speed (one octave down)
      setDeckPitch(deckId, -12);
    },
    disengage(opts) {
      const deckId = opts?.deck ?? engagedDeck.get(this.id) ?? getActiveDeckId();
      engagedDeck.delete(this.id);
      setDeckPitch(deckId, 0);
    },
  };
}

function createDeckBeatJump(beats: number): DjFxAction {
  const sign = beats > 0 ? 'p' : 'm';
  const abs = Math.abs(beats);
  const id = `fx_deck_jump_${sign}${abs}` as DjFxActionId;
  const label = beats > 0 ? `Deck +${abs}` : `Deck −${abs}`;
  return {
    id,
    name: label,
    category: 'deck',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      beatJump(deckId, beats);
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Hot Cue Actions ──────────────────────────────────────────────

function createHotCue(index: number): DjFxAction {
  return {
    id: `fx_hotcue_${index}` as DjFxActionId,
    name: `Hot Cue ${index}`,
    category: 'hotcue',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      triggerHotCue(deckId, index - 1); // triggerHotCue uses 0-based index
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Loop Actions ─────────────────────────────────────────────────

const LOOP_SIZES: (1 | 2 | 4 | 8 | 16 | 32)[] = [1, 2, 4, 8, 16, 32];

function createLoopToggle(): DjFxAction {
  return {
    id: 'fx_loop_toggle',
    name: 'Loop On/Off',
    category: 'loop',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      if (state.loopActive) {
        clearDeckLineLoop(deckId);
        useDJStore.getState().setDeckLoop(deckId, 'off', false);
      } else {
        setDeckLineLoop(deckId, state.lineLoopSize);
        useDJStore.getState().setDeckLoop(deckId, 'line', true);
      }
    },
    disengage() { /* one-shot toggle */ },
  };
}

function createLoopHalf(): DjFxAction {
  return {
    id: 'fx_loop_half',
    name: 'Loop ÷2',
    category: 'loop',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      const idx = LOOP_SIZES.indexOf(state.lineLoopSize);
      if (idx > 0) {
        const newSize = LOOP_SIZES[idx - 1];
        useDJStore.getState().setDeckLoopSize(deckId, newSize);
        if (state.loopActive) setDeckLineLoop(deckId, newSize);
      }
    },
    disengage() { /* one-shot */ },
  };
}

function createLoopDouble(): DjFxAction {
  return {
    id: 'fx_loop_double',
    name: 'Loop ×2',
    category: 'loop',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      const idx = LOOP_SIZES.indexOf(state.lineLoopSize);
      if (idx < LOOP_SIZES.length - 1) {
        const newSize = LOOP_SIZES[idx + 1];
        useDJStore.getState().setDeckLoopSize(deckId, newSize);
        if (state.loopActive) setDeckLineLoop(deckId, newSize);
      }
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Transport Actions ────────────────────────────────────────────

function createDeckPlay(): DjFxAction {
  return {
    id: 'fx_deck_play',
    name: 'Deck Play/Pause',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      togglePlay(deckId);
    },
    disengage() { /* toggle — no release action */ },
  };
}

function createDeckCue(): DjFxAction {
  return {
    id: 'fx_deck_cue',
    name: 'Deck Cue',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      cueDeck(deckId, state.cuePoint);
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Sync Action ──────────────────────────────────────────────────

function createSync(): DjFxAction {
  return {
    id: 'fx_sync',
    name: 'Sync BPM',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const otherDeckId: DeckId = deckId === 'A' ? 'B' : 'A';
      try {
        syncBPMToOther(deckId, otherDeckId);
      } catch { /* engine not ready */ }
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Crossfader Cut Actions ───────────────────────────────────────

function createXfaderCut(side: 'a' | 'b'): DjFxAction {
  let savedPosition = 0.5;
  return {
    id: `fx_xfader_cut_${side}` as DjFxActionId,
    name: side === 'a' ? 'Cut to Deck A' : 'Cut to Deck B',
    category: 'mixer',
    mode: 'momentary',
    engage() {
      savedPosition = useDJStore.getState().crossfaderPosition;
      useDJStore.getState().setCrossfader(side === 'a' ? 0 : 1);
    },
    disengage() {
      useDJStore.getState().setCrossfader(savedPosition);
    },
  };
}

// ─── Channel Mute Toggle Actions ──────────────────────────────────

/* Channel mask convention: bit N = 1 → channel N is audible; bit N = 0 →
 * channel N is muted. The pad toggles the deck's one mask (useDJStore
 * decks[id].channelMask, the same the deck buttons write; every deck load
 * resets it to all audible). A channel the loaded song does not have, or a
 * render without channel stems, leaves the pad without effect. */
function createChannelMuteToggle(channel: number): DjFxAction {
  return {
    id: `fx_ch_mute_${channel}` as DjFxActionId,
    name: `Mute Ch ${channel}`,
    category: 'channel',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      if (!deckChannelMutable(deckId, channel - 1)) return;
      const current = getDeckChannelMuteMask(deckId);
      const bit = 1 << (channel - 1);
      const newMask = (current ^ bit) >>> 0; // toggle bit, keep as uint32
      setDeckChannelMuteMask(deckId, newMask);
    },
    disengage() { /* toggle — no release action */ },
  };
}

// ─── Key Shift Actions ────────────────────────────────────────────

function createKeyShift(direction: 'up' | 'down' | 'reset'): DjFxAction {
  const labels = { up: 'Key +1', down: 'Key −1', reset: 'Key Reset' };
  return {
    id: `fx_key_${direction}` as DjFxActionId,
    name: labels[direction],
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      if (direction === 'reset') {
        setDeckPitch(deckId, 0);
      } else {
        const current = useDJStore.getState().decks[deckId].pitchOffset || 0;
        setDeckPitch(deckId, current + (direction === 'up' ? 1 : -1));
      }
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Quantize Cycle Action ────────────────────────────────────────

function createQuantizeCycle(): DjFxAction {
  const cycle: QuantizeMode[] = ['off', 'beat', 'bar'];
  return {
    id: 'fx_quantize_cycle',
    name: 'Quantize Cycle',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const current = getQuantizeMode();
      const idx = cycle.indexOf(current);
      const next = cycle[(idx + 1) % cycle.length];
      setQuantizeMode(next);
    },
    disengage() { /* one-shot */ },
  };
}

// ─── Slip Mode Toggle Action ─────────────────────────────────────

function createSlipToggle(): DjFxAction {
  return {
    id: 'fx_slip_toggle',
    name: 'Slip Mode',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      const newEnabled = !state.slipEnabled;
      useDJStore.getState().setDeckSlip(deckId, newEnabled);
      setDeckSlipEnabled(deckId, newEnabled);
    },
    disengage() { /* toggle */ },
  };
}

// ─── Key Lock Toggle Action ──────────────────────────────────────

function createKeyLockToggle(): DjFxAction {
  return {
    id: 'fx_keylock_toggle',
    name: 'Key Lock',
    category: 'transport',
    mode: 'oneshot',
    engage() {
      const deckId = getActiveDeckId();
      const state = useDJStore.getState().decks[deckId];
      setDeckKeyLock(deckId, !state.keyLockEnabled);
    },
    disengage() { /* toggle */ },
  };
}

const stutterActions = [
  createStutter('1/4'),
  createStutter('1/8'),
  createStutter('1/16'),
];

// ─── Scratch gestures (owner scratch plan sections 81, 82) ─────────────
//
// One action per catalogue gesture (27). Engage plays it on the active deck
// (`DJActions.playDeckPattern`, the one deck seam) or - when the fire names a
// `record` / a CRATE source, or the gesture has no deck pattern - on the
// scratch record voice (section 16: the deck keeps its musical role).
// Disengage releases whichever was engaged. The Auto DJ, pads, keyboard,
// MIDI, MCP, tracker `Xnn` and the set player all fire these through
// `fireDjFx`.

const scratchDeck = new Map<string, DeckId>();
const scratchVoiceHandles = new Map<string, PerformHandle>();
const PATTERN_BY_GESTURE = new Map<ScratchGestureId, ScratchPattern>(SCRATCH_PATTERNS.map((p) => [p.gestureId, p]));

function deckBpm(deckId: DeckId): number {
  try { return useDJStore.getState().decks[deckId].effectiveBPM || 120; } catch { return 120; }
}

function wantsRecordVoice(gestureId: ScratchGestureId, opts?: DjFxFireOptions): boolean {
  if (opts?.record || opts?.scratchSource?.type === 'CRATE') return true;
  return !PATTERN_BY_GESTURE.has(gestureId);
}

function engageRecordGesture(id: string, gestureId: ScratchGestureId, opts?: DjFxFireOptions): void {
  const deckId = opts?.deck ?? getActiveDeckId();
  const role = opts?.role;
  // A second fire of the same gesture replaces its voice: release the old
  // one first, or it loops on with no handle left to stop it.
  scratchVoiceHandles.get(id)?.release(opts?.at);
  scratchVoiceHandles.delete(id);
  const handle = getScratchVoicePool().perform(getGesture(gestureId), {
    record: opts?.record ?? (opts?.scratchSource?.type === 'CRATE' ? opts.scratchSource.recordId : undefined),
    role,
    bpm: deckBpm(deckId),
    ambience: ambienceFor(role ?? 'ACCENT'),
    velocity: opts?.amount,
    cue: opts?.anchor,
    at: opts?.at,
  });
  if (handle) scratchVoiceHandles.set(id, handle);
}

/**
 * Release every gesture playing on the scratch record voice: the held ones by their handles and
 * every busy voice (a throw rides out without a handle). Scratch Stop and Scratch Release end
 * this same set (audit SA-m1).
 */
function releaseRecordGestures(): void {
  for (const handle of scratchVoiceHandles.values()) handle.release();
  scratchVoiceHandles.clear();
  getScratchVoicePoolIfActive()?.releaseAll();
}

function createScratchGesture(gestureId: ScratchGestureId): DjFxAction {
  const gesture = getGesture(gestureId);
  const pattern = PATTERN_BY_GESTURE.get(gestureId);
  return {
    id: `fx_scratch_${gestureId}`,
    name: gesture.name,
    category: 'scratch',
    mode: 'momentary',
    engage(opts) {
      if (wantsRecordVoice(gestureId, opts) || !pattern) { engageRecordGesture(this.id, gestureId, opts); return; }
      const deckId = opts?.deck ?? getActiveDeckId();
      scratchDeck.set(this.id, deckId);
      // a planned event (`beats` = its length): the stroke starts at its beginning now and plays
      // whole cycles (SA-M2, SA-m5); `amount` (plan velocity) is the hand speed; a pressed pattern loops phase-aligned. `role` and `at` are
      // record-voice only (bus ambience; sample-accurate worklet start).
      const planned = opts?.beats !== undefined && opts.beats > 0
        ? { phase: 0, cycles: Math.max(1, Math.round(opts.beats / gesture.cycleBeats)), speed: handSpeedFactor(opts.amount) }
        : undefined;
      playDeckPattern(deckId, pattern.name, opts?.onWaiting, planned);
      try { useDJStore.getState().setDeckPattern(deckId, pattern.name); } catch { /* store not ready */ }
    },
    disengage(opts) {
      const handle = scratchVoiceHandles.get(this.id);
      if (handle) {
        // a scheduled stop keeps the handle: an immediate release (cancel, Stop) can still end it now
        if (opts?.at === undefined) scratchVoiceHandles.delete(this.id);
        handle.release(opts?.at);
        return;
      }
      const deckId = opts?.deck ?? scratchDeck.get(this.id) ?? getActiveDeckId();
      scratchDeck.delete(this.id);
      if (opts?.finishCycle) finishDeckPatternCycle(deckId); else stopDeckPattern(deckId);
      try { useDJStore.getState().setDeckPattern(deckId, null); } catch { /* store not ready */ }
    },
  };
}

function createScratchStop(): DjFxAction {
  return {
    id: 'fx_scratch_stop',
    name: 'Scratch Stop',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      stopDeckPattern(deckId);
      try { useDJStore.getState().setDeckPattern(deckId, null); } catch { /* store not ready */ }
      // Stop means every scratch: the record voice's held gestures too.
      releaseRecordGestures();
    },
    disengage() {},
  };
}

/** Section 41 / 82 ScratchThrow: a clean drop of a record (or a word of it) on the voice. */
function createScratchThrow(): DjFxAction {
  return {
    id: 'fx_scratch_throw',
    name: 'Scratch Throw',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) {
      const gestureId: ScratchGestureId = opts?.beats !== undefined && opts.beats >= 4 ? 'dropPhrase' : 'drop';
      engageRecordGesture(this.id, gestureId, { ...opts, record: opts?.record });
      scratchVoiceHandles.delete(this.id); // a throw rides out on its own
    },
    disengage() {},
  };
}

/** Section 82 ScratchCue: re-cue the record voice to an anchor. */
function createScratchCue(): DjFxAction {
  return {
    id: 'fx_scratch_cue',
    name: 'Scratch Cue',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) { getScratchVoicePoolIfActive()?.cue(opts?.anchor ?? 'vowel', opts?.role); },
    disengage() {},
  };
}

/** Section 82 ScratchAnchor: set the anchor the next record gesture cues. */
function createScratchAnchor(): DjFxAction {
  return {
    id: 'fx_scratch_anchor',
    name: 'Scratch Anchor',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) {
      const pool = getScratchVoicePool();
      pool.anchor = opts?.anchor ?? (pool.voices.find((v) => v.busy)?.position ?? null);
    },
    disengage() {},
  };
}

/** Section 82 ScratchLoop: the record's safe region rides forward in a loop until release. */
function createScratchLoop(): DjFxAction {
  return {
    id: 'fx_scratch_loop',
    name: 'Scratch Loop',
    category: 'scratch',
    mode: 'momentary',
    engage(opts) {
      const deckId = opts?.deck ?? getActiveDeckId();
      const pool = getScratchVoicePool();
      const gesture = getGesture('drop');
      const record = pool.resolveRecord(gesture, { record: opts?.record, role: opts?.role });
      if (!record) return;
      const handle = pool.perform({ ...gesture, loop: true, returnsToAnchor: true, cycleBeats: Math.max(0.25, (record.safe[1] - record.safe[0]) * deckBpm(deckId) / 60) }, {
        record: record.id, role: opts?.role, bpm: deckBpm(deckId), ambience: ambienceFor(opts?.role ?? 'THEME'), cue: 'attack',
      });
      if (handle) scratchVoiceHandles.set(this.id, handle);
    },
    disengage() {
      const handle = scratchVoiceHandles.get(this.id);
      scratchVoiceHandles.delete(this.id);
      handle?.release();
    },
  };
}

/** Select the record the next gesture takes (`record` = catalogue id; none = the catalogue's fit). */
function createScratchRecord(): DjFxAction {
  return {
    id: 'fx_scratch_record',
    name: 'Scratch Record',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) { getScratchVoicePool().selectRecord(opts?.record ?? null); },
    disengage() {},
  };
}

/** Section 57 release: every record voice released, the active deck's pattern stopped. */
function createScratchRelease(): DjFxAction {
  return {
    id: 'fx_scratch_release',
    name: 'Scratch Release',
    category: 'scratch',
    mode: 'oneshot',
    engage(opts) {
      releaseRecordGestures();
      const deckId = opts?.deck ?? getActiveDeckId();
      stopDeckPattern(deckId);
      try { useDJStore.getState().setDeckPattern(deckId, null); } catch { /* store not ready */ }
    },
    disengage() {},
  };
}

export const SCRATCH_FX_ACTIONS: DjFxAction[] = [
  ...SCRATCH_GESTURES.map((g) => createScratchGesture(g.id)),
  createScratchStop(),
  createScratchThrow(),
  createScratchCue(),
  createScratchAnchor(),
  createScratchLoop(),
  createScratchRecord(),
  createScratchRelease(),
];

export const DJ_FX_ACTIONS: DjFxAction[] = [
  // Stutter
  ...stutterActions,
  // Delay
  createDubEcho(),
  createTapeEcho(),
  createPingPong(),
  // Filter
  createFilterSweep('highpass'),
  createFilterSweep('lowpass'),
  createFilterSweep('bandpass'),
  // Reverb
  createReverbWash(),
  // Modulation
  createFlanger(),
  createPhaser(),
  createRingMod(),
  // Distortion
  createBitcrush(),
  createOverdrive(),
  // Tape / Vinyl
  createTapeStop(),
  createVinylBrake(),
  createHalfSpeed(),
  // One-shot sounds
  createDubSiren(),
  createAirHorn(),
  createLaser(),
  createNoiseRiser(),
  // Deck FX (real DJ engine)
  createDeckFilterSweep('hpf'),
  createDeckFilterSweep('lpf'),
  createDeckFilterReset(),
  createDeckEchoOut(),
  createDeckEchoThrow(),
  createDeckReverbOut(),
  createDeckFilterRise(),
  createDeckFilterRelease(),
  createDeckEQKill('low'),
  createDeckEQKill('mid'),
  createDeckEQKill('high'),
  createDeckBrake(),
  createDeckSpinback(),
  createDeckRewind(),
  createDeckBeatJump(-16),
  createDeckBeatJump(-4),
  createDeckBeatJump(-1),
  createDeckBeatJump(1),
  createDeckBeatJump(4),
  createDeckBeatJump(16),
  // Hot Cues
  createHotCue(1),
  createHotCue(2),
  createHotCue(3),
  createHotCue(4),
  createHotCue(5),
  createHotCue(6),
  createHotCue(7),
  createHotCue(8),
  // Loop controls
  createLoopToggle(),
  createLoopHalf(),
  createLoopDouble(),
  // Transport
  createDeckPlay(),
  createDeckCue(),
  createSync(),
  // Crossfader cuts
  createXfaderCut('a'),
  createXfaderCut('b'),
  // Channel mute toggles
  createChannelMuteToggle(1),
  createChannelMuteToggle(2),
  createChannelMuteToggle(3),
  createChannelMuteToggle(4),
  createChannelMuteToggle(5),
  createChannelMuteToggle(6),
  createChannelMuteToggle(7),
  createChannelMuteToggle(8),
  // Key shift
  createKeyShift('up'),
  createKeyShift('down'),
  createKeyShift('reset'),
  // Quantize, Slip, Key Lock
  createQuantizeCycle(),
  createSlipToggle(),
  createKeyLockToggle(),
  // Scratch
  ...SCRATCH_FX_ACTIONS,
];

export const DJ_FX_ACTION_MAP: Record<DjFxActionId, DjFxAction> = Object.fromEntries(
  DJ_FX_ACTIONS.map(a => [a.id, a])
) as Record<DjFxActionId, DjFxAction>;

/** Get grouped actions for UI */
export function getDjFxByCategory(): Record<string, DjFxAction[]> {
  const groups: Record<string, DjFxAction[]> = {};
  for (const action of DJ_FX_ACTIONS) {
    if (!groups[action.category]) groups[action.category] = [];
    groups[action.category].push(action);
  }
  return groups;
}

/** Disengage all active DJ FX */
export function disengageAllDjFx(): void {
  for (const [id] of activeFx) {
    cleanupFx(id);
  }
}

// ─── The one fire path ──────────────────────────────────────────────
//
// The pad, the keyboard, MIDI, the MCP and the Auto DJ all fire an action
// here, the way Auto Dub fires dub moves through the DubRouter: the store
// flag the pad reads is set, the fire log records who fired what, and the
// action's own engage/disengage runs. Nothing performs an effect by
// another route.

export type DjFxSource = 'pad' | 'keyboard' | 'midi' | 'mcp' | 'autodj' | 'tour' | 'tracker' | 'set';

export interface DjFxFireLogEntry {
  time: number;
  id: DjFxActionId;
  deck: DeckId | null;
  source: DjFxSource;
  kind: 'fire' | 'release';
  beats?: number;
  amount?: number;
  /** Scratch fires: the record named, if any. */
  record?: string;
}

type DjFxFireListener = (entry: DjFxFireLogEntry, action: DjFxAction) => void;
const _fireListeners = new Set<DjFxFireListener>();

/** Observe every fire / release (the set recorder). Returns the unsubscribe. */
export function subscribeDjFxFires(listener: DjFxFireListener): () => void {
  _fireListeners.add(listener);
  return () => { _fireListeners.delete(listener); };
}

function logFire(entry: DjFxFireLogEntry, action: DjFxAction): void {
  _fxFireLog.push(entry);
  if (_fxFireLog.length > FX_FIRE_LOG_CAP) _fxFireLog.shift();
  for (const l of _fireListeners) { try { l(entry, action); } catch { /* a listener never breaks the fire */ } }
}

const FX_FIRE_LOG_CAP = 200;
const _fxFireLog: DjFxFireLogEntry[] = [];
/** Fire counts per action id (the reachability sentinel). */
export const djFxFireCounts: Record<string, number> = {};

function setDjFxActive(id: DjFxActionId, deck: DeckId | null): void {
  try { useDJStore.getState().setDjFxActive(id, deck); } catch { /* store not ready */ }
}

export function fireDjFx(id: DjFxActionId, opts: DjFxFireOptions & { source: DjFxSource }): boolean {
  const action = DJ_FX_ACTION_MAP[id];
  if (!action) return false;
  const deck = opts.deck ?? (action.category === 'deck' || action.category === 'scratch' ? getActiveDeckId() : null);
  setDjFxActive(id, action.mode === 'momentary' ? deck : null);
  djFxFireCounts[id] = (djFxFireCounts[id] ?? 0) + 1;
  logFire({ time: Date.now(), id, deck, source: opts.source, kind: 'fire', beats: opts.beats, amount: opts.amount, record: opts.record }, action);
  try { action.engage(opts); } catch (err) { console.warn(`[DjFx] ${id} engage failed:`, err); setDjFxActive(id, null); return false; }
  return true;
}

export function releaseDjFx(id: DjFxActionId, opts: DjFxFireOptions & { source: DjFxSource }): void {
  const action = DJ_FX_ACTION_MAP[id];
  if (!action) return;
  logFire({ time: Date.now(), id, deck: opts.deck ?? null, source: opts.source, kind: 'release' }, action);
  try { action.disengage(opts); } catch (err) { console.warn(`[DjFx] ${id} disengage failed:`, err); }
  setDjFxActive(id, null);
}

export function getDjFxFireLog(): readonly DjFxFireLogEntry[] { return _fxFireLog; }
export function clearDjFxFireLog(): void { _fxFireLog.length = 0; for (const k of Object.keys(djFxFireCounts)) delete djFxFireCounts[k]; }
