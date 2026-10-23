/**
 * Start a freshly opened song, optionally from a time offset (Selecta share links, `t=` in ms).
 *
 * The seek lands BEFORE transport.play(): the replayer starts from its song position, so the first
 * audible row is the target row and position 0 is never heard. Engines that only exist once playing
 * (C64 SID on JSIDPlay2) cannot seek yet; `seeked` is false for them and the caller seeks after the start.
 */
import { useTransportStore } from '@/stores/useTransportStore';

export async function startPlayback(start: 'song' | 'pattern', startAtMs?: number): Promise<{ seeked: boolean }> {
  let seeked = false;
  if (startAtMs !== undefined) {
    const { seekPlaybackToMs } = await import('@/engine/replayer/seekPlaybackToMs');
    seeked = seekPlaybackToMs(startAtMs);
  }
  // The MCP play handler's rule: song mode does not loop, pattern mode does.
  const transport = useTransportStore.getState();
  transport.setIsLooping(start === 'pattern');
  await transport.play();
  return { seeked };
}
