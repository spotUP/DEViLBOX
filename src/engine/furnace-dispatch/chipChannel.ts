/**
 * Which channel of a chip a note plays on.
 *
 * The engine names a note's channel with one number: a tracker channel (0-99)
 * or a live voice slot (100 and up) that the keyboard / MIDI voice allocator
 * hands out. A tracker channel maps onto the chip's channels (channel % count).
 * A live voice slot does not name a chip channel at all: it is the allocator's
 * bookkeeping, and which slot a key gets depends on how fast it is pressed (a
 * slot is freed 100 ms after its key-up, so quick repeats walk through 115,
 * 114, 113...). Mapping the slot onto the chip sent repeated presses of one key
 * to different chip channels - on the NES pulse, DPCM, noise and the triangle
 * (an octave down), on the Game Boy noise and the wave channel - so the same key
 * sounded "sometimes lower, sometimes higher" (owner report 2026-10-15).
 *
 * A live note plays on the instrument's preview channel instead: the channel
 * Furnace previews the instrument on (FurnaceConfig.previewChannel, set on
 * import), or the chip's first channel when the instrument names none.
 */
export const LIVE_VOICE_BASE_CHANNEL = 100;

export function chipChannelFor(channelIndex: number, chipChannels: number, previewChannel?: number): number {
  const count = Math.max(1, chipChannels);
  if (channelIndex >= LIVE_VOICE_BASE_CHANNEL) {
    const preview = previewChannel ?? 0;
    return preview >= 0 && preview < count ? preview : 0;
  }
  return channelIndex % count;
}
