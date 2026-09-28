/**
 * CED Channel Accumulator — live audio → CED classification for song-level
 * replayer channels (any engine that streams its voices through
 * useOscilloscopeStore into ChannelAudioTap).
 *
 * CED needs about 0.68 s of one channel's audio. It reads that many unbroken
 * samples from ChannelAudioTap and fires the CED worker, at most once per
 * cooldown per channel. Downsampled to 16kHz before inference to match
 * CedFeatureExtractor.
 *
 * It used to fill a ring of its own from each AutoDub tick's display
 * snapshot: 128-256 samples every 250 ms, glued into one 0.68 s window that
 * took about 32 s to fill and was never audio the channel had played.
 *
 * Results land in useChannelTypeStore keyed by channel index.
 */

import { resampleTo16k } from './CedMelSpectrogram';
import { latestChannelAudio, CHANNEL_AUDIO_RING } from './ChannelAudioTap';
import { useChannelTypeStore } from '@stores/useChannelTypeStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCUM_SAMPLES  = CHANNEL_AUDIO_RING;  // 0.68s @ 48kHz
const COOLDOWN_MS    = 15000;  // minimum ms between re-classifications per channel
/**
 * Minimum ms between any two classifications. Every channel came out of its
 * cooldown on the same tick, so all of them were classified at once: seven
 * ~0.5 s inferences back to back every 15 s, which pinned the audio thread
 * for 1-2 s and was heard as dropouts (2026-09-28, measured by sampling the
 * AudioWorklet thread against the worker's classify requests). One at a time
 * spreads them across the cycle.
 */
const SPACING_MS     = 2000;
const MAX_CHANNELS   = 32;

// ── Singleton ─────────────────────────────────────────────────────────────────

class CedChannelAccumulator {
  private lastFiredMs: number[] = [];
  private lastAnyMs = 0;
  private next = 0;

  /**
   * Classify the next channel, round-robin, that has a full window of
   * unbroken audio and is out of its cooldown — at most one per SPACING_MS.
   * Called on every AutoDub tick.
   */
  feed(channelCount: number, now = Date.now()): void {
    if (now - this.lastAnyMs < SPACING_MS) return;
    const n = Math.min(channelCount, MAX_CHANNELS);
    for (let i = 0; i < n; i++) {
      const ch = (this.next + i) % n;
      if (now - (this.lastFiredMs[ch] ?? 0) < COOLDOWN_MS) continue;
      const audio = latestChannelAudio(ch, ACCUM_SAMPLES);
      if (!audio) continue;
      this.lastFiredMs[ch] = now;
      this.lastAnyMs = now;
      this.next = (ch + 1) % n;
      this.fireChannel(ch, audio.samples, audio.sampleRate);
      return;
    }
  }

  private fireChannel(channel: number, pcm: Float32Array, sampleRate: number): void {
    // Downsample to 16kHz for CED, then send to worker
    const pcm16k = resampleTo16k(pcm, sampleRate);
    useChannelTypeStore.getState().classifyChannelAudio(channel, pcm16k);
  }

  reset(): void {
    this.lastFiredMs = [];
    this.lastAnyMs = 0;
    this.next = 0;
  }
}

export const cedChannelAccumulator = new CedChannelAccumulator();
