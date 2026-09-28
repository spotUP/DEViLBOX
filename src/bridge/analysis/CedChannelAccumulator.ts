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
const MAX_CHANNELS   = 32;

// ── Singleton ─────────────────────────────────────────────────────────────────

class CedChannelAccumulator {
  private lastFiredMs: number[] = [];

  /**
   * Classify every channel that has a full window of unbroken audio and is
   * out of its cooldown. Called on every AutoDub tick.
   */
  feed(channelCount: number, now = Date.now()): void {
    const n = Math.min(channelCount, MAX_CHANNELS);
    for (let ch = 0; ch < n; ch++) {
      if (now - (this.lastFiredMs[ch] ?? 0) < COOLDOWN_MS) continue;
      const audio = latestChannelAudio(ch, ACCUM_SAMPLES);
      if (!audio) continue;
      this.lastFiredMs[ch] = now;
      this.fireChannel(ch, audio.samples, audio.sampleRate);
    }
  }

  private fireChannel(channel: number, pcm: Float32Array, sampleRate: number): void {
    // Downsample to 16kHz for CED, then send to worker
    const pcm16k = resampleTo16k(pcm, sampleRate);
    useChannelTypeStore.getState().classifyChannelAudio(channel, pcm16k);
  }

  reset(): void {
    this.lastFiredMs = [];
  }
}

export const cedChannelAccumulator = new CedChannelAccumulator();
