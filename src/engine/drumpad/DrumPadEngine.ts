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
   * Trigger a pad with velocity
   */
  triggerPad(pad: DrumPad, velocity: number): void {
    if (!pad.sample?.audioBuffer) {
      console.warn(`[DrumPadEngine] Pad ${pad.id} has no sample`);
      return;
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
    source.buffer = pad.sample.audioBuffer;
    source.playbackRate.value = Math.pow(2, pad.tune / 12); // Semitones to playback rate

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
      filterNode.frequency.value = pad.cutoff;
      filterNode.Q.value = (pad.resonance / 100) * 20; // 0-20 Q range
    }

    // Configure pan
    panNode.pan.value = pad.pan / 64; // -64 to +63 -> -1 to ~1

    // Calculate velocity scaling
    const velocityScale = velocity / 127;
    const levelScale = pad.level / 127;
    const targetGain = velocityScale * levelScale;

    // Apply ADSR envelope
    const attackTime = pad.attack / 1000;
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

    // Start playback
    source.start(now);

    // Schedule cleanup using Web Audio (sample-accurate)
    const duration = pad.sample.audioBuffer.duration / source.playbackRate.value;
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
   * Stop a pad immediately (note off)
   */
  stopPad(padId: number): void {
    const voice = this.voices.get(padId);
    if (!voice || voice.noteOffTime !== null) {
      return;
    }

    // Trigger release phase
    const now = this.context.currentTime;
    voice.noteOffTime = now;

    // Release envelope (linear ramp to 0)
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.linearRampToValueAtTime(0, now + 0.1); // 100ms release

    // Schedule cleanup using Web Audio (sample-accurate)
    const cleanupTime = now + 0.15; // 150ms total
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
