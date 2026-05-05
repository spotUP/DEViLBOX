import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import { TrackerEnvelope } from '../TrackerEnvelope';
import { getChannelEffectsManager } from '../ChannelEffectsManager';
import { getChannelFilterManager } from '../ChannelFilterManager';

// Voice state type (mirrors ToneEngine.ts interface)
export interface VoiceState {
  instrument: Tone.ToneAudioNode | DevilboxSynth;
  note: string;
  volumeEnv: TrackerEnvelope;
  panningEnv: TrackerEnvelope;
  pitchEnv: TrackerEnvelope;
  fadeout: number;
  fadeoutStep: number;
  isKeyOff: boolean;
  isFilterEnvelope: boolean;
  lastCutoff: number;
  lastResonance: number;
  nodes: {
    gain: Tone.Gain;
    filter: Tone.Filter | AudioWorkletNode;
    panner: Tone.Panner;
  };
}

export interface ChannelOutput {
  input: Tone.Gain;
  channel: Tone.Channel;
  meter: Tone.Meter;
}

export interface ChannelRoutingContext {
  masterInput: Tone.Gain;
  channelOutputs: Map<number, ChannelOutput>;
  activeVoices: Map<number, VoiceState[]>;
  channelPitchState: Map<number, {
    instrumentKey: number;
    basePlaybackRate: number;
    baseFrequency: number;
    currentPitchMult: number;
  }>;
  channelMuteStates: Map<number, boolean>;
  instruments: Map<number, Tone.ToneAudioNode | DevilboxSynth>;
  instrumentSynthTypes: Map<number, string>;
  instrumentOutputOverrides: Map<number, Tone.ToneAudioNode>;
  itFilterWorkletLoaded: boolean;
  nativeContext: AudioContext | null;
  FILTER_CUTOFF_LUT: Float64Array;
  /** Pooled array for getChannelLevels — avoids per-frame allocation */
  _levelsBuf?: number[];
}

// ============================================
// CHANNEL METERING STATE
// ============================================

export class ChannelMeterState {
  _channelTriggerLevels: Map<number, number> = new Map();
  _triggerLevelsCache: number[] = new Array(16).fill(0);
  _triggerGensCache: number[] = new Array(16).fill(0);
  _channelTriggerGens = new Map<number, number>();
  _triggerGenCounter = 0;
  // Realtime per-channel levels from WASM engines (libopenmpt, etc.)
  // Updated each audio frame, used by realtime VU mode
  _realtimeChannelLevels: number[] = new Array(16).fill(0);
  _realtimeLevelsTimestamp = 0; // performance.now() of last update
}

export function triggerChannelMeter(state: ChannelMeterState, channelIndex: number, velocity: number): void {
  const s = state as any;
  s._channelTriggerLevels.set(channelIndex, Math.min(1, velocity * 1.2));
  s._channelTriggerGens.set(channelIndex, ++s._triggerGenCounter);
}

export function clearChannelTriggerLevels(state: ChannelMeterState): void {
  const s = state as any;
  s._channelTriggerLevels.clear();
  s._channelTriggerGens.clear();
}

/**
 * Get channel trigger levels for VU meters (real-time note triggers).
 * Does NOT zero triggers on read — multiple consumers can read the same
 * trigger. Consumers use getChannelTriggerGenerations() to detect NEW
 * triggers vs. stale ones they've already processed.
 * PERF: Reuses internal array to avoid allocations every frame.
 */
export function getChannelTriggerLevels(state: ChannelMeterState, numChannels: number): number[] {
  const s = state as any;
  // Grow cache if needed (never shrinks — avoids reallocation)
  if (s._triggerLevelsCache.length < numChannels) {
    const old = s._triggerLevelsCache;
    s._triggerLevelsCache = new Array(Math.max(numChannels, 16)).fill(0);
    for (let j = 0; j < old.length; j++) s._triggerLevelsCache[j] = old[j];
  }

  for (let i = 0; i < numChannels; i++) {
    s._triggerLevelsCache[i] = s._channelTriggerLevels.get(i) || 0;
  }
  return s._triggerLevelsCache;
}

/**
 * Get per-channel trigger generation counters.
 * Each call to triggerChannelMeter() bumps the generation for that channel.
 * Consumers compare with their "last seen" generation to detect new triggers.
 * PERF: Reuses internal array to avoid allocations every frame.
 */
export function getChannelTriggerGenerations(state: ChannelMeterState, numChannels: number): number[] {
  const s = state as any;
  if (s._triggerGensCache.length < numChannels) {
    s._triggerGensCache = new Array(Math.max(numChannels, 16)).fill(0);
  }
  for (let i = 0; i < numChannels; i++) {
    s._triggerGensCache[i] = s._channelTriggerGens.get(i) || 0;
  }
  return s._triggerGensCache;
}

/**
 * Update realtime per-channel levels from WASM engines (libopenmpt, etc.)
 * Called each audio frame to provide per-channel data for realtime VU mode.
 */
export function updateRealtimeChannelLevels(state: ChannelMeterState, levels: number[]): void {
  const s = state as any;
  // Grow array if needed
  if (s._realtimeChannelLevels.length < levels.length) {
    s._realtimeChannelLevels = new Array(Math.max(levels.length, 16)).fill(0);
  }
  // Apply noise floor threshold to prevent meters from getting stuck at low values
  const NOISE_FLOOR = 0.02;
  for (let i = 0; i < levels.length; i++) {
    s._realtimeChannelLevels[i] = levels[i] > NOISE_FLOOR ? levels[i] : 0;
  }
  s._realtimeLevelsTimestamp = performance.now();
}

/**
 * Get realtime per-channel levels for VU meters.
 * Returns the levels array if recently updated (within 100ms), otherwise null.
 */
// Pre-allocated result buffer — reused each call to avoid per-frame GC pressure
const _realtimeLevelsBuf: number[] = [];

export function getRealtimeChannelLevels(state: ChannelMeterState, numChannels: number): number[] | null {
  const s = state as any;
  // Consider stale if not updated in last 100ms
  if (performance.now() - s._realtimeLevelsTimestamp > 100) {
    return null;
  }
  _realtimeLevelsBuf.length = numChannels;
  for (let i = 0; i < numChannels; i++) {
    _realtimeLevelsBuf[i] = s._realtimeChannelLevels[i] || 0;
  }
  return _realtimeLevelsBuf;
}

// ============================================
// CHANNEL ROUTING FUNCTIONS
// ============================================

/**
 * Get or create a channel's audio chain
 * Route: [Voices] → channelInput → [effectChain] → channel (volume/pan) → masterInput
 * The effect chain is always present (passthrough when empty) so effects can be
 * added/removed dynamically without reconnecting external nodes.
 */
export function getChannelOutput(ctx: ChannelRoutingContext, channelIndex: number): Tone.Gain {
  if (!ctx.channelOutputs.has(channelIndex)) {
    // Create channel audio chain with metering
    const input = new Tone.Gain(1);
    const channel = new Tone.Channel({ volume: 0, pan: 0 });
    const meter = new Tone.Meter({ smoothing: 0.15 });

    // Get per-channel effect chain (creates passthrough if no effects exist)
    const mgr = getChannelEffectsManager();
    const chainInput = mgr.getChainInput(channelIndex);
    const chainOutput = mgr.getChainOutput(channelIndex);

    // Get per-channel automation filter (HPF → LPF, transparent at position 0)
    const filterMgr = getChannelFilterManager();
    const filterInput = filterMgr.getInput(channelIndex);
    const filterOutput = filterMgr.getOutput(channelIndex);

    // Connect: input → [effect chain] → HPF → LPF → channel → meter + masterInput
    input.connect(chainInput);
    chainOutput.connect(filterInput);
    filterOutput.connect(channel);
    channel.connect(meter);
    channel.connect(ctx.masterInput);

    ctx.channelOutputs.set(channelIndex, {
      input,
      channel,
      meter,
    });
  }

  return ctx.channelOutputs.get(channelIndex)!.input;
}

/**
 * Create a new voice chain for a note
 */
export function createVoice(ctx: ChannelRoutingContext, channelIndex: number, instrument: Tone.ToneAudioNode | DevilboxSynth, note: string, config: InstrumentConfig): VoiceState {
  // Lazily create the channel output if it doesn't exist yet.
  // This handles channels added while the replayer is already playing.
  getChannelOutput(ctx, channelIndex);
  const channelOutput = ctx.channelOutputs.get(channelIndex)!;

  const gain = new Tone.Gain(1);
  
  // Hardware Quirk: Use IT-specific high-fidelity filter for IT modules
  let filter: Tone.Filter | AudioWorkletNode;
  const isIT = config.metadata?.importedFrom === 'IT';
  
  if (isIT && ctx.itFilterWorkletLoaded) {
    // Use native AudioWorkletNode directly (matches FurnaceDispatch fix)
    const nCtx = ctx.nativeContext!;
    filter = new AudioWorkletNode(nCtx, 'it-filter-processor');
    filter.onprocessorerror = (event) => {
      console.error('[ChannelRouting] worklet processor error on channel', channelIndex, ':', event);
    };
  } else {
    filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 20000,
      Q: 0,
      rolloff: -12,
    });
  }
  
  const panner = new Tone.Panner(0);

  // Connect: Voice → gain → filter → panner → channelInput
  if (filter instanceof Tone.Filter) {
    gain.connect(filter);
    filter.connect(panner);
  } else {
    // Raw Web Audio node connection
    gain.connect(filter);
    Tone.connect(filter, panner);
  }
  
  // In DJ mode, route voices through deck audio chain instead of per-channel masterInput
  const voiceOverride = ctx.instrumentOutputOverrides.get(config.id);
  if (voiceOverride) {
    panner.connect(voiceOverride);
  } else {
    panner.connect(channelOutput.input);
  }

  const envs = config.metadata?.envelopes?.[config.id];
  const volEnv = new TrackerEnvelope();
  const panEnv = new TrackerEnvelope();
  const pitchEnv = new TrackerEnvelope();

  if (envs?.volumeEnvelope) volEnv.init(envs.volumeEnvelope);
  if (envs?.panningEnvelope) panEnv.init(envs.panningEnvelope);
  if (envs?.pitchEnvelope) pitchEnv.init(envs.pitchEnvelope);

  return {
    instrument,
    note,
    volumeEnv: volEnv,
    panningEnv: panEnv,
    pitchEnv: pitchEnv,
    fadeout: 65536,
    fadeoutStep: config.metadata?.modPlayback?.fadeout || 0,
    isKeyOff: false,
    isFilterEnvelope: (envs?.pitchEnvelope as any)?.type === 'filter',
    lastCutoff: 127,
    lastResonance: 0,
    nodes: { gain, filter, panner }
  };
}

/**
 * Helper to stop a specific voice
 */
export function stopVoice(voice: VoiceState, time: number): void {
  if ((voice.instrument as any).stop) (voice.instrument as any).stop(time);
  else if ((voice.instrument as any).triggerRelease) (voice.instrument as any).triggerRelease(time);

  // Dispose nodes after a short delay to allow for audio tail/clipping prevention
  setTimeout(() => {
    voice.nodes.gain.dispose();
    if (typeof (voice.nodes.filter as any).dispose === 'function') (voice.nodes.filter as any).dispose();
    voice.nodes.panner.dispose();
  }, 100);
}

/**
 * Set channel volume (affects active voices on this channel)
 * ProTracker Cxx command targets the voice/sample volume, not mixer volume
 */
export function setChannelVolume(ctx: ChannelRoutingContext, channelIndex: number, volumeDb: number): void {
  // Update active voice gains (ProTracker-style: Cxx affects sample volume)
  const voices = ctx.activeVoices.get(channelIndex);

  if (voices && voices.length > 0) {
    const now = Tone.now();
    // Convert dB to linear gain for voice nodes
    const linearGain = volumeDb <= -60 ? 0 : Math.pow(10, volumeDb / 20);
    for (const voice of voices) {
      if (voice.nodes.gain) {
        voice.nodes.gain.gain.setValueAtTime(linearGain, now);
      } else {
        console.warn(`[ToneEngine] Voice has no gain node!`, voice.nodes);
      }
    }
  }

  // Also update channel output for consistency (affects future notes)
  const channelOutput = ctx.channelOutputs.get(channelIndex);
  if (channelOutput) {
    // Store as "base" volume but don't apply to channel mixer
    // The voice gain handles the actual volume control
  }
}

/**
 * Set channel filter cutoff (IT Zxx command)
 * Target the "current" voice's filter
 */
export function setChannelFilterCutoff(ctx: ChannelRoutingContext, channelIndex: number, cutoff: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length === 0) return;

  // Apply to the most recent voice (the "current" one)
  const voice = voices[voices.length - 1];
  voice.lastCutoff = cutoff;
  const resonance = voice.lastResonance;

  const filter = voice.nodes.filter;
  const now = Tone.now();

  // Hardware Quirk: Filter is bypassed ONLY if Cutoff=127 AND Resonance=0
  // Or if ITHandler explicitly requested bypass via value 255
  if ((cutoff >= 127 && resonance === 0) || cutoff === 255) {
    if (filter instanceof Tone.Filter) {
      filter.frequency.setValueAtTime(24000, now);
      filter.Q.setValueAtTime(0, now);
    } else if (filter instanceof AudioWorkletNode) {
      filter.parameters.get('cutoff')?.setValueAtTime(127, now);
      filter.parameters.get('resonance')?.setValueAtTime(0, now);
    }
    return;
  }

  if (filter instanceof Tone.Filter) {
    // High-Fidelity IT Mapping:
    // Cutoff 0-127 -> ~100Hz to 10000Hz (Exponential)
    const freq = 100 * Math.pow(100, cutoff / 127);
    filter.frequency.setValueAtTime(freq, now);
  } else if (filter instanceof AudioWorkletNode) {
    // Worklet uses raw IT values
    filter.parameters.get('cutoff')?.setValueAtTime(cutoff, now);
  }
}

/**
 * Set channel filter resonance (IT Z8x command)
 * Target the "current" voice's filter
 */
export function setChannelFilterResonance(ctx: ChannelRoutingContext, channelIndex: number, resonance: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length === 0) return;

  // Apply to the most recent voice
  const voice = voices[voices.length - 1];
  voice.lastResonance = resonance;
  const cutoff = voice.lastCutoff;

  const filter = voice.nodes.filter;
  const now = Tone.now();

  if (filter instanceof Tone.Filter) {
    // High-Fidelity IT Mapping:
    // IT resonance was quite aggressive. 0-127 -> Q 0.0 to ~25.0
    // We use an exponential mapping for that "biting" resonance character
    const q = (resonance / 127) * (resonance / 127) * 25;
    filter.Q.setValueAtTime(q, now);
  } else if (filter instanceof AudioWorkletNode) {
    filter.parameters.get('resonance')?.setValueAtTime(resonance, now);
  }

  // If resonance was set but cutoff is at max, re-evaluate bypass
  if (resonance > 0 && cutoff >= 127) {
    setChannelFilterCutoff(ctx, channelIndex, cutoff);
  }
}

/**
 * Set channel pan (-100 to 100)
 */
export function setChannelPan(ctx: ChannelRoutingContext, channelIndex: number, pan: number | null | undefined): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length === 0) return;

  // Apply to current voice
  const voice = voices[voices.length - 1];
  const panValue = (pan ?? 0) / 100; // -1..1
  voice.nodes.panner.pan.setValueAtTime(panValue, Tone.now());
}

/**
 * Set channel Funk Repeat (EFx Invert Loop)
 * Shifts the loop points of the current voice
 */
export function setChannelFunkRepeat(ctx: ChannelRoutingContext, channelIndex: number, position: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length === 0) return;

  const voice = voices[voices.length - 1];
  const player = voice.instrument;

  // Funk repeat only works on looping Players
  if (player instanceof Tone.Player && player.loop) {
    if (position === 0) {
      // Reset to original loop points if needed (would need to store them)
      return;
    }

    // ProTracker EFx shifts the loop start point within the loop
    // position 0x00..0x80
    const buffer = player.buffer;
    if (buffer.loaded) {
      const playerExt = player as unknown as { _originalLoopStart?: number };
      const originalLoopStart = playerExt._originalLoopStart ?? player.loopStart;
      if (playerExt._originalLoopStart === undefined) {
        playerExt._originalLoopStart = player.loopStart as number;
      }

      // Shift loopStart based on position (approximate behavior)
      const shiftSeconds = (position / 128) * ((player.loopEnd as number) - (originalLoopStart as number));
      player.loopStart = (originalLoopStart as number) + shiftSeconds;
    }
  }
}

/**
 * Handle IT Past Note Action (S77-S79)
 * Targets all voices EXCEPT the most recent one
 */
export function handlePastNoteAction(ctx: ChannelRoutingContext, channelIndex: number, action: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length <= 1) return;

  // All voices except the last one are "past"
  const pastVoices = voices.slice(0, voices.length - 1);
  const currentVoice = voices[voices.length - 1];

  if (action === 0) { // CUT
    pastVoices.forEach(v => stopVoice(v, Tone.now()));
    ctx.activeVoices.set(channelIndex, [currentVoice]);
  } else if (action === 2) { // NOTE OFF
    pastVoices.forEach(v => v.volumeEnv.keyOff());
  } else if (action === 3) { // NOTE FADE
    pastVoices.forEach(v => {
      v.isKeyOff = true;
      if (v.fadeoutStep === 0) v.fadeoutStep = 1024;
    });
  }
}

/**
 * Set channel pitch for ProTracker effects (arpeggio, portamento, vibrato)
 * @param pitchMultiplier - Pitch multiplier (1.0 = no change, 2.0 = octave up, 0.5 = octave down)
 */
export function setChannelPitch(ctx: ChannelRoutingContext, channelIndex: number, pitchMultiplier: number): void {
  const pitchState = ctx.channelPitchState.get(channelIndex);
  if (!pitchState) return;

  // Update current pitch multiplier
  pitchState.currentPitchMult = pitchMultiplier;

  // Apply to the most recent active voice on this channel
  const voices = ctx.activeVoices.get(channelIndex);
  if (!voices || voices.length === 0) {
    // Fallback to shared instrument for non-NNA playback
    const instrument = ctx.instruments.get(pitchState.instrumentKey);
    if (!instrument) return;
    applyPitchToNode(instrument, pitchMultiplier, pitchState.basePlaybackRate, pitchState.instrumentKey, ctx.instrumentSynthTypes);
    return;
  }

  const currentVoice = voices[voices.length - 1];
  applyPitchToNode(currentVoice.instrument, pitchMultiplier, pitchState.basePlaybackRate, pitchState.instrumentKey, ctx.instrumentSynthTypes);
}

/**
 * Helper to apply pitch multiplier to a specific Tone node
 */
export function applyPitchToNode(node: Tone.ToneAudioNode | DevilboxSynth, pitchMultiplier: number, baseRate: number, instrumentKey: number, instrumentSynthTypes: Map<number, string>): void {
  const synthType = instrumentSynthTypes.get(instrumentKey);
  const cents = 1200 * Math.log2(pitchMultiplier);

  const n = node as any;
  if (node instanceof Tone.Player || node instanceof Tone.GrainPlayer) {
    (node as unknown as { playbackRate: number }).playbackRate = baseRate * pitchMultiplier;
  } else if (synthType === 'Sampler') {
    if (n.detune !== undefined) n.detune.value = cents;
  } else {
    // For synths: use detune property
    if (n.detune !== undefined && n.detune instanceof Tone.Signal) {
      n.detune.value = cents;
    } else if (n.oscillator?.detune !== undefined) {
      n.oscillator.detune.value = cents;
    } else if (n.detune !== undefined) {
      n.detune = cents; // Primitive
    }
  }
}

/**
 * Set channel pitch using frequency directly (for portamento/arpeggio)
 * @param frequency - Target frequency in Hz
 */
export function setChannelFrequency(ctx: ChannelRoutingContext, channelIndex: number, frequency: number): void {
  const pitchState = ctx.channelPitchState.get(channelIndex);
  if (!pitchState || pitchState.baseFrequency === 0) {
    // No pitch state - normal for channels without active notes
    return;
  }

  // Calculate pitch multiplier from frequency ratio
  const pitchMultiplier = frequency / pitchState.baseFrequency;
  setChannelPitch(ctx, channelIndex, pitchMultiplier);
}

/**
 * Initialize pitch state when a note is triggered on a channel
 * Called from PatternScheduler when a note starts
 */
export function initChannelPitch(
  ctx: ChannelRoutingContext,
  channelIndex: number,
  instrumentKey: number,
  baseFrequency: number,
  basePlaybackRate: number = 1
): void {
  ctx.channelPitchState.set(channelIndex, {
    instrumentKey,
    basePlaybackRate,
    baseFrequency,
    currentPitchMult: 1.0,
  });
}

/**
 * Clear pitch state for a channel (on note off or channel reset)
 */
export function clearChannelPitch(ctx: ChannelRoutingContext, channelIndex: number): void {
  const pitchState = ctx.channelPitchState.get(channelIndex);
  if (pitchState) {
    // Reset pitch to normal before clearing
    setChannelPitch(ctx, channelIndex, 1.0);
    ctx.channelPitchState.delete(channelIndex);
  }
}

/**
 * Mute/unmute channel
 */
export function setChannelMute(ctx: ChannelRoutingContext, channelIndex: number, muted: boolean): void {
  // Update quick lookup map (used by isChannelMuted during note triggering)
  ctx.channelMuteStates.set(channelIndex, muted);
  // Ensure channel exists
  if (!ctx.channelOutputs.has(channelIndex)) {
    getChannelOutput(ctx, channelIndex);
  }
  const channelOutput = ctx.channelOutputs.get(channelIndex);
  if (channelOutput) {
    channelOutput.channel.mute = muted;
  }
}

/** Sets the persistent mixer fader volume (dB) on the channel output.
 *  Unlike setChannelVolume (which affects active voice gains), this sets
 *  the channel's Tone.Channel node directly — persists across notes. */
export function setMixerChannelVolume(ctx: ChannelRoutingContext, channelIndex: number, volumeDb: number): void {
  if (!ctx.channelOutputs.has(channelIndex)) {
    getChannelOutput(ctx, channelIndex);
  }
  const channelOutput = ctx.channelOutputs.get(channelIndex);
  if (channelOutput) {
    channelOutput.channel.volume.value = volumeDb;
  }
}

/** Sets the persistent mixer pan on the channel output (-1..1). */
export function setMixerChannelPan(ctx: ChannelRoutingContext, channelIndex: number, pan: number): void {
  if (!ctx.channelOutputs.has(channelIndex)) {
    getChannelOutput(ctx, channelIndex);
  }
  const channelOutput = ctx.channelOutputs.get(channelIndex);
  if (channelOutput) {
    channelOutput.channel.pan.value = pan;
  }
}

/**
 * Update mute states for all channels considering solo logic
 * Solo logic: if any channel is solo'd, only solo'd channels play
 */
export function updateMuteStates(ctx: ChannelRoutingContext, channels: { muted: boolean; solo: boolean }[]): void {
  const anySolo = channels.some(ch => ch.solo);

  channels.forEach((channel, idx) => {
    const shouldMute = anySolo
      ? !channel.solo  // If any solo, mute non-solo'd channels
      : channel.muted;  // Otherwise, respect individual mute states

    // Store in quick lookup map
    ctx.channelMuteStates.set(idx, shouldMute);

    // Also update channel output if it exists
    setChannelMute(ctx, idx, shouldMute);
  });
}

/**
 * Check if a channel should be muted (for use during note triggering)
 */
export function isChannelMuted(ctx: ChannelRoutingContext, channelIndex: number): boolean {
  return ctx.channelMuteStates.get(channelIndex) ?? false;
}

/**
 * Dispose channel outputs
 */
export function disposeChannelOutputs(ctx: ChannelRoutingContext): void {
  // Dispose per-channel automation filters
  getChannelFilterManager().disposeAll();

  ctx.channelOutputs.forEach((channelOutput, channelIndex) => {
    try {
      channelOutput.meter.dispose();
    } catch (e) {
      console.warn(`[ToneEngine] Failed to dispose meter for channel ${channelIndex}:`, e);
    }
    try {
      channelOutput.channel.dispose();
    } catch (e) {
      console.warn(`[ToneEngine] Failed to dispose channel ${channelIndex}:`, e);
    }
    try {
      channelOutput.input.dispose();
    } catch (e) {
      console.warn(`[ToneEngine] Failed to dispose input for channel ${channelIndex}:`, e);
    }
  });
  ctx.channelOutputs.clear();
}

/**
 * Get all channel meter levels for VU meters
 * Returns array of normalized values (0-1) for each channel
 */
export function getChannelLevels(ctx: ChannelRoutingContext, numChannels: number): number[] {
  // Reuse/grow a cached array to avoid allocation per frame
  if (!ctx._levelsBuf || ctx._levelsBuf.length < numChannels) {
    ctx._levelsBuf = new Array(numChannels).fill(0);
  }
  const levels = ctx._levelsBuf;
  // Noise floor threshold — meters below this are treated as silent
  // to prevent VU meters from getting stuck at low residual values
  const NOISE_FLOOR = 0.02;
  for (let i = 0; i < numChannels; i++) {
    const channelOutput = ctx.channelOutputs.get(i);
    if (channelOutput) {
      // Meter returns dB value, convert to 0-1 range
      // -60dB = 0, 0dB = 1
      const db = channelOutput.meter.getValue() as number;
      const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
      levels[i] = normalized > NOISE_FLOOR ? normalized : 0;
    } else {
      levels[i] = 0;
    }
  }
  return levels;
}

/**
 * Process tracker envelopes for a channel (Sub-tick processing)
 */
export function updateChannelEnvelopes(ctx: ChannelRoutingContext, channelIndex: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  const channelOutput = ctx.channelOutputs.get(channelIndex);
  if (!voices || voices.length === 0 || !channelOutput) return;

  // Cache current time once for all voices (hot path optimization)
  const now = Tone.now();
  const basePan = channelOutput.channel.pan.value;

  // In-place filtering: track write index
  let writeIdx = 0;
  const len = voices.length;

  for (let i = 0; i < len; i++) {
    const voice = voices[i];

    // 1. Advance volume envelope (0-64)
    const envVol = voice.volumeEnv.tickNext();

    // Advance fadeout if key is off
    if (voice.isKeyOff && voice.fadeout > 0) {
      voice.fadeout = Math.max(0, voice.fadeout - voice.fadeoutStep);
    }

    // Calculate final volume multiplier (0.0 to 1.0)
    // Use ?? 65536 so an undefined/uninitialized fadeout means "no fadeout = full volume"
    const volMult = (envVol / 64) * ((voice.fadeout ?? 65536) / 65536);
    // Guard against NaN (e.g. if envVol or fadeout is somehow NaN) — skip rather than corrupt audio graph
    if (!isFinite(volMult)) return;
    voice.nodes.gain.gain.setValueAtTime(volMult, now);

    // 2. Advance panning envelope (0-64)
    const envPan = voice.panningEnv.tickNext();
    if (envPan !== 32) {
      const envOffset = (envPan - 32) / 32;
      const finalPan = Math.max(-1, Math.min(1, basePan + envOffset));
      voice.nodes.panner.pan.setValueAtTime(finalPan, now);
    }

    // 3. Advance pitch/filter envelope
    const envPitch = voice.pitchEnv.tickNext();
    if (voice.pitchEnv.isEnabled()) {
      if (voice.isFilterEnvelope) {
        const baseCutoff = voice.lastCutoff;
        const envOffset = (envPitch - 32);
        const finalCutoff = Math.max(0, Math.min(127, baseCutoff + envOffset));

        // Apply to voice filter using LUT
        if (voice.nodes.filter instanceof Tone.Filter) {
          const freq = ctx.FILTER_CUTOFF_LUT[finalCutoff];
          voice.nodes.filter.frequency.setValueAtTime(freq, now);
        } else if (voice.nodes.filter instanceof AudioWorkletNode) {
          voice.nodes.filter.parameters.get('cutoff')?.setValueAtTime(finalCutoff, now);
        }
      } else {
        // Pitch modulation (Additive semitones)
        const semitoneOffset = (envPitch - 32) / 32 * 12; // +/- 12 semitones
        const instWithDetune = voice.instrument as unknown as { detune?: { value: number } };
        if (instWithDetune.detune !== undefined) {
          instWithDetune.detune.value = semitoneOffset * 100;
        }
      }
    }

    // Cleanup: check if voice is finished
    const isFinished = (voice.isKeyOff && voice.fadeout <= 0) ||
                      (voice.volumeEnv.isFinished() && voice.isKeyOff);

    if (!isFinished) {
      // Keep voice - write to current position
      voices[writeIdx++] = voice;
    } else {
      // Dispose nodes
      voice.nodes.gain.dispose();
      if (typeof (voice.nodes.filter as any).dispose === 'function') (voice.nodes.filter as any).dispose();
      voice.nodes.panner.dispose();
    }
  }

  // Truncate array in-place
  if (writeIdx > 0) {
    voices.length = writeIdx;
  } else {
    ctx.activeVoices.delete(channelIndex);
  }
}

/**
 * Signal key-off for a channel
 */
export function setChannelKeyOff(ctx: ChannelRoutingContext, channelIndex: number): void {
  const voices = ctx.activeVoices.get(channelIndex);
  if (voices) {
    voices.forEach(voice => {
      voice.isKeyOff = true;
      voice.volumeEnv.keyOff();
      voice.panningEnv.keyOff();
      voice.pitchEnv.keyOff();
    });
  }
}
