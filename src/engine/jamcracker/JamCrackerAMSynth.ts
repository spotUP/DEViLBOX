/**
 * JamCrackerAMSynth.ts - JamCracker AM (Additive/Modulation) synthesis instrument
 *
 * JamCracker's AM instruments use 64-byte signed 8-bit waveform loops with
 * phase modulation: two copies of the waveform are read at different phase
 * offsets and averaged together, creating evolving timbres.
 *
 * This is a per-note synth for playing individual AM instrument sounds,
 * separate from the whole-song WASM replayer.
 */

import type { DevilboxSynth } from '@/types/synth';
import type { JamCrackerConfig } from '@/types/instrument';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// JamCracker AM instruments use 64-byte waveform loops
const WAVE_SIZE = 64;

export class JamCrackerAMSynth implements DevilboxSynth {
  readonly name = 'JamCrackerAMSynth';
  readonly output: GainNode;

  private audioContext: AudioContext;
  private _disposed = false;
  private config: JamCrackerConfig | null = null;

  // Active voice state
  private activeNode: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;

  constructor() {
    this.audioContext = getDevilboxAudioContext();
    this.output = this.audioContext.createGain();
  }

  setInstrument(config: JamCrackerConfig): void {
    this.config = config;
  }

  /**
   * Build an AudioBuffer from the AM waveform data.
   * Blends two phase-offset copies of the 64-byte waveform.
   */
  private buildWaveBuffer(phaseDelta: number): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    // Create enough cycles for a smooth loop (~1 second at base frequency)
    const numCycles = Math.max(1, Math.floor(sampleRate / WAVE_SIZE));
    const bufLen = numCycles * WAVE_SIZE;
    const buffer = this.audioContext.createBuffer(1, bufLen, sampleRate);
    const data = buffer.getChannelData(0);

    const waveData = this.config?.waveformData;
    if (!waveData || waveData.length < WAVE_SIZE) {
      // No waveform data — silent
      data.fill(0);
      return buffer;
    }

    // Read first 64-byte waveform chunk as signed int8
    let phase = 0;
    for (let i = 0; i < bufLen; i++) {
      const idx = i % WAVE_SIZE;
      const phaseIdx = (idx + Math.floor(phase / 4)) % WAVE_SIZE;

      // Read as signed int8 (-128 to 127) and normalize to -1..1
      const s1 = waveData[idx] > 127 ? waveData[idx] - 256 : waveData[idx];
      const s2 = waveData[phaseIdx] > 127 ? waveData[phaseIdx] - 256 : waveData[phaseIdx];

      // Average the two samples (JamCracker AM blend)
      data[i] = ((s1 + s2) / 2) / 128;

      // Advance phase
      phase = (phase + phaseDelta) & 0xFF;
    }

    return buffer;
  }

  triggerAttack(note?: string | number, _time?: number, velocity?: number): void {
    if (this._disposed || !this.config) return;

    // Stop any existing note
    this.stopActiveVoice();

    let midiNote: number;
    if (typeof note === 'string') {
      midiNote = noteToMidi(note);
    } else if (typeof note === 'number') {
      midiNote = note;
    } else {
      midiNote = 60; // C-4
    }

    // Build the waveform buffer
    const buffer = this.buildWaveBuffer(this.config.phaseDelta);

    // Create source node
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Calculate playback rate from MIDI note
    // Base frequency: C-4 = MIDI 60, wave cycle = 64 samples at sampleRate
    const baseFreq = this.audioContext.sampleRate / WAVE_SIZE;
    const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
    source.playbackRate.value = targetFreq / baseFreq;

    // Velocity-scaled gain
    const vel = velocity ?? 1;
    const vol = (this.config.volume / 64) * vel;
    const gain = this.audioContext.createGain();
    gain.gain.value = vol;

    source.connect(gain);
    gain.connect(this.output);
    source.start();

    this.activeNode = source;
    this.activeGain = gain;
  }

  triggerRelease(_note?: string | number, _time?: number): void {
    if (this._disposed) return;
    this.stopActiveVoice();
  }

  releaseAll(): void {
    this.stopActiveVoice();
  }

  private stopActiveVoice(): void {
    if (this.activeNode) {
      try {
        this.activeNode.stop();
        this.activeNode.disconnect();
      } catch { /* already stopped */ }
      this.activeNode = null;
    }
    if (this.activeGain) {
      this.activeGain.disconnect();
      this.activeGain = null;
    }
  }

  set(param: string, value: number): void {
    if (!this.config) return;
    switch (param) {
      case 'volume':
        this.config.volume = Math.max(0, Math.min(64, Math.round(value * 64)));
        if (this.activeGain) {
          this.activeGain.gain.value = this.config.volume / 64;
        }
        break;
      case 'phaseDelta':
        this.config.phaseDelta = Math.max(0, Math.min(255, Math.round(value)));
        break;
    }
  }

  get(param: string): number | undefined {
    if (!this.config) return undefined;
    switch (param) {
      case 'volume': return this.config.volume / 64;
      case 'phaseDelta': return this.config.phaseDelta;
    }
    return undefined;
  }

  dispose(): void {
    this._disposed = true;
    this.stopActiveVoice();
  }
}
