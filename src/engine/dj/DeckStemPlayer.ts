/**
 * DeckStemPlayer — Synchronized multi-stem audio playback for DJ decks.
 *
 * Manages 4-6 Tone.Player instances (one per stem from Demucs separation)
 * with sample-accurate start/stop/seek and per-stem gain control.
 *
 * Signal flow:
 *   stemPlayer[drums]  → drumGain  ─┐
 *   stemPlayer[bass]   → bassGain  ─┼→ stemBus (GainNode) → outputNode
 *   stemPlayer[vocals] → vocalGain ─┤
 *   stemPlayer[other]  → otherGain ─┘
 *
 * The outputNode is the same node DeckAudioPlayer connects to (keyLock.input),
 * allowing mode switching by muting/unmuting the respective sources.
 */

import * as Tone from 'tone';
import type { StemResult } from '../demucs/types';

interface StemSlot {
  player: Tone.Player;
  gain: GainNode;      // Native GainNode for zero-latency mute/unmute
  muted: boolean;
  volume: number;       // 0-1 stem volume (independent of mute)
}

export class DeckStemPlayer {
  private stems: Map<string, StemSlot> = new Map();
  private stemBus: GainNode;
  private _loaded = false;
  private _duration = 0;
  private _playbackRate = 1;
  private _muted = true; // Starts muted — only audible when stem mode is on

  // Position tracking (mirrors DeckAudioPlayer's checkpoint system)
  private _rateChangePos = 0;
  private _rateChangeTime = 0;
  private _rateTrackingActive = false;
  private _pendingOffset: number | null = null;

  constructor(outputNode: Tone.ToneAudioNode) {
    const ctx = Tone.getContext().rawContext as AudioContext;
    this.stemBus = ctx.createGain();
    this.stemBus.gain.value = 0; // Muted by default

    // Connect stemBus to the Tone output node
    const nativeOutput = getNativeNode(outputNode);
    if (nativeOutput) {
      this.stemBus.connect(nativeOutput);
    }
  }

  /**
   * Load stem separation results as playable audio buffers.
   * Converts Float32Array pairs to AudioBuffers and creates per-stem players.
   * Frees StemResult arrays after conversion to minimize memory pressure.
   */
  async loadStems(result: StemResult, sampleRate: number): Promise<string[]> {
    this.disposeStems();

    const ctx = Tone.getContext().rawContext as AudioContext;
    const stemNames = Object.keys(result);
    const numSamples = result[stemNames[0]].left.length;
    this._duration = numSamples / sampleRate;

    for (const name of stemNames) {
      const { left, right } = result[name];

      // Create stereo AudioBuffer from Float32 arrays
      // Cast via unknown to satisfy TypeScript's strict ArrayBuffer vs ArrayBufferLike check
      const audioBuffer = ctx.createBuffer(2, left.length, sampleRate);
      audioBuffer.copyToChannel(left as unknown as Float32Array<ArrayBuffer>, 0);
      audioBuffer.copyToChannel(right as unknown as Float32Array<ArrayBuffer>, 1);

      // Create Tone.Player with the buffer
      const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
      const player = new Tone.Player({
        loop: true,
        autostart: false,
      });
      player.buffer = toneBuffer;

      // Per-stem native GainNode (bypass Tone.Signal for instant mute)
      const gain = ctx.createGain();
      gain.gain.value = 1.0; // Unmuted by default within stem bus

      // Wire: player → gain → stemBus
      const nativePlayer = getNativeNode(player as unknown as Tone.ToneAudioNode);
      if (nativePlayer) {
        nativePlayer.connect(gain);
      } else {
        // Fallback: Tone-level connection through a wrapper
        const wrapper = new Tone.Gain(1);
        player.connect(wrapper);
        const nw = getNativeNode(wrapper as unknown as Tone.ToneAudioNode);
        if (nw) nw.connect(gain);
      }
      gain.connect(this.stemBus);

      this.stems.set(name, { player, gain, muted: false, volume: 1.0 });
    }

    this._loaded = true;
    this._pendingOffset = 0;
    console.log(`[DeckStemPlayer] Loaded ${stemNames.length} stems: ${stemNames.join(', ')} (${this._duration.toFixed(1)}s @ ${sampleRate}Hz)`);
    return stemNames;
  }

  /**
   * Compute per-stem waveform peaks (for visualization).
   * Returns a record of stemName → Float32Array of peak values (0-1),
   * sampled at ~200 peaks per second for smooth rendering.
   */
  computeStemPeaks(peaksPerSecond = 200): Record<string, Float32Array> {
    const result: Record<string, Float32Array> = {};
    for (const [name, slot] of this.stems.entries()) {
      const buf = slot.player.buffer;
      if (!buf) continue;
      const audioBuffer = buf.get();
      if (!audioBuffer) continue;

      const totalPeaks = Math.ceil(audioBuffer.duration * peaksPerSecond);
      const samplesPerPeak = Math.floor(audioBuffer.length / totalPeaks);
      const peaks = new Float32Array(totalPeaks);
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.numberOfChannels >= 2 ? audioBuffer.getChannelData(1) : left;

      for (let i = 0; i < totalPeaks; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, audioBuffer.length);
        let maxAbs = 0;
        for (let s = start; s < end; s++) {
          const v = Math.abs(left[s]) + Math.abs(right[s]);
          if (v > maxAbs) maxAbs = v;
        }
        // Normalize: sum of abs(L)+abs(R), max is 2.0
        peaks[i] = Math.min(1, maxAbs * 0.5);
      }
      result[name] = peaks;
    }
    return result;
  }

  /** Enable stem output (unmute the bus). */
  enable(): void {
    if (!this._loaded) return;
    this._muted = false;
    const ctx = Tone.getContext().rawContext as AudioContext;
    const now = ctx.currentTime;
    this.stemBus.gain.cancelScheduledValues(now);
    this.stemBus.gain.setValueAtTime(this.stemBus.gain.value, now);
    this.stemBus.gain.linearRampToValueAtTime(1, now + 0.05); // 50ms fade-in
  }

  /** Disable stem output (mute the bus). */
  disable(): void {
    this._muted = true;
    const ctx = Tone.getContext().rawContext as AudioContext;
    const now = ctx.currentTime;
    this.stemBus.gain.cancelScheduledValues(now);
    this.stemBus.gain.setValueAtTime(this.stemBus.gain.value, now);
    this.stemBus.gain.linearRampToValueAtTime(0, now + 0.05); // 50ms fade-out
  }

  isMuted(): boolean { return this._muted; }
  isLoaded(): boolean { return this._loaded; }
  getDuration(): number { return this._duration; }
  getStemNames(): string[] { return [...this.stems.keys()]; }

  /**
   * Start all stem players at the exact same scheduled time for sample-accurate sync.
   */
  play(offset?: number): void {
    if (!this._loaded) return;
    const startOffset = offset ?? this._pendingOffset ?? 0;
    // Schedule ALL stems with one shared future time for sample-accurate sync
    const when = Tone.now() + 0.02; // 20ms lookahead

    for (const { player } of this.stems.values()) {
      if (player.buffer.loaded) {
        player.start(when, startOffset);
      }
    }

    this._rateChangePos = startOffset;
    this._rateChangeTime = when;
    this._rateTrackingActive = true;
    this._pendingOffset = null;
  }

  pause(): void {
    if (!this._loaded) return;
    this._pendingOffset = this.getPosition();
    for (const { player } of this.stems.values()) {
      if (player.state === 'started') {
        player.fadeOut = 0.01;
        player.stop();
      }
    }
    this._rateTrackingActive = false;
  }

  stop(): void {
    for (const { player } of this.stems.values()) {
      if (player.state === 'started') {
        player.fadeOut = 0.01;
        player.stop();
      }
    }
    this._pendingOffset = null;
    this._rateTrackingActive = false;
  }

  /**
   * Seek all stems to a new position.
   * If playing, stops and restarts all stems at the new offset with shared timing.
   */
  seek(seconds: number): void {
    if (!this._loaded) return;
    const clamped = Math.max(0, Math.min(seconds, this._duration));
    const wasPlaying = this.isPlaying();

    this._rateChangePos = clamped;
    this._rateChangeTime = Tone.now();
    this._rateTrackingActive = wasPlaying;

    if (wasPlaying) {
      // Force-stop all active sources immediately (no fade)
      for (const { player } of this.stems.values()) {
        forceStopPlayer(player);
      }
      // Restart all with shared timing
      const when = Tone.now() + 0.02;
      for (const { player } of this.stems.values()) {
        if (player.buffer.loaded) {
          player.start(when, clamped);
        }
      }
      this._rateChangeTime = when;
    } else {
      this._pendingOffset = clamped;
    }
  }

  /**
   * Set playback rate on all stems simultaneously.
   * Checkpoints position before applying (same pattern as DeckAudioPlayer).
   */
  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0, Math.min(4, rate));

    if (this._loaded && this.isPlaying()) {
      // Checkpoint position
      const now = Tone.now();
      if (this._rateTrackingActive) {
        this._rateChangePos += (now - this._rateChangeTime) * this._playbackRate;
        if (this._duration > 0) {
          this._rateChangePos = this._rateChangePos % this._duration;
        }
      }
      this._rateChangeTime = now;
    }
    this._playbackRate = clamped;

    // Apply rate to all stem players' active sources
    const ctx = Tone.getContext().rawContext as AudioContext;
    const now = ctx.currentTime;
    for (const { player } of this.stems.values()) {
      (player as any)._playbackRate = clamped;
      const activeSources: Set<any> = (player as any)._activeSources;
      if (activeSources) {
        // Keep only newest source per stem (prevent zombie accumulation)
        if (activeSources.size > 1) {
          const sources = Array.from(activeSources);
          const newest = sources[sources.length - 1];
          for (let i = 0; i < sources.length - 1; i++) {
            try { sources[i].stop(now); activeSources.delete(sources[i]); } catch { /* */ }
          }
          try { newest.playbackRate.setValueAtTime(clamped, now); } catch { /* */ }
        } else {
          activeSources.forEach((source: any) => {
            try { source.playbackRate.setValueAtTime(clamped, now); } catch { /* */ }
          });
        }
      }
    }
  }

  getPlaybackRate(): number { return this._playbackRate; }

  /** Get current position using rate-change checkpoint tracking. */
  getPosition(): number {
    if (!this._loaded) return 0;
    if (this._pendingOffset !== null) return this._pendingOffset;

    if (this._rateTrackingActive && this.isPlaying()) {
      const now = Tone.now();
      const elapsed = (now - this._rateChangeTime) * this._playbackRate;
      const raw = this._rateChangePos + elapsed;
      return this._duration > 0 ? ((raw % this._duration) + this._duration) % this._duration : 0;
    }

    return this._pendingOffset ?? 0;
  }

  isPlaying(): boolean {
    for (const { player } of this.stems.values()) {
      if (player.state === 'started') return true;
    }
    return false;
  }

  // ==========================================================================
  // PER-STEM CONTROL
  // ==========================================================================

  setStemMute(stemName: string, muted: boolean): void {
    const slot = this.stems.get(stemName);
    if (!slot) return;
    slot.muted = muted;
    const target = muted ? 0 : slot.volume;
    const ctx = Tone.getContext().rawContext as AudioContext;
    const now = ctx.currentTime;
    slot.gain.gain.cancelScheduledValues(now);
    slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
    slot.gain.gain.linearRampToValueAtTime(target, now + 0.003); // 3ms anti-click
  }

  isStemMuted(stemName: string): boolean {
    return this.stems.get(stemName)?.muted ?? false;
  }

  setStemVolume(stemName: string, volume: number): void {
    const slot = this.stems.get(stemName);
    if (!slot) return;
    slot.volume = Math.max(0, Math.min(1, volume));
    if (!slot.muted) {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const now = ctx.currentTime;
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
      slot.gain.gain.linearRampToValueAtTime(slot.volume, now + 0.015); // 15ms ramp
    }
  }

  getStemVolume(stemName: string): number {
    return this.stems.get(stemName)?.volume ?? 1;
  }

  /** Get the native GainNode for a stem (for future dub bus tap points). */
  getStemGainNode(stemName: string): GainNode | null {
    return this.stems.get(stemName)?.gain ?? null;
  }

  // ==========================================================================
  // LOOP (time-based, mirrors DeckAudioPlayer loop)
  // ==========================================================================

  setLoopRegion(loopIn: number | null, loopOut: number | null): void {
    for (const { player } of this.stems.values()) {
      if (loopIn !== null && loopOut !== null && loopOut > loopIn) {
        player.loop = true;
        player.loopStart = loopIn;
        player.loopEnd = loopOut;
      } else {
        // Restore whole-track loop
        player.loop = true;
        player.loopStart = 0;
        player.loopEnd = 0;
      }
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  private disposeStems(): void {
    for (const { player, gain } of this.stems.values()) {
      try { player.stop(); } catch { /* */ }
      player.disconnect();
      player.dispose();
      gain.disconnect();
    }
    this.stems.clear();
    this._loaded = false;
    this._duration = 0;
    this._pendingOffset = null;
    this._rateTrackingActive = false;
  }

  dispose(): void {
    this.disposeStems();
    this.stemBus.disconnect();
  }
}

// ==========================================================================
// HELPERS
// ==========================================================================

/** Extract the native Web Audio node from a Tone.js wrapper. */
function getNativeNode(toneNode: Tone.ToneAudioNode | Record<string, unknown>): AudioNode | null {
  const n = toneNode as any;
  if (n._gainNode) return n._gainNode;
  if (n.input && n.input instanceof AudioNode) return n.input;
  if (n._volume?._gain?._gainNode) return n._volume._gain._gainNode;
  if (n instanceof AudioNode) return n;
  return null;
}

/** Force-stop a Tone.Player by killing all active sources immediately. */
function forceStopPlayer(player: Tone.Player): void {
  const activeSources = (player as any)._activeSources as Set<any> | undefined;
  if (!activeSources) return;
  const ctx = Tone.getContext().rawContext as AudioContext;
  const now = ctx.currentTime;
  for (const s of activeSources) {
    try {
      if (typeof s.cancelStop === 'function') s.cancelStop();
      if (s.gainNode?.gain) {
        s.gainNode.gain.cancelScheduledValues(now);
        s.gainNode.gain.setValueAtTime(0, now);
      }
      s.stop(now);
    } catch { /* already disposed */ }
  }
  activeSources.clear();
  try { (player as any)._state.setStateAtTime('stopped', now); } catch { /* */ }
}
