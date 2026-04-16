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
import { filterSweep, filterReset, echoOut, instantEQKill, cancelAllAutomation } from '../dj/DJQuantizedFX';
import { beatJump } from '../dj/DJBeatJump';
import type { DeckId } from '../dj/DeckEngine';

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
  | 'fx_deck_echo_out'
  | 'fx_deck_kill_lo' | 'fx_deck_kill_mid' | 'fx_deck_kill_hi'
  | 'fx_deck_brake'
  | 'fx_deck_jump_m16' | 'fx_deck_jump_m4' | 'fx_deck_jump_m1'
  | 'fx_deck_jump_p1' | 'fx_deck_jump_p4' | 'fx_deck_jump_p16';

export interface DjFxAction {
  id: DjFxActionId;
  name: string;
  category: 'stutter' | 'delay' | 'filter' | 'reverb' | 'modulation' | 'distortion' | 'tape' | 'oneshot' | 'deck';
  mode: 'momentary' | 'oneshot'; // momentary = hold to engage, oneshot = fire and forget
  engage: () => void;
  disengage: () => void;
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

// ─── Stutter Effects ──────────────────────────────────────────────

function createStutter(division: SyncDivision): DjFxAction {
  const divLabel = division.replace('1/', '');
  return {
    id: `fx_stutter_${divLabel}` as DjFxActionId,
    name: `Stutter ${division}`,
    category: 'stutter',
    mode: 'momentary',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const periodSec = bpmToMs(getBpm(), division) / 1000;
      const stutterHz = 1 / periodSec;

      const masterNode = getMasterOutputNode();
      if (!masterNode) return;

      // Gate approach: square-wave LFO modulates a gain node to chop audio
      const gate = ctx.createGain();
      gate.gain.value = 0;

      // Square-wave LFO at the stutter rate
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = stutterHz;

      // Scale LFO (-1..+1) to gain (0..1) via a shaper
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      const lfoOffset = ctx.createConstantSource();
      lfoOffset.offset.value = 0.5;

      lfo.connect(lfoGain);
      lfoGain.connect(gate.gain);
      lfoOffset.connect(gate.gain);
      lfo.start();
      lfoOffset.start();

      // Route: master → gate → destination (replacing direct connection)
      try { masterNode.disconnect(); } catch { /* */ }
      masterNode.connect(gate);
      gate.connect(ctx.destination);

      activeFx.set(this.id, {
        nodes: [gate, lfoGain],
        oscillator: lfo,
        cleanup: () => {
          try { lfoOffset.stop(); } catch { /* */ }
          try { lfoOffset.disconnect(); } catch { /* */ }
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
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), '1/4') / 1000;

      const delay = ctx.createDelay(4);
      delay.delayTime.value = delayTime;

      const feedback = ctx.createGain();
      feedback.gain.value = 0.65;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.7;

      // Feedback loop: delay → filter → feedback → delay
      delay.connect(filter);
      filter.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);

      // Tap the master output into the delay
      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);

      // Connect Tone.js master to our tap
      const masterNode = getMasterOutputNode();
      if (masterNode) {
        masterNode.connect(tap);
      }

      activeFx.set(this.id, {
        nodes: [delay, feedback, filter, wetGain, tap],
        cleanup: () => {
          try { masterNode?.disconnect(tap); } catch { /* */ }
        },
      });
    },
    disengage() {
      // Fade out the echo tail
      const state = activeFx.get(this.id);
      if (state) {
        const fb = state.nodes[1] as GainNode;
        const wet = state.nodes[3] as GainNode;
        const ctx = getCtx();
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        wet.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        state.timer = setTimeout(() => cleanupFx(this.id), 2000);
        // Prevent double cleanup
        activeFx.set(this.id, { ...state });
      }
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
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), '1/8d') / 1000;

      const delay = ctx.createDelay(4);
      delay.delayTime.value = delayTime;

      const feedback = ctx.createGain();
      feedback.gain.value = 0.55;

      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 3000;

      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 200;

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;

      const saturation = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
      }
      saturation.curve = curve;

      delay.connect(hpf);
      hpf.connect(lpf);
      lpf.connect(saturation);
      saturation.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [delay, feedback, lpf, hpf, saturation, wetGain, tap],
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const fb = state.nodes[1] as GainNode;
        const ctx = getCtx();
        fb.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        state.timer = setTimeout(() => cleanupFx(this.id), 2500);
        activeFx.set(this.id, { ...state });
      }
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
      cleanupFx(this.id);
      const ctx = getCtx();
      const delayTime = bpmToMs(getBpm(), '1/8') / 1000;

      const delayL = ctx.createDelay(4);
      const delayR = ctx.createDelay(4);
      delayL.delayTime.value = delayTime;
      delayR.delayTime.value = delayTime;

      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      fbL.gain.value = 0.5;
      fbR.gain.value = 0.5;

      const merger = ctx.createChannelMerger(2);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.6;

      // Cross-feedback: L→R→L
      delayL.connect(fbL);
      fbL.connect(delayR);
      delayR.connect(fbR);
      fbR.connect(delayL);

      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delayL);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [delayL, delayR, fbL, fbR, merger, wetGain, tap],
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const fbL = state.nodes[2] as GainNode;
        const fbR = state.nodes[3] as GainNode;
        const ctx = getCtx();
        fbL.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        fbR.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        state.timer = setTimeout(() => cleanupFx(this.id), 2000);
        activeFx.set(this.id, { ...state });
      }
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

      // Continue scheduling sweeps via interval
      const intervalId = setInterval(() => {
        sweepCount++;
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
      cleanupFx(this.id);
      const ctx = getCtx();

      // Create convolver with synthetic impulse response
      const convolver = ctx.createConvolver();
      const irLength = ctx.sampleRate * 3; // 3 second reverb
      const ir = ctx.createBuffer(2, irLength, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLength; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / irLength);
        }
      }
      convolver.buffer = ir;

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.7;

      convolver.connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(convolver);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [convolver, wetGain, tap],
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() {
      const state = activeFx.get(this.id);
      if (state) {
        const wet = state.nodes[1] as GainNode;
        const ctx = getCtx();
        wet.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        state.timer = setTimeout(() => cleanupFx(this.id), 3000);
        activeFx.set(this.id, { ...state });
      }
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
      cleanupFx(this.id);
      const ctx = getCtx();

      const delay = ctx.createDelay();
      delay.delayTime.value = 0.003;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.5;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.002;

      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();

      const feedback = ctx.createGain();
      feedback.gain.value = 0.7;
      delay.connect(feedback);
      feedback.connect(delay);

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.5;
      delay.connect(wetGain);
      wetGain.connect(ctx.destination);

      const tap = ctx.createGain();
      tap.gain.value = 1;
      tap.connect(delay);

      const masterNode = getMasterOutputNode();
      if (masterNode) masterNode.connect(tap);

      activeFx.set(this.id, {
        nodes: [delay, feedback, lfoGain, wetGain, tap],
        oscillator: lfo,
        cleanup: () => { try { masterNode?.disconnect(tap); } catch { /* */ } },
      });
    },
    disengage() { cleanupFx(this.id); },
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

function createTapeStop(): DjFxAction {
  return {
    id: 'fx_tape_stop',
    name: 'Tape Stop',
    category: 'tape',
    mode: 'oneshot',
    engage() {
      cleanupFx(this.id);
      // Ramp playback rate to 0 over ~1 second by pitching down the master
      const ctx = getCtx();
      const masterGain = getMasterOutputNode();
      if (!masterGain) return;

      // Create pitch-shifting illusion via playback rate on a media element,
      // or simpler: just duck volume with a descending pitch wobble
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 0.5;
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0;
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start();

      // Fade master volume to 0 over 1.5s (tape stop effect)
      const now = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      const timer = setTimeout(() => {
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
        cleanupFx(this.id);
      }, 1600);

      activeFx.set(this.id, {
        nodes: [oscGain],
        oscillator: osc,
        timer,
      });
    },
    disengage() {
      // Restore volume immediately on release
      const ctx = getCtx();
      const masterGain = getMasterOutputNode();
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
      }
      cleanupFx(this.id);
    },
  };
}

function createVinylBrake(): DjFxAction {
  return {
    id: 'fx_vinyl_brake',
    name: 'Vinyl Brake',
    category: 'tape',
    mode: 'oneshot',
    engage() {
      cleanupFx(this.id);
      const ctx = getCtx();
      const masterGain = getMasterOutputNode();
      if (!masterGain) return;

      // Faster stop than tape (0.8s) with volume duck
      const now = ctx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      const timer = setTimeout(() => {
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
        cleanupFx(this.id);
      }, 900);

      activeFx.set(this.id, { nodes: [], timer });
    },
    disengage() {
      const ctx = getCtx();
      const masterGain = getMasterOutputNode();
      if (masterGain) {
        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
      }
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

function createDeckFilterSweep(direction: 'hpf' | 'lpf'): DjFxAction {
  const target = direction === 'hpf' ? -0.85 : 0.85;
  const id = direction === 'hpf' ? 'fx_deck_hpf_sweep' : 'fx_deck_lpf_sweep';
  return {
    id: id as DjFxActionId,
    name: direction === 'hpf' ? 'Deck HPF' : 'Deck LPF',
    category: 'deck',
    mode: 'momentary',
    engage() {
      const deckId = getActiveDeckId();
      const cancel = filterSweep(deckId, target, 4);
      deckSweepCancels.set(this.id, cancel);
    },
    disengage() {
      // Cancel the forward sweep
      const cancel = deckSweepCancels.get(this.id);
      if (cancel) { cancel(); deckSweepCancels.delete(this.id); }
      // Sweep back to center at the same speed (4 beats)
      const deckId = getActiveDeckId();
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
    engage() {
      const deckId = getActiveDeckId();
      filterReset(deckId);
      cancelAllAutomation();
    },
    disengage() { /* one-shot — nothing to undo */ },
  };
}

function createDeckEchoOut(): DjFxAction {
  return {
    id: 'fx_deck_echo_out',
    name: 'Deck Echo Out',
    category: 'deck',
    mode: 'momentary',
    engage() {
      const deckId = getActiveDeckId();
      const cancel = echoOut(deckId, 8);
      deckSweepCancels.set(this.id, cancel);
    },
    disengage() {
      const cancel = deckSweepCancels.get(this.id);
      if (cancel) { cancel(); deckSweepCancels.delete(this.id); }
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
    engage() {
      const deckId = getActiveDeckId();
      instantEQKill(deckId, band, true);
    },
    disengage() {
      const deckId = getActiveDeckId();
      instantEQKill(deckId, band, false);
    },
  };
}

function createDeckBrake(): DjFxAction {
  let brakeRaf = 0;
  return {
    id: 'fx_deck_brake',
    name: 'Deck Brake',
    category: 'deck',
    mode: 'momentary',
    engage() {
      const deckId = getActiveDeckId();
      try {
        const deck = getDJEngine().getDeck(deckId);
        const state = useDJStore.getState().decks[deckId];
        const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
        const durationMs = (2 * 60 / bpm) * 1000;

        const startTime = performance.now();
        const animate = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          const rate = 1 - progress * progress; // quadratic deceleration
          useDJStore.getState().setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
          if (progress < 1) {
            brakeRaf = requestAnimationFrame(animate);
          } else {
            try { deck.pause(); } catch { /* */ }
            useDJStore.getState().setDeckPlaying(deckId, false);
            useDJStore.getState().setDeckPitch(deckId, 0);
          }
        };
        brakeRaf = requestAnimationFrame(animate);
      } catch { /* engine not ready */ }
    },
    disengage() {
      cancelAnimationFrame(brakeRaf);
      brakeRaf = 0;
      const deckId = getActiveDeckId();
      useDJStore.getState().setDeckPitch(deckId, 0);
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

// ─── Registry ─────────────────────────────────────────────────────

const stutterActions = [
  createStutter('1/4'),
  createStutter('1/8'),
  createStutter('1/16'),
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
  createDeckEQKill('low'),
  createDeckEQKill('mid'),
  createDeckEQKill('high'),
  createDeckBrake(),
  createDeckBeatJump(-16),
  createDeckBeatJump(-4),
  createDeckBeatJump(-1),
  createDeckBeatJump(1),
  createDeckBeatJump(4),
  createDeckBeatJump(16),
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
