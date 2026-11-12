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
 * import and by the instrument editor). An instrument that names none plays on
 * the first chip channel of its voice kind when the chip has kinds (a Neo Geo
 * SSG instrument on the first SSG channel, not on FM channel 0, where its
 * note-on made no sound: owner report 2026-11-12), else on the chip's first
 * channel.
 */
import { isOpnbChipType, opnbFirstChannel } from './opnbVoices';

export const LIVE_VOICE_BASE_CHANNEL = 100;

/** The fields of a FurnaceConfig that decide where a live note plays. */
export interface LiveChannelSource {
  previewChannel?: number;
  chipType?: number;
  divInsType?: number;
}

/**
 * The chip channel a live note of this instrument plays on, or undefined when
 * the instrument names none and its chip has no voice kinds.
 */
export function livePreviewChannel(furnace: LiveChannelSource | undefined): number | undefined {
  if (!furnace) return undefined;
  if (typeof furnace.previewChannel === 'number') return furnace.previewChannel;
  if (furnace.divInsType !== undefined && furnace.chipType !== undefined && isOpnbChipType(furnace.chipType)) {
    return opnbFirstChannel(furnace.chipType, furnace.divInsType);
  }
  return undefined;
}

export function chipChannelFor(channelIndex: number, chipChannels: number, furnace?: LiveChannelSource): number {
  const count = Math.max(1, chipChannels);
  if (channelIndex >= LIVE_VOICE_BASE_CHANNEL) {
    const preview = livePreviewChannel(furnace) ?? 0;
    return preview >= 0 && preview < count ? preview : 0;
  }
  return channelIndex % count;
}

/**
 * Which chip channels to mute for a song's channel mutes.
 *
 * Tracker channels map onto the chip with chipChannelFor (channel % count), so
 * one chip channel can carry several song channels (an 8-channel song on a
 * 4-channel Game Boy puts song channels 0 and 4 on chip channel 0). A chip
 * channel is muted only when every song channel that maps onto it is muted;
 * a chip channel no song channel maps onto stays open (live notes play there).
 */
export function chipChannelMutes(songChannelMutes: readonly boolean[], chipChannels: number): boolean[] {
  const count = Math.max(1, chipChannels);
  const fed = new Array<boolean>(count).fill(false);
  const open = new Array<boolean>(count).fill(false);
  songChannelMutes.forEach((muted, ch) => {
    if (ch >= LIVE_VOICE_BASE_CHANNEL) return;
    const c = chipChannelFor(ch, count);
    fed[c] = true;
    if (!muted) open[c] = true;
  });
  return fed.map((isFed, c) => isFed && !open[c]);
}
