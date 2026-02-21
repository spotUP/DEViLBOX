/**
 * DrumPadEngine - Audio playback engine for drum pads
 * Handles sample triggering with velocity, ADSR, filtering, and routing
 */

import type { DrumPad } from '../../types/drumpad';

interface VoiceState {
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  filterNode: BiquadFilterNode;
  panNode: StereoPannerNode;
  startTime: number;
  noteOffTime: number | null;
  velocity: number;
  cleanupSource?: AudioBufferSourceNode; // For sample-accurate cleanup
}

export class DrumPadEngine {
  private static readonly MAX_VOICES = 32; // Polyphony limit

  private context: AudioContext;
  private masterGain: GainNode;
  private voices: Map<number, VoiceState> = new Map();
  private outputs: Map<string, GainNode> = new Map();
  private muteGroups: Map<number, number> = new Map(); // padId -> muteGroup
  private reversedBufferCache: WeakMap<AudioBuffer, AudioBuffer> = new WeakMap();

  constructor(context: AudioContext) {
    this.context = context;

    // Create master output
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    // Create separate output buses
    this.outputs.set('stereo', this.masterGain);
    ['out1', 'out2', 'out3', 'out4'].forEach(bus => {
      const gain = this.context.createGain();
      gain.connect(this.masterGain);
      this.outputs.set(bus, gain);
    });
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

    if (!sampleBuffer) {
      console.warn(`[DrumPadEngine] Pad ${pad.id} has no sample`);
      return;
    }

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

    // Create audio nodes
    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    const filterNode = this.context.createBiquadFilter();
    const panNode = this.context.createStereoPanner();

    // Configure source
    source.buffer = sampleBuffer;

    // Pitch: tune is ±120, where 10 units = 1 semitone (MPC-style fine tuning)
    // Velocity-to-pitch modulation: veloToPitch range ±120
    const veloFactor = velocity / 127;
    const inverseVeloFactor = 1 - veloFactor;
    const pitchMod = (pad.veloToPitch / 100) * veloFactor * 12; // Scale to ±12 semitones
    const totalTune = pad.tune / 10 + pitchMod; // Convert tune units to semitones
    source.playbackRate.value = Math.pow(2, totalTune / 12);

    // Configure filter
    if (pad.filterType !== 'off') {
      switch (pad.filterType) {
        case 'lpf':
          filterNode.type = 'lowpass';
          break;
        case 'hpf':
          filterNode.type = 'highpass';
          break;
        case 'bpf':
          filterNode.type = 'bandpass';
          break;
      }

      // Base cutoff + velocity modulation
      const veloCutoffMod = (pad.veloToFilter / 100) * veloFactor;
      const baseCutoff = pad.cutoff;
      // Velocity opens the filter: at high velocity, cutoff goes up
      const modulatedCutoff = baseCutoff + veloCutoffMod * (20000 - baseCutoff);

      filterNode.frequency.value = Math.min(20000, Math.max(20, modulatedCutoff));
      filterNode.Q.value = (pad.resonance / 100) * 20; // 0-20 Q range

      // Filter envelope sweep (MPC-style)
      if (pad.filterEnvAmount > 0) {
        const envDepth = (pad.filterEnvAmount / 100) * (20000 - modulatedCutoff);
        const fAttackTime = (pad.filterAttack / 100) * 3; // 0-3 seconds
        const fDecayTime = (pad.filterDecay / 100) * 2.6; // 0-2.6 seconds (MPC max)
        const peakCutoff = Math.min(20000, modulatedCutoff + envDepth);

        // Filter envelope: attack up, then decay back to base
        filterNode.frequency.setValueAtTime(modulatedCutoff, now);
        filterNode.frequency.linearRampToValueAtTime(peakCutoff, now + fAttackTime);
        filterNode.frequency.exponentialRampToValueAtTime(
          Math.max(20, modulatedCutoff),
          now + fAttackTime + fDecayTime
        );
      }
    }

    // Configure pan
    panNode.pan.value = pad.pan / 64; // -64 to +63 -> -1 to ~1

    // Velocity-to-level: controls how much velocity affects amplitude
    // veloToLevel=0: fixed level, veloToLevel=100: full velocity range
    const veloLevelAmount = pad.veloToLevel / 100;
    const velocityScale = 1 - veloLevelAmount * inverseVeloFactor;
    const levelScale = pad.level / 127;
    const layerScale = layerLevelOffset !== 0 ? Math.pow(10, layerLevelOffset / 20) : 1;
    const targetGain = velocityScale * levelScale * layerScale;

    // Velocity-to-attack modulation: higher velocity = shorter attack
    const baseAttack = pad.attack / 1000;
    const veloAttackMod = (pad.veloToAttack / 100) * inverseVeloFactor;
    const attackTime = baseAttack * (1 + veloAttackMod * 2); // Soft hits get longer attack

    const decayTime = pad.decay / 1000;
    const sustainLevel = (pad.sustain / 100) * targetGain;
    const releaseTime = pad.release / 1000;

    // Attack
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);

    // Decay to sustain
    gainNode.gain.linearRampToValueAtTime(
      sustainLevel,
      now + attackTime + decayTime
    );

    // Connect nodes
    source.connect(filterNode);
    filterNode.connect(panNode);
    panNode.connect(gainNode);

    // Route to appropriate output bus
    const outputBus = this.outputs.get(pad.output) || this.masterGain;
    gainNode.connect(outputBus);

    // Calculate sample start/end offsets
    // Velocity-to-start: soft hits start later in the sample (transient softening)
    const veloStartMod = (pad.veloToStart / 100) * inverseVeloFactor;
    let effectiveStart = pad.sampleStart + veloStartMod * (pad.sampleEnd - pad.sampleStart);
    effectiveStart = Math.min(effectiveStart, pad.sampleEnd - 0.01); // Ensure some playback

    let startOffset: number;
    let playDuration: number;
    if (pad.reverse) {
      startOffset = (1 - pad.sampleEnd) * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    } else {
      startOffset = effectiveStart * sampleBuffer.duration;
      playDuration = (pad.sampleEnd - effectiveStart) * sampleBuffer.duration;
    }

    // Start playback with sample start/end
    source.start(now, startOffset, playDuration);

    // Schedule cleanup using Web Audio (sample-accurate)
    const duration = playDuration / source.playbackRate.value;
    const cleanupTime = now + duration + releaseTime + 0.1; // Extra 100ms buffer

    // Create silent buffer to trigger cleanup at exact time
    const silentBuffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const cleanupSource = this.context.createBufferSource();
    cleanupSource.buffer = silentBuffer;
    cleanupSource.connect(this.context.destination);

    // Use onended for sample-accurate cleanup
    cleanupSource.onended = () => {
      this.cleanupVoice(pad.id);
    };

    cleanupSource.start(cleanupTime);

    // Store voice state
    const voice: VoiceState = {
      source,
      gainNode,
      filterNode,
      panNode,
      startTime: now,
      noteOffTime: null,
      velocity,
      cleanupSource,
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

    // Trigger release phase
    const now = this.context.currentTime;
    voice.noteOffTime = now;

    const fadeTime = releaseTime ?? 0.1; // Default 100ms release

    // Release envelope (linear ramp to 0)
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

    // Schedule cleanup using Web Audio (sample-accurate)
    const cleanupTime = now + fadeTime + 0.05; // Extra 50ms buffer
    const silentBuffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const cleanupSource = this.context.createBufferSource();
    cleanupSource.buffer = silentBuffer;
    cleanupSource.connect(this.context.destination);
    cleanupSource.onended = () => {
      this.cleanupVoice(padId);
    };
    cleanupSource.start(cleanupTime);
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
    const voice = this.voices.get(padId);
    if (!voice) {
      return; // Already cleaned up
    }

    // Delete immediately to prevent double-cleanup
    this.voices.delete(padId);

    try {
      voice.source?.stop();
      voice.source?.disconnect();
      voice.gainNode.disconnect();
      voice.filterNode.disconnect();
      voice.panNode.disconnect();
      voice.cleanupSource?.disconnect();
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
    this.stopAll();
    this.masterGain.disconnect();
    this.outputs.forEach(output => output.disconnect());
    this.outputs.clear();
    this.voices.clear();
  }
}
