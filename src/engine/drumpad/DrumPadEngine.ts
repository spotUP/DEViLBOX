/**
 * DrumPadEngine - Audio playback engine for drum pads
 * Handles sample triggering with velocity, ADSR, filtering, and routing.
 * Supports per-pad effects chains (SpringReverb, SpaceEcho, TapeSaturation, etc.)
 * using Tone.js effect nodes connected inline with Web Audio routing.
 */

import * as Tone from 'tone';
import type { DrumPad } from '../../types/drumpad';
import { createEffectChain } from '../factories/EffectFactory';

interface VoiceState {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  filterNode: BiquadFilterNode | null;
  panNode: StereoPannerNode;
  startTime: number;
  noteOffTime: number | null;
  velocity: number;
}

interface PadEffectsChain {
  inputGain: GainNode;
  effects: { disconnect(): void; dispose(): void }[];
  outputGain: GainNode;
  configHash: string; // detect when effects config changes
}

export class DrumPadEngine {
  private static readonly MAX_VOICES = 32; // Polyphony limit

  private context: AudioContext;
  private masterGain: GainNode;
  private voices: Map<number, VoiceState> = new Map();
  private outputs: Map<string, GainNode> = new Map();
  private muteGroups: Map<number, number> = new Map(); // padId -> muteGroup
  private reversedBufferCache: WeakMap<AudioBuffer, AudioBuffer> = new WeakMap();
  private pendingCleanupTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private padEffects: Map<number, PadEffectsChain> = new Map();
  private _disposed = false;

  constructor(context: AudioContext, outputDestination?: AudioNode) {
    this.context = context;

    // Create master output — route to custom destination or default to context.destination
    this.masterGain = this.context.createGain();
    this.masterGain.connect(outputDestination ?? this.context.destination);

    // Create separate output buses
    this.outputs.set('stereo', this.masterGain);
    ['out1', 'out2', 'out3', 'out4'].forEach(bus => {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.outputs.set(bus, gain);
    });
  }

  /**
   * Reconnect master output to a different destination node.
   * Used when switching between standalone and DJ mixer routing.
   */
  rerouteOutput(destination: AudioNode): void {
    this.masterGain.disconnect();
    this.masterGain.connect(destination);
  }

  /**
   * Set mute group assignments for all pads
   */
  setMuteGroups(pads: DrumPad[]): void {
    this.muteGroups.clear();
    for (const pad of pads) {
      if (pad.muteGroup > 0) {
        this.muteGroups.set(pad.id, pad.muteGroup);
      }
    }
  }

  /**
   * Build or update the per-pad effects chain.
   * Called lazily on trigger — caches by config hash to avoid rebuilding every hit.
   */
  private async ensurePadEffectsChain(pad: DrumPad): Promise<PadEffectsChain | null> {
    if (!pad.effects || pad.effects.length === 0) {
      // No effects — dispose any existing chain
      this.disposePadEffectsChain(pad.id);
      return null;
    }

    const hash = JSON.stringify(pad.effects.map(e => ({ t: e.type, e: e.enabled, w: e.wet, p: e.parameters })));
    const existing = this.padEffects.get(pad.id);
    if (existing && existing.configHash === hash) return existing;

    // Dispose old chain
    this.disposePadEffectsChain(pad.id);

    const outputBus = this.outputs.get(pad.output) || this.masterGain;

    // Create input/output gains for the chain
    const inputGain = this.context.createGain();
    const outputGain = this.context.createGain();
    outputGain.connect(outputBus);

    try {
      const effectNodes = await createEffectChain(pad.effects);

      if (effectNodes.length === 0) {
        inputGain.connect(outputGain);
      } else {
        // Connect: inputGain → first effect
        const first = effectNodes[0] as Tone.ToneAudioNode;
        Tone.connect(inputGain, first);

        // Chain effects together
        for (let i = 0; i < effectNodes.length - 1; i++) {
          const a = effectNodes[i] as Tone.ToneAudioNode;
          const b = effectNodes[i + 1] as Tone.ToneAudioNode;
          a.connect(b);
        }

        // Last effect → outputGain
        const last = effectNodes[effectNodes.length - 1] as Tone.ToneAudioNode;
        Tone.connect(last, outputGain);
      }

      const chain: PadEffectsChain = { inputGain, effects: effectNodes as any[], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    } catch (err) {
      console.warn('[DrumPadEngine] Failed to create effects chain for pad', pad.id, err);
      inputGain.connect(outputGain);
      const chain: PadEffectsChain = { inputGain, effects: [], outputGain, configHash: hash };
      this.padEffects.set(pad.id, chain);
      return chain;
    }
  }

  /**
   * Dispose and remove a pad's effects chain.
   */
  private disposePadEffectsChain(padId: number): void {
    const chain = this.padEffects.get(padId);
    if (!chain) return;

    for (const fx of chain.effects) {
      try {
        (fx as Tone.ToneAudioNode).disconnect();
        fx.dispose();
      } catch { /* already disposed */ }
    }
    try { chain.inputGain.disconnect(); } catch { /* */ }
    try { chain.outputGain.disconnect(); } catch { /* */ }
    this.padEffects.delete(padId);
  }

  /**
   * Get or lazily create a reversed copy of an AudioBuffer
   */
  private getReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    const cached = this.reversedBufferCache.get(buffer);
    if (cached) return cached;

    const reversed = this.context.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = reversed.getChannelData(ch);
      for (let i = 0; i < src.length; i++) {
        dst[i] = src[src.length - 1 - i];
      }
    }
    this.reversedBufferCache.set(buffer, reversed);
    return reversed;
  }

  /**
   * Trigger a pad with velocity
   */
  triggerPad(pad: DrumPad, velocity: number): void {
    // Select sample: check velocity layers first, fall back to main sample
    let sampleBuffer = pad.sample?.audioBuffer ?? null;
    let layerLevelOffset = 0;

    if (pad.layers.length > 0) {
      const matchingLayer = pad.layers.find(
        l => velocity >= l.velocityRange[0] && velocity <= l.velocityRange[1]
      );
      if (matchingLayer?.sample?.audioBuffer) {
        sampleBuffer = matchingLayer.sample.audioBuffer;
        layerLevelOffset = matchingLayer.levelOffset;
      }
    }

    if (!sampleBuffer) return;

    // Handle reverse: use reversed buffer
    if (pad.reverse) {
      sampleBuffer = this.getReversedBuffer(sampleBuffer);
    }

    // Mute group choking: stop all voices in the same non-zero mute group
    if (pad.muteGroup > 0) {
      for (const [otherPadId, otherGroup] of this.muteGroups.entries()) {
        if (otherGroup === pad.muteGroup && otherPadId !== pad.id) {
          this.stopPad(otherPadId);
        }
      }
    }

    // Stop any existing voice for this pad
    this.stopPad(pad.id);

    // Enforce polyphony limit with voice stealing
    if (this.voices.size >= DrumPadEngine.MAX_VOICES) {
      this.stealOldestVoice();
    }

    const now = this.context.currentTime;
    const useFilter = pad.filterType !== 'off';

    // Create audio nodes — skip filter when not needed
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const panNode = this.context.createStereoPanner();
    let filterNode: BiquadFilterNode | null = null;

    // Configure source
    source.buffer = sampleBuffer;

    // Pitch: tune is ±120, where 10 units = 1 semitone (MPC-style fine tuning)
    const veloFactor = velocity / 127;
    const inverseVeloFactor = 1 - veloFactor;
    const pitchMod = (pad.veloToPitch / 100) * veloFactor * 12;
    const totalTune = pad.tune / 10 + pitchMod;
    if (totalTune !== 0) {
      source.playbackRate.value = Math.pow(2, totalTune / 12);
    }

    // Configure filter (only if active)
    if (useFilter) {
      filterNode = this.context.createBiquadFilter();
      switch (pad.filterType) {
        case 'lpf': filterNode.type = 'lowpass'; break;
        case 'hpf': filterNode.type = 'highpass'; break;
        case 'bpf': filterNode.type = 'bandpass'; break;
      }

      const veloCutoffMod = (pad.veloToFilter / 100) * veloFactor;
      const baseCutoff = pad.cutoff;
      const modulatedCutoff = baseCutoff + veloCutoffMod * (20000 - baseCutoff);

      filterNode.frequency.value = Math.min(20000, Math.max(20, modulatedCutoff));
      filterNode.Q.value = (pad.resonance / 100) * 20;

      // Filter envelope sweep (MPC-style)
      if (pad.filterEnvAmount > 0) {
        const envDepth = (pad.filterEnvAmount / 100) * (20000 - modulatedCutoff);
        const fAttackTime = (pad.filterAttack / 100) * 3;
        const fDecayTime = (pad.filterDecay / 100) * 2.6;
        const peakCutoff = Math.min(20000, modulatedCutoff + envDepth);

        filterNode.frequency.setValueAtTime(modulatedCutoff, now);
        filterNode.frequency.linearRampToValueAtTime(peakCutoff, now + fAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(20, modulatedCutoff),
          now + fAttackTime + fDecayTime
        );
      }
    }

    // Configure pan (skip if centered)
    if (pad.pan !== 0) {
      panNode.pan.value = pad.pan / 64;
    }

    // Velocity-to-level: controls how much velocity affects amplitude
    const veloLevelAmount = pad.veloToLevel / 100;
    const velocityScale = 1 - veloLevelAmount * inverseVeloFactor;
    const levelScale = pad.level / 127;
    const layerScale = layerLevelOffset !== 0 ? Math.pow(10, layerLevelOffset / 20) : 1;
    const targetGain = velocityScale * levelScale * layerScale;

    // Velocity-to-attack modulation: higher velocity = shorter attack
    const baseAttack = pad.attack / 1000;
    const veloAttackMod = (pad.veloToAttack / 100) * inverseVeloFactor;
    const attackTime = baseAttack * (1 + veloAttackMod * 2);

    const decayTime = pad.decay / 1000;
    const sustainLevel = (pad.sustain / 100) * targetGain;

    // ADSR envelope — use setValueAtTime for instant-attack pads to avoid ramp overhead
    if (attackTime < 0.001) {
      gainNode.gain.setValueAtTime(targetGain, now);
    } else {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
    }
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

    // Connect nodes — route through effects chain if pad has effects
    const effectsChain = this.padEffects.get(pad.id);
    const outputBus = this.outputs.get(pad.output) || this.masterGain;
    if (filterNode) {
      source.connect(filterNode);
      filterNode.connect(panNode);
    } else {
      source.connect(panNode);
    }
    panNode.connect(gainNode);
    if (effectsChain) {
      gainNode.connect(effectsChain.inputGain);
    } else {
      gainNode.connect(outputBus);
    }

    // Lazily build effects chain for next trigger if pad has effects but no chain yet
    if (pad.effects && pad.effects.length > 0 && !effectsChain) {
      this.ensurePadEffectsChain(pad).catch(() => {});
    }

    // Calculate sample start/end offsets
    const veloStartMod = (pad.veloToStart / 100) * inverseVeloFactor;
    let effectiveStart = pad.sampleStart + veloStartMod * (pad.sampleEnd - pad.sampleStart);
    effectiveStart = Math.min(effectiveStart, pad.sampleEnd - 0.01);

    let startOffset: number;
    let playDuration: number;
    if (pad.reverse) {
      startOffset = (1 - pad.sampleEnd) * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    } else {
      startOffset = effectiveStart * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    }

    // Start playback — schedule at 0 (now) for minimum latency
    source.start(0, startOffset, playDuration);

    // Auto-cleanup via onended (no extra silent-buffer timer node)
    source.onended = () => {
      this.cleanupVoice(pad.id);
    };

    // Store voice state
    const voice: VoiceState = {
      source,
      gainNode,
      filterNode: filterNode!,
      panNode,
      startTime: now,
      noteOffTime: null,
      velocity,
    };

    this.voices.set(pad.id, voice);
  }

  /**
   * Stop a pad (note off). Optional releaseTime in seconds for sustain mode pads.
   */
  stopPad(padId: number, releaseTime?: number): void {
    const voice = this.voices.get(padId);
    if (!voice || voice.noteOffTime !== null) {
      return;
    }

    const now = this.context.currentTime;
    voice.noteOffTime = now;

    const fadeTime = releaseTime ?? 0.01; // Default 10ms for fast choke

    // Release envelope (linear ramp to 0)
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Cleanup after fade completes
    const timer = setTimeout(() => {
      this.pendingCleanupTimers.delete(padId);
      this.cleanupVoice(padId);
    }, (fadeTime + 0.05) * 1000);
    this.pendingCleanupTimers.set(padId, timer);
  }

  /**
   * Steal the oldest voice when polyphony limit is reached
   */
  private stealOldestVoice(): void {
    if (this.voices.size === 0) return;

    // Find the voice with the oldest start time
    let oldestPadId: number | null = null;
    let oldestStartTime = Infinity;

    for (const [padId, voice] of this.voices.entries()) {
      if (voice.startTime < oldestStartTime) {
        oldestStartTime = voice.startTime;
        oldestPadId = padId;
      }
    }

    if (oldestPadId !== null) {
      // Stop the oldest voice to make room
      this.stopPad(oldestPadId);
    }
  }

  /**
   * Clean up voice resources (now race-condition safe)
   */
  private cleanupVoice(padId: number): void {
    if (this._disposed) return;
    const voice = this.voices.get(padId);
    if (!voice) {
      return;
    }

    this.voices.delete(padId);

    try {
      voice.source?.disconnect();
      voice.gainNode.disconnect();
      voice.filterNode?.disconnect();
      voice.panNode.disconnect();
      voice.source?.stop();
    } catch {
      // Ignore errors from already-stopped sources
    }
  }

  /**
   * Set master level
   */
  setMasterLevel(level: number): void {
    this.masterGain.gain.value = level / 127;
  }

  /**
   * Set output bus level
   */
  setOutputLevel(bus: string, level: number): void {
    const output = this.outputs.get(bus);
    if (output) {
      output.gain.value = level / 127;
    }
  }

  /**
   * Stop all voices
   */
  stopAll(): void {
    const padIds = Array.from(this.voices.keys());
    padIds.forEach(padId => this.stopPad(padId));
  }

  /**
   * Cleanup and release resources
   */
  dispose(): void {
    this._disposed = true;
    // Cancel all pending async cleanup timers
    this.pendingCleanupTimers.forEach(t => clearTimeout(t));
    this.pendingCleanupTimers.clear();
    // Dispose all pad effects chains
    for (const padId of this.padEffects.keys()) {
      this.disposePadEffectsChain(padId);
    }
    // Synchronously disconnect all voices
    for (const [, voice] of this.voices) {
      try {
        voice.source?.disconnect();
        voice.gainNode.disconnect();
        voice.filterNode?.disconnect();
        voice.panNode.disconnect();
        voice.source?.stop();
      } catch { /* ignore */ }
    }
    this.voices.clear();
    this.masterGain.disconnect();
    this.outputs.forEach(output => output.disconnect());
    this.outputs.clear();
  }

  /**
   * Pre-build effects chains for all pads that have effects.
   * Call after pad config changes (e.g., applying FX preset from context menu).
   */
  async updatePadEffects(pads: DrumPad[]): Promise<void> {
    for (const pad of pads) {
      if (pad.effects && pad.effects.length > 0) {
        await this.ensurePadEffectsChain(pad);
      } else {
        this.disposePadEffectsChain(pad.id);
      }
    }
  }

  /**
   * Get a voice's filter node for real-time modulation (joystick etc.)
   * Returns null if pad has no active voice or no filter.
   */
  getVoiceFilter(padId: number): BiquadFilterNode | null {
    return this.voices.get(padId)?.filterNode ?? null;
  }
}
