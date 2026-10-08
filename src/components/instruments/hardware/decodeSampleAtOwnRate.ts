/**
 * Decode an instrument's sample for a hardware sample editor at the sample's OWN rate.
 *
 * The instrument stores a loop in frames of the sample at `sample.sampleRate` (8363 for a MOD), and
 * the song players (the Tone Player's loopSeconds, libopenmpt's osl_set_sample_loop) read it as that.
 * The editors edit the decoded frames, so the decode must not resample: decoding at a fixed 44100 Hz
 * made a loop pin dragged on the editor's frames land 5.3 times too far in the stored unit for a MOD,
 * past the end of the sample, where a loop is empty and the note went silent (UI4c).
 */
import type { SampleConfig } from '@typedefs/instrument';

/** The rate the editor's frames are in: the sample's own, or the platform default when it names none. */
export function editorDecodeRate(sample: SampleConfig | undefined): number {
  const rate = sample?.sampleRate;
  // OfflineAudioContext accepts 3000..768000 Hz
  return rate && rate >= 3000 && rate <= 768000 ? Math.round(rate) : 44100;
}

export async function decodeSampleAtOwnRate(sample: SampleConfig | undefined): Promise<AudioBuffer | null> {
  if (!sample) return null;
  try {
    const ctx = new OfflineAudioContext(1, 1, editorDecodeRate(sample));
    if (sample.audioBuffer && sample.audioBuffer.byteLength > 0) {
      return await ctx.decodeAudioData(sample.audioBuffer.slice(0));
    }
    if (sample.url) {
      const resp = await fetch(sample.url);
      return await ctx.decodeAudioData(await resp.arrayBuffer());
    }
  } catch {
    return null;
  }
  return null;
}
