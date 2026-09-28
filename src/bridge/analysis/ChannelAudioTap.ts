/**
 * ChannelAudioTap — each song channel's recent audio, contiguous.
 *
 * Engines stream every sample they render per voice (worklets/
 * channel-stream.js), each chunk stamped with the running sample index of its
 * first sample. This keeps the last RING_SIZE samples per channel and knows
 * how many of them are one unbroken stretch: a chunk that does not start where
 * the previous one ended (new song, seek, dropped message) restarts that
 * channel. Analysis asks for the last n contiguous samples and gets none
 * rather than a join.
 *
 * The runtime channel classifiers used to glue display snapshots, taken tens
 * or hundreds of milliseconds apart, into one window. The joins read as
 * clicks, and every channel of a Hippel song classified as percussion.
 */

/** 0.68 s at 48 kHz: the window CED needs; the spectral classifier needs 2048. */
export const CHANNEL_AUDIO_RING = 32768;

interface Ring {
  buf: Float32Array;
  write: number;       // next write index
  contiguous: number;  // unbroken samples ending at `write`, capped at the ring size
  next: number;        // frame expected next, -1 before the first chunk
  sampleRate: number;
}

const rings: Ring[] = [];

function ring(ch: number): Ring {
  let r = rings[ch];
  if (!r) {
    r = { buf: new Float32Array(CHANNEL_AUDIO_RING), write: 0, contiguous: 0, next: -1, sampleRate: 48000 };
    rings[ch] = r;
  }
  return r;
}

/** Append one chunk per channel, all starting at `frame`. */
export function pushChannelAudio(
  channels: readonly (Int16Array | null)[],
  frame: number,
  sampleRate: number,
): void {
  for (let ch = 0; ch < channels.length; ch++) {
    const src = channels[ch];
    if (!src || src.length === 0) continue;
    const r = ring(ch);
    if (frame !== r.next || sampleRate !== r.sampleRate) r.contiguous = 0;
    r.sampleRate = sampleRate;
    for (let i = 0; i < src.length; i++) {
      r.buf[r.write] = src[i] / 32768;
      r.write = (r.write + 1) % CHANNEL_AUDIO_RING;
    }
    r.contiguous = Math.min(CHANNEL_AUDIO_RING, r.contiguous + src.length);
    r.next = frame + src.length;
  }
}

/**
 * The last `n` unbroken samples of a channel, oldest first, or null. `end`
 * is the frame just past the last sample, so a caller can tell a new window
 * from one it has already seen.
 */
export function latestChannelAudio(ch: number, n: number): { samples: Float32Array; sampleRate: number; end: number } | null {
  const r = rings[ch];
  if (!r || n > r.contiguous) return null;
  const out = new Float32Array(n);
  const start = (r.write - n + CHANNEL_AUDIO_RING) % CHANNEL_AUDIO_RING;
  for (let i = 0; i < n; i++) out[i] = r.buf[(start + i) % CHANNEL_AUDIO_RING];
  return { samples: out, sampleRate: r.sampleRate, end: r.next };
}

/** Unbroken samples each channel holds, and at what rate, for diagnostics. */
export function channelAudioContiguity(channelCount: number): Array<{ contiguous: number; sampleRate: number } | null> {
  return Array.from({ length: channelCount }, (_, ch) => {
    const r = rings[ch];
    return r ? { contiguous: r.contiguous, sampleRate: r.sampleRate } : null;
  });
}

/** Forget every channel (song change, stop). */
export function resetChannelAudioTap(): void {
  rings.length = 0;
}
