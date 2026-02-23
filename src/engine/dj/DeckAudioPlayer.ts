/**
 * DeckAudioPlayer - Audio file playback for DJ decks (MP3, WAV, FLAC, OGG, AAC, OPUS)
 *
 * Uses Tone.Player (AudioBuffer-based) for sample-accurate playback.
 * Connects to DeckEngine's deckGain node — same point TrackerReplayer connects.
 *
 * Cross-browser codec support via WASM fallback decoders:
 * - FLAC: @wasm-audio-decoders/flac
 * - OGG Vorbis: @wasm-audio-decoders/ogg-vorbis
 * - Opus: @wasm-audio-decoders/opus-ml
 */

import * as Tone from 'tone';
import { decodeAudio, type DecodeResult } from '../../lib/audio/UnifiedAudioDecoder';

export interface AudioFileInfo {
  duration: number;        // seconds
  sampleRate: number;
  numberOfChannels: number;
  waveformPeaks: Float32Array;  // pre-computed overview peaks
}

export class DeckAudioPlayer {
  private player: Tone.Player;
  private _duration = 0;
  private _sampleRate = 0;
  private _numberOfChannels = 0;
  private _waveformPeaks: Float32Array | null = null;
  private _loaded = false;
  private _playbackRate = 1;

  // Audio loop region (seconds)
  private _loopIn: number | null = null;
  private _loopOut: number | null = null;
  private _loopCheckTimer: number | null = null;

  constructor(outputNode: Tone.ToneAudioNode) {
    this.player = new Tone.Player({
      loop: false,
      autostart: false,
    });
    this.player.connect(outputNode);
  }

  /**
   * Load an audio file from an ArrayBuffer.
   * Decodes the audio and computes overview waveform peaks.
   * Uses WASM fallback decoders for cross-browser format support.
   */
  async loadAudioFile(buffer: ArrayBuffer, filename: string): Promise<AudioFileInfo> {
    // Decode audio with cross-browser support
    const audioContext = Tone.getContext().rawContext as AudioContext;
    const result: DecodeResult = await decodeAudio(audioContext, buffer, { filename });
    const audioBuffer = result.audioBuffer;

    if (result.usedWasm) {
      console.log(`[DeckAudioPlayer] Decoded ${result.format} using WASM fallback`);
    }

    // Store in Tone.Player
    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    this.player.buffer = toneBuffer;

    this._duration = audioBuffer.duration;
    this._sampleRate = audioBuffer.sampleRate;
    this._numberOfChannels = audioBuffer.numberOfChannels;
    this._loaded = true;

    // Compute waveform peaks for overview display
    this._waveformPeaks = this.computeWaveformPeaks(audioBuffer, 800);

    return {
      duration: this._duration,
      sampleRate: this._sampleRate,
      numberOfChannels: this._numberOfChannels,
      waveformPeaks: this._waveformPeaks,
    };
  }

  play(): void {
    if (!this._loaded || !this.player.buffer.loaded) return;
    if (this.player.state === 'started') {
      // Already playing
      return;
    }
    
    // Tiny fade-in (10ms) to prevent DC offset clicks/ticks
    this.player.fadeIn = 0.01;
    this.player.start();
  }

  pause(): void {
    if (this.player.state === 'started') {
      this.player.fadeOut = 0.01;
      this.player.stop();
    }
  }

  stop(): void {
    if (this.player.state === 'started') {
      this.player.fadeOut = 0.01;
      this.player.stop();
    }
    this.player.seek(0);
  }

  /**
   * Seek to a position in seconds.
   */
  seek(seconds: number): void {
    const wasPlaying = this.player.state === 'started';
    if (wasPlaying) {
      this.player.stop();
    }
    const clamped = Math.max(0, Math.min(seconds, this._duration));
    this.player.seek(clamped);
    if (wasPlaying) {
      this.player.start();
    }
  }

  /**
   * Set playback rate (for pitch/tempo). 1.0 = normal speed.
   */
  setPlaybackRate(rate: number): void {
    this._playbackRate = rate;
    this.player.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this._playbackRate;
  }

  /**
   * Get current playback position in seconds.
   * Uses Tone.js Transport timing for accuracy.
   */
  getPosition(): number {
    if (!this._loaded) return 0;
    // Tone.Player doesn't expose a clean position getter,
    // but we can calculate from the buffer source's progress
    try {
      // Access the underlying buffer source's current offset
      const now = Tone.now();
      const state = (this.player as any)._state;
      if (state) {
        const lastEvent = state.getValueAtTime(now);
        if (lastEvent === 'started') {
          // Find the start time from the state timeline
          const events = (state as any)._timeline;
          if (events && events.length > 0) {
            // Get the last 'started' event
            for (let i = events.length - 1; i >= 0; i--) {
              const evt = events[i];
              if (evt.state === 'started') {
                const elapsed = (now - evt.time) * this._playbackRate;
                const offset = evt.offset || 0;
                return Math.min(offset + elapsed, this._duration);
              }
            }
          }
        }
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  getDuration(): number {
    return this._duration;
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  isCurrentlyPlaying(): boolean {
    return this.player.state === 'started';
  }

  getWaveformPeaks(): Float32Array | null {
    return this._waveformPeaks;
  }

  /**
   * Compute downsampled waveform peaks for overview display.
   * Returns a Float32Array of peak amplitudes (0 to 1).
   */
  private computeWaveformPeaks(audioBuffer: AudioBuffer, numBins: number): Float32Array {
    const peaks = new Float32Array(numBins);
    const samplesPerBin = Math.floor(audioBuffer.length / numBins);

    // Use first channel (or mix down if stereo)
    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

    for (let bin = 0; bin < numBins; bin++) {
      const start = bin * samplesPerBin;
      const end = Math.min(start + samplesPerBin, audioBuffer.length);
      let maxAmp = 0;

      for (let i = start; i < end; i++) {
        let sample = Math.abs(channel0[i]);
        if (channel1) {
          sample = (sample + Math.abs(channel1[i])) / 2;
        }
        if (sample > maxAmp) maxAmp = sample;
      }

      peaks[bin] = maxAmp;
    }

    return peaks;
  }

  // ==========================================================================
  // AUDIO LOOP (time-based)
  // ==========================================================================

  /**
   * Set loop in/out points (seconds). When both are set, playback loops.
   * Pass null to clear a loop point.
   */
  setLoopRegion(loopIn: number | null, loopOut: number | null): void {
    this._loopIn = loopIn;
    this._loopOut = loopOut;

    if (loopIn !== null && loopOut !== null && loopOut > loopIn) {
      this.startLoopCheck();
    } else {
      this.stopLoopCheck();
    }
  }

  getLoopIn(): number | null { return this._loopIn; }
  getLoopOut(): number | null { return this._loopOut; }

  /** Start polling to detect when playback crosses loopOut and seek back to loopIn */
  private startLoopCheck(): void {
    this.stopLoopCheck();
    const check = () => {
      if (this._loopIn === null || this._loopOut === null) {
        this.stopLoopCheck();
        return;
      }
      const pos = this.getPosition();
      if (pos >= this._loopOut) {
        this.seek(this._loopIn);
      }
      this._loopCheckTimer = requestAnimationFrame(check);
    };
    this._loopCheckTimer = requestAnimationFrame(check);
  }

  private stopLoopCheck(): void {
    if (this._loopCheckTimer !== null) {
      cancelAnimationFrame(this._loopCheckTimer);
      this._loopCheckTimer = null;
    }
  }

  dispose(): void {
    this.stopLoopCheck();
    try { this.player.stop(); } catch { /* ignore */ }
    this.player.disconnect();
    this.player.dispose();
    this._loaded = false;
    this._waveformPeaks = null;
  }
}
