/**
 * "Drums (auto)" sidechain key.
 *
 * `sidechainSource` names a channel index, and the kick sits on a different
 * channel in every song - so a preset could not say "key on the kick". The
 * value SIDECHAIN_KEY_DRUMS asks for the song's drum channel instead, found
 * from the channel classifier (ChannelNaming.classifySongChannels) when the
 * chain is wired, and found again when a new song loads.
 */
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import type { ChannelSubrole } from '@/bridge/analysis/ChannelNaming';

/** sidechainSource value: key on the song's drums, chosen by the classifier. */
export const SIDECHAIN_KEY_DRUMS = -2;

/**
 * The channel to key on: the kick if one is classified, else a whole-kit
 * channel, else any percussion channel; -1 when the song has no drums.
 */
export function pickDrumKeyChannel(
  analyses: ReadonlyArray<{ role: ChannelRole; subrole?: ChannelSubrole }>,
): number {
  const pick = (test: (a: { role: ChannelRole; subrole?: ChannelSubrole }) => boolean) =>
    analyses.findIndex((a) => a.role === 'percussion' && test(a));
  for (const idx of [
    pick((a) => a.subrole === 'kick'),
    pick((a) => a.subrole === 'mixed'),
    pick(() => true),
  ]) {
    if (idx >= 0) return idx;
  }
  return -1;
}

/** The loaded song's drum channel for SIDECHAIN_KEY_DRUMS, or -1. */
export async function resolveDrumKeyChannel(): Promise<number> {
  const [{ useTrackerStore }, { useInstrumentStore }, { classifySongChannels }] = await Promise.all([
    import('@stores/useTrackerStore'),
    import('@stores/useInstrumentStore'),
    import('@/bridge/analysis/ChannelNaming'),
  ]);
  const patterns = useTrackerStore.getState().patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) return -1;
  const lookup = new Map(useInstrumentStore.getState().instruments.map((i) => [i.id, i]));
  return pickDrumKeyChannel(classifySongChannels(patterns, lookup));
}
