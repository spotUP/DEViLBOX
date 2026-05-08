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

  // Position tracking for variable-rate playback (scratch)
  // Checkpointed whenever rate changes so getPosition() stays accurate
  private _rateChangePos = 0;    // position in seconds at last rate change
  private _rateChangeTime = 0;   // Tone.now() at last rate change
  private _rateTrackingActive = false;

  // Pending seek offset for when player is stopped
  private _pendingOffset: number | null = null;

  // Audio loop region (seconds)
  private _loopIn: number | null = null;
  private _loopOut: number | null = null;
  private _loopCheckTimer: number | null = null;
  private _originalFileBytes: ArrayBuffer | null = null;
  private _disposed = false;

  constructor(outputNode: Tone.ToneAudioNode) {
    this.player = new Tone.Player({
      loop: true,
      autostart: false,
    });
    this.player.connect(outputNode);
  }

  /**
   * Load an audio file from an ArrayBuffer.
   * Decodes the audio and computes overview waveform peaks.
   * Uses WASM fallback decoders for cross-browser format support.
   */
  getOriginalFileBytes(): ArrayBuffer | null {
    return this._originalFileBytes;
  }

  /** Get the decoded AudioBuffer (stereo). Used for stem separation. */
  getAudioBuffer(): AudioBuffer | null {
    if (!this._loaded || !this.player.buffer?.loaded) return null;
    return this.player.buffer.get() as AudioBuffer;
  }

  private _loadVersion = 0;

  async loadAudioFile(buffer: ArrayBuffer, filename: string, precomputedPeaks?: Float32Array): Promise<AudioFileInfo> {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new Error(`File too large (${(buffer.byteLength / 1024 / 1024).toFixed(0)} MB, max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
    }

    const myVersion = ++this._loadVersion;

    // Release previous track resources before loading new ones
    if (this._originalFileBytes) {
      this._originalFileBytes = null;
    }
    if (this.player?.buffer?.loaded) {
      try { this.player.buffer.dispose(); } catch { /* ignore */ }
    }

    this._originalFileBytes = buffer.slice(0);
    console.log(`[DeckAudioPlayer] loadAudioFile: ${filename}, buffer size: ${buffer.byteLength} bytes`);
    
    // Decode audio with cross-browser support
    const audioContext = Tone.getContext().rawContext as AudioContext;
    const result: DecodeResult = await decodeAudio(audioContext, buffer, { filename });

    // Guard: if another load started while we were decoding, discard this result
    if (myVersion !== this._loadVersion) {
      console.log(`[DeckAudioPlayer] Discarding stale decode for ${filename} (version ${myVersion} != ${this._loadVersion})`);
      return {
        duration: result.audioBuffer.duration,
        sampleRate: result.audioBuffer.sampleRate,
        numberOfChannels: result.audioBuffer.numberOfChannels,
        waveformPeaks: new Float32Array(0),
      };
    }

    const audioBuffer = result.audioBuffer;

    console.log(`[DeckAudioPlayer] Decoded: duration=${audioBuffer.duration.toFixed(2)}s, sampleRate=${audioBuffer.sampleRate}, channels=${audioBuffer.numberOfChannels}, frames=${audioBuffer.length}`);

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

    // Set loopEnd to full duration so the default whole-track loop works.
    // Without this, loopEnd stays at the constructor default (0) which
    // creates a zero-length loop that stops playback immediately.
    this.player.loopEnd = audioBuffer.duration;

    // Use pre-computed peaks if available (from background pre-render),
    // otherwise compute them asynchronously with yielding to avoid UI jank
    if (precomputedPeaks && precomputedPeaks.length > 0) {
      this._waveformPeaks = precomputedPeaks;
    } else {
      this._waveformPeaks = await this.computeWaveformPeaksAsync(audioBuffer, 800);
    }

    return {
      duration: this._duration,
      sampleRate: this._sampleRate,
      numberOfChannels: this._numberOfChannels,
      waveformPeaks: this._waveformPeaks,
    };
  }

  async play(): Promise<void> {
    if (!this._loaded || !this.player.buffer.loaded) {
      // Throw so callers (e.g. DJActions togglePlay) don't leave the store in
      // a "playing" state when the engine actually has nothing to play.
      // Silently returning here caused silent-playback desync where the UI
      // showed the deck as active but no audio reached the bus.
      throw new Error('DeckAudioPlayer.play() called before buffer loaded');
    }
    if (this.player.state === 'started') {
      // Already playing — not an error
      return;
    }
    
    // Ensure AudioContext is running (essential for audio output)
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }

    // Tiny fade-in (10ms) to prevent DC offset clicks/ticks
    this.player.fadeIn = 0.01;
    const startOffset = this._pendingOffset ?? 0;
    if (this._pendingOffset !== null) {
      this.player.start(undefined, this._pendingOffset);
      this._pendingOffset = null;
    } else {
      this.player.start();
    }

    // Initialize checkpoint tracking immediately so getPosition() is always
    // accurate — even if setPlaybackRate() hasn't been called yet (e.g. scratch
    // that goes backward before any forward rate change)
    this._rateChangePos = startOffset;
    this._rateChangeTime = Tone.now();
    this._rateTrackingActive = true;
  }

  pause(): void {
    if (this.player.state === 'started') {
      // Snapshot position before stopping so getPosition() returns it while paused
      this._pendingOffset = this.getPosition();
      this.player.fadeOut = 0.01;
      this.player.stop();
      this._rateTrackingActive = false;
    }
  }

  /** Resume from pending offset (set by seek while paused). Single start, no overlapping sources. */
  resume(): void {
    if (!this._loaded || this.player.state === 'started') return;
    this.player.fadeIn = 0.01;
    const offset = this._pendingOffset ?? 0;
    this.player.start(undefined, offset);
    this._pendingOffset = null;
    this._rateChangePos = offset;
    this._rateChangeTime = Tone.now();
    this._rateTrackingActive = true;
  }

  stop(): void {
    if (this.player.state === 'started') {
      this.player.fadeOut = 0.01;
      this.player.stop();
    }
    this._pendingOffset = null;
    this._rateTrackingActive = false;
    this.player.seek(0);
  }

  /**
   * Seek to a position in seconds.
   */
  seek(seconds: number): void {
    const wasPlaying = this.player.state === 'started';
    const clamped = Math.max(0, Math.min(seconds, this._duration));
    // Reset rate tracking to match new seek position
    this._rateChangePos = clamped;
    this._rateChangeTime = Tone.now();
    this._rateTrackingActive = wasPlaying;
    if (wasPlaying) {
      // Force-stop every currently-active source at the native AudioContext
      // time WITHOUT a fadeout — bypassing Tone.Player's `stop()` which
      // schedules a gain ramp to 0 and keeps the old audio audible during
      // the fade. With a fadeout, `start(..., newOffset)` begins while the
      // old sources are still ringing out → audible double playback (two
      // copies of the track with an offset). Same pattern as setPlaybackRate
      // already uses for multi-source zombie cleanup.
      const activeSources = (this.player as any)._activeSources as Set<any>;
      const ctx = Tone.getContext().rawContext as AudioContext;
      const rawNow = ctx.currentTime;
      for (const s of activeSources) {
        try {
          // ToneBufferSource: cancel any pending stop, zero the gain envelope
          // instantly, and stop the native source immediately.
          if (typeof s.cancelStop === 'function') s.cancelStop();
          if (s.gainNode?.gain) {
            s.gainNode.gain.cancelScheduledValues(rawNow);
            s.gainNode.gain.setValueAtTime(0, rawNow);
          }
          s.stop(rawNow);
        } catch { /* already disposed */ }
      }
      activeSources.clear();
      // Also reset Tone.Player's internal state so `start()` treats this
      // as a fresh start instead of queueing behind the just-killed sources.
      try { (this.player as any)._state.setStateAtTime('stopped', rawNow); } catch { /* */ }

      this.player.start(undefined, clamped);
    } else {
      this._pendingOffset = clamped;
      this._rateTrackingActive = false;
    }
  }

  /**
   * Set playback rate (for pitch/tempo). 1.0 = normal speed.
   * Checkpoints position before applying new rate so getPosition() stays accurate.
   *
   * IMPORTANT: Sets rate directly on the underlying AudioBufferSourceNode(s) to
   * bypass Tone.Player's playbackRate setter, which calls cancelStop() on ALL
   * _activeSources — resurrecting zombie sources that should be fading out.
   * This caused the flanger/doubling effect during rapid scratching.
   */
  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0, Math.min(4, rate)); // 0x to 4x — covers any realistic scratch or pitch bend
    if (this._loaded && this.player.state === 'started') {
      // Checkpoint current position before rate change
      const now = Tone.now();
      if (this._rateTrackingActive) {
        this._rateChangePos += (now - this._rateChangeTime) * this._playbackRate;
        if (this._duration > 0) {
          this._rateChangePos = this._rateChangePos % this._duration;
        }
      } else {
        // First rate change since playback started — snapshot from Tone state
        this._rateChangePos = this._getPositionFromToneState() ?? 0;
        this._rateTrackingActive = true;
      }
      this._rateChangeTime = now;
    }
    this._playbackRate = clamped;

    // Bypass Tone.Player's playbackRate setter to avoid cancelStop() on zombie sources.
    // Set _playbackRate directly and apply rate only to the newest source.
    (this.player as any)._playbackRate = clamped;
    const activeSources: Set<any> = (this.player as any)._activeSources;
    if (activeSources && activeSources.size > 0) {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const now = ctx.currentTime;

      // If multiple sources exist, keep only the newest one and force-stop
      // the rest. This prevents zombie source accumulation during rapid
      // scratch operations (seek/stop/start cycles).
      if (activeSources.size > 1) {
        const sources = Array.from(activeSources);
        const newest = sources[sources.length - 1];
        for (let i = 0; i < sources.length - 1; i++) {
          try {
            sources[i].stop(now);
            activeSources.delete(sources[i]);
          } catch { /* already disposed */ }
        }
        try {
          newest.playbackRate.setValueAtTime(clamped, now);
        } catch { /* source may be disposed */ }
      } else {
        activeSources.forEach((source: any) => {
          try {
            source.playbackRate.setValueAtTime(clamped, now);
          } catch { /* source may be disposed */ }
        });
      }
    }
  }

  getPlaybackRate(): number {
    return this._playbackRate;
  }

  /**
   * Get current playback position in seconds.
   * Uses rate-change checkpoint tracking for accuracy during scratch.
   */
  getPosition(): number {
    if (!this._loaded) return 0;
    if (this._pendingOffset !== null) return this._pendingOffset;

    if (this._rateTrackingActive && this.player.state === 'started') {
      const now = Tone.now();
      const elapsed = (now - this._rateChangeTime) * this._playbackRate;
      const raw = this._rateChangePos + elapsed;
      return this._duration > 0 ? ((raw % this._duration) + this._duration) % this._duration : 0;
    }

    return this._getPositionFromToneState() ?? 0;
  }

  /** Read position from Tone.js internal state (original method, used as fallback) */
  private _getPositionFromToneState(): number | null {
    try {
      const now = Tone.now();
      const state = (this.player as any)._state;
      if (state) {
        const lastEvent = state.getValueAtTime(now);
        if (lastEvent === 'started') {
          const events = (state as any)._timeline;
          if (events && events.length > 0) {
            for (let i = events.length - 1; i >= 0; i--) {
              const evt = events[i];
              if (evt.state === 'started') {
                const elapsed = (now - evt.time) * this._playbackRate;
                const offset = evt.offset || 0;
                const raw = offset + elapsed;
                return this._duration > 0 ? raw % this._duration : 0;
              }
            }
          }
        }
      }
    } catch {
      // Fallback
    }
    return null;
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
  /** Compute waveform peaks asynchronously, yielding to the main thread
   *  between chunks to avoid blocking the UI during transitions. */
  private async computeWaveformPeaksAsync(audioBuffer: AudioBuffer, numBins: number): Promise<Float32Array> {
    const peaks = new Float32Array(numBins);
    const samplesPerBin = Math.floor(audioBuffer.length / numBins);
    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

    const BINS_PER_CHUNK = 100; // ~100 bins per frame, keeps each chunk < 2ms

    for (let chunkStart = 0; chunkStart < numBins; chunkStart += BINS_PER_CHUNK) {
      const chunkEnd = Math.min(chunkStart + BINS_PER_CHUNK, numBins);
      for (let bin = chunkStart; bin < chunkEnd; bin++) {
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
      // Yield to main thread between chunks
      if (chunkEnd < numBins) {
        await new Promise(r => setTimeout(r, 0));
      }
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
    if (loopIn !== null && loopOut !== null) {
      const clampedIn = Math.max(0, Math.min(loopIn, this._duration));
      const clampedOut = Math.max(clampedIn + 0.001, Math.min(loopOut, this._duration));
      this._loopIn = clampedIn;
      this._loopOut = clampedOut;
    } else {
      this._loopIn = loopIn;
      this._loopOut = loopOut;
    }

    if (this._loopIn !== null && this._loopOut !== null && this._loopOut > this._loopIn) {
      // Use Tone.Player's native loop for sample-accurate boundaries
      this.player.loop = true;
      this.player.loopStart = this._loopIn;
      this.player.loopEnd = this._loopOut;
      // Safety net: rAF fallback catches edge cases (rate changes near boundary)
      this.startLoopCheck();
    } else {
      // Restore whole-track loop (no custom region).
      // loopEnd must equal the buffer duration — setting it to 0 creates a
      // zero-length loop that stops playback immediately.
      this.player.loop = true;
      this.player.loopStart = 0;
      this.player.loopEnd = this._duration || this.player.buffer?.duration || 0;
      this.stopLoopCheck();
    }
  }

  getLoopIn(): number | null { return this._loopIn; }
  getLoopOut(): number | null { return this._loopOut; }

  /**
   * Safety-net polling for loop boundaries.
   * Primary loop is handled by Tone.Player's native Web Audio loop (sample-accurate).
   * This catches edge cases like rate changes near the loop boundary.
   */
  private startLoopCheck(): void {
    this.stopLoopCheck();
    const check = () => {
      if (!this._loaded || this._disposed) return;
      if (this._loopIn === null || this._loopOut === null) {
        this.stopLoopCheck();
        return;
      }
      const pos = this.getPosition();
      if (pos >= this._loopOut) {
        // Wrap with offset preservation to avoid drift
        const overshoot = pos - this._loopOut;
        const loopLen = this._loopOut - this._loopIn;
        const wrapped = this._loopIn + (loopLen > 0 ? overshoot % loopLen : 0);
        this.seek(wrapped);
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
    this._disposed = true;  // set BEFORE stopLoopCheck so any in-flight rAF sees it
    this.stopLoopCheck();
    try { this.player.stop(); } catch { /* ignore */ }
    this.player.disconnect();
    this.player.dispose();
    this._loaded = false;
    this._waveformPeaks = null;
    this._originalFileBytes = null;
  }
}
