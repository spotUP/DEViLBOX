/**
 * DrumKitSynth - Multi-sample instrument with keymap
 *
 * Features:
 * - Note-to-sample mapping (like Impulse Tracker instruments)
 * - Per-sample pitch, volume, and pan offsets
 * - Polyphonic or monophonic playback
 * - Voice limiting with note cut option
 */

import * as Tone from 'tone';
import type { DrumKitConfig, DrumKitKeyMapping } from '../types/instrument';
import { noteToMidi } from '../lib/xmConversions';

interface ActiveVoice {
  player: Tone.Player;
  panner: Tone.Panner;
  gain: Tone.Gain;
  midiNote: number;
  mappingId: string;
  startTime: number;
}

export class DrumKitSynth extends Tone.ToneAudioNode {
  readonly name = 'DrumKitSynth';

  // Configuration
  private config: DrumKitConfig;

  // Loaded sample buffers
  private sampleBuffers: Map<string, AudioBuffer> = new Map();

  // Active voices
  private activeVoices: ActiveVoice[] = [];

  // Output chain
  private outputGain: Tone.Gain;

  // Required by ToneAudioNode
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  // Callback for loading samples
  private onSampleNeeded?: (sampleId: string, sampleUrl?: string) => Promise<AudioBuffer | null>;

  constructor(config: DrumKitConfig) {
    super();

    this.config = config;

    // Create I/O
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);

    // Output gain
    this.outputGain = new Tone.Gain(0.8);
    this.outputGain.connect(this.output);
  }

  /**
   * Set the sample loader callback
   */
  setSampleLoader(loader: (sampleId: string, sampleUrl?: string) => Promise<AudioBuffer | null>): void {
    this.onSampleNeeded = loader;
  }

  /**
   * Preload all samples in the keymap
   */
  async preloadSamples(): Promise<void> {
    if (!this.onSampleNeeded) return;

    const promises = this.config.keymap.map(async (mapping) => {
      if (!this.sampleBuffers.has(mapping.id)) {
        const buffer = await this.onSampleNeeded!(mapping.sampleId, mapping.sampleUrl);
        if (buffer) {
          this.sampleBuffers.set(mapping.id, buffer);
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * Load a specific sample buffer
   */
  loadSample(mappingId: string, buffer: AudioBuffer): void {
    this.sampleBuffers.set(mappingId, buffer);
  }

  /**
   * Find the keymap entry for a given MIDI note
   */
  private findMapping(midiNote: number): DrumKitKeyMapping | null {
    for (const mapping of this.config.keymap) {
      if (midiNote >= mapping.noteStart && midiNote <= mapping.noteEnd) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Convert note string to MIDI number (handling XM format)
   */
  private noteToMidiNumber(note: string | number): number {
    if (typeof note === 'number') {
      // XM format: 1 = C-0, 49 = C-4, etc.
      return note + 11; // Convert to MIDI (C-0 = 12)
    }
    return noteToMidi(note);
  }

  /**
   * Trigger a note
   */
  triggerAttack(note: string | number, time?: number, velocity: number = 0.8): void {
    const midiNote = this.noteToMidiNumber(note);
    const mapping = this.findMapping(midiNote);

    if (!mapping) {
      console.warn(`[DrumKitSynth] No mapping found for MIDI note ${midiNote}`);
      return;
    }

    // Get sample buffer
    const buffer = this.sampleBuffers.get(mapping.id);
    if (!buffer) {
      console.warn(`[DrumKitSynth] No buffer loaded for mapping ${mapping.id}`);
      return;
    }

    // Enforce voice limit
    if (this.activeVoices.length >= this.config.maxVoices) {
      // Remove oldest voice
      const oldest = this.activeVoices.shift();
      if (oldest) {
        this.disposeVoice(oldest);
      }
    }

    // Handle monophonic mode or note cut
    if (this.config.polyphony === 'mono' || this.config.noteCut) {
      // Cut all voices on the same mapping
      const toRemove = this.activeVoices.filter(v => v.mappingId === mapping.id);
      toRemove.forEach(v => {
        this.disposeVoice(v);
        const idx = this.activeVoices.indexOf(v);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      });
    }

    // Create Tone.js buffer from AudioBuffer
    const toneBuffer = new Tone.ToneAudioBuffer(buffer);

    // Create player
    const player = new Tone.Player({
      url: toneBuffer,
      playbackRate: this.calculatePlaybackRate(mapping, midiNote),
    });

    // Create panner with offset
    const panValue = (mapping.panOffset || 0) / 100; // -100 to +100 -> -1 to +1
    const panner = new Tone.Panner(panValue);

    // Create gain with velocity and volume offset
    const volumeMultiplier = Math.pow(10, (mapping.volumeOffset || 0) / 20); // dB to linear
    const gain = new Tone.Gain(velocity * volumeMultiplier);

    // Connect: player -> panner -> gain -> output
    player.connect(panner);
    panner.connect(gain);
    gain.connect(this.outputGain);

    // Start playback
    const startTime = time ?? Tone.now();
    player.start(startTime);

    // Track active voice
    const voice: ActiveVoice = {
      player,
      panner,
      gain,
      midiNote,
      mappingId: mapping.id,
      startTime,
    };
    this.activeVoices.push(voice);

    // Auto-cleanup when sample finishes
    // Access playbackRate as Param (has .value) or calculate from option
    const rate = this.calculatePlaybackRate(mapping, midiNote);
    const duration = buffer.duration / rate;
    setTimeout(() => {
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) {
        this.activeVoices.splice(idx, 1);
        this.disposeVoice(voice);
      }
    }, (duration + 0.1) * 1000);
  }

  /**
   * Calculate playback rate based on pitch offset and base note
   */
  private calculatePlaybackRate(mapping: DrumKitKeyMapping, targetMidiNote: number): number {
    // Base rate is 1.0 (original pitch)
    let rate = 1.0;

    // Apply pitch offset (semitones)
    if (mapping.pitchOffset) {
      rate *= Math.pow(2, mapping.pitchOffset / 12);
    }

    // Apply fine tune (cents)
    if (mapping.fineTune) {
      rate *= Math.pow(2, mapping.fineTune / 1200);
    }

    // If mapping has a base note, adjust for the target note difference
    if (mapping.baseNote) {
      const baseMidi = this.noteToMidiNumber(mapping.baseNote);
      const semitoneDiff = targetMidiNote - baseMidi;
      rate *= Math.pow(2, semitoneDiff / 12);
    }

    return Math.max(0.1, Math.min(4.0, rate)); // Clamp to reasonable range
  }

  /**
   * Release a note
   */
  triggerRelease(note: string | number, time?: number): void {
    const midiNote = this.noteToMidiNumber(note);

    // Find voice(s) for this note
    const toRelease = this.activeVoices.filter(v => v.midiNote === midiNote);

    toRelease.forEach(voice => {
      // Fade out over 50ms
      const releaseTime = time ?? Tone.now();
      voice.gain.gain.linearRampTo(0, 0.05, releaseTime);

      // Schedule cleanup
      setTimeout(() => {
        const idx = this.activeVoices.indexOf(voice);
        if (idx !== -1) {
          this.activeVoices.splice(idx, 1);
          this.disposeVoice(voice);
        }
      }, 100);
    });
  }

  /**
   * Dispose a voice
   */
  private disposeVoice(voice: ActiveVoice): void {
    try {
      voice.player.stop();
      voice.player.disconnect();
      voice.player.dispose();
      voice.panner.disconnect();
      voice.panner.dispose();
      voice.gain.disconnect();
      voice.gain.dispose();
    } catch (e) {
      // Ignore disposal errors
    }
  }

  /**
   * Release all notes
   */
  releaseAll(): void {
    this.activeVoices.forEach(voice => this.disposeVoice(voice));
    this.activeVoices = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DrumKitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current keymap
   */
  getKeymap(): DrumKitKeyMapping[] {
    return [...this.config.keymap];
  }

  /**
   * Add a key mapping
   */
  addMapping(mapping: DrumKitKeyMapping): void {
    this.config.keymap.push(mapping);
  }

  /**
   * Remove a key mapping
   */
  removeMapping(mappingId: string): void {
    const idx = this.config.keymap.findIndex(m => m.id === mappingId);
    if (idx !== -1) {
      this.config.keymap.splice(idx, 1);
      this.sampleBuffers.delete(mappingId);
    }
  }

  /**
   * Clear all mappings
   */
  clearKeymap(): void {
    this.config.keymap = [];
    this.sampleBuffers.clear();
    this.releaseAll();
  }

  /**
   * Dispose
   */
  dispose(): this {
    this.releaseAll();
    this.sampleBuffers.clear();
    this.outputGain.dispose();
    this.input.dispose();
    this.output.dispose();
    super.dispose();
    return this;
  }
}
