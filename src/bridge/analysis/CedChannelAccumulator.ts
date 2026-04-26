/**
 * CED Channel Accumulator — live audio → CED classification for song-level
 * replayer channels (UADE, and any engine that feeds useOscilloscopeStore).
 *
 * The existing ChannelAudioClassifier ring buffer is only 2048 samples (~43ms)
 * — far too short for CED inference. This accumulator maintains a larger per-
 * channel ring (32768 samples ≈ 0.68s @ 48kHz) and fires the CED worker once
 * it fills. Downsampled to 16kHz before inference to match CedFeatureExtractor.
 *
 * Results land in useChannelTypeStore keyed by channel index.
 */

import { resampleTo16k } from './CedMelSpectrogram';
import { useChannelTypeStore } from '@stores/useChannelTypeStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCUM_SAMPLES  = 32768;  // 0.68s @ 48kHz before firing CED
const COOLDOWN_MS    = 15000;  // minimum ms between re-classifications per channel
const ASSUMED_RATE   = 48000;  // oscilloscope tap sample rate
const MAX_CHANNELS   = 32;

// ── Singleton ─────────────────────────────────────────────────────────────────

class CedChannelAccumulator {
  private rings: Float32Array[]  = [];
  private written: number[]      = [];
  private lastFiredMs: number[]  = [];

  private ensureChannels(n: number): void {
    while (this.rings.length < n) {
      this.rings.push(new Float32Array(ACCUM_SAMPLES));
      this.written.push(0);
      this.lastFiredMs.push(0);
    }
  }

  /**
   * Feed oscilloscope tap data into per-channel accumulators.
   * Called on every AutoDub tick from updateRuntimeClassifierFromOscilloscope.
   */
  feed(channelData: readonly (Int16Array | null)[], now = Date.now()): void {
    const n = Math.min(channelData.length, MAX_CHANNELS);
    this.ensureChannels(n);

    for (let ch = 0; ch < n; ch++) {
      const src = channelData[ch];
      if (!src || src.length === 0) continue;

      const ring = this.rings[ch];
      let w = this.written[ch];

      for (let i = 0; i < src.length; i++) {
        ring[w % ACCUM_SAMPLES] = src[i] / 32768;
        w++;
      }
      this.written[ch] = w;

      if (w >= ACCUM_SAMPLES && now - this.lastFiredMs[ch] >= COOLDOWN_MS) {
        this.lastFiredMs[ch] = now;
        this.written[ch] = 0;
        // Copy ring into a linear buffer (ring may have wrapped)
        const pcm = new Float32Array(ACCUM_SAMPLES);
        const start = w % ACCUM_SAMPLES;
        for (let i = 0; i < ACCUM_SAMPLES; i++) {
          pcm[i] = ring[(start + i) % ACCUM_SAMPLES];
        }
        this.fireChannel(ch, pcm);
      }
    }
  }

  private fireChannel(channel: number, pcm: Float32Array): void {
    // Downsample to 16kHz for CED, then send to worker
    const pcm16k = resampleTo16k(pcm, ASSUMED_RATE);
    useChannelTypeStore.getState().classifyChannelAudio(channel, pcm16k);
  }

  reset(): void {
    this.rings      = [];
    this.written    = [];
    this.lastFiredMs = [];
  }
}

export const cedChannelAccumulator = new CedChannelAccumulator();
