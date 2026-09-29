/**
 * Channels chosen by the classifier, for settings a preset cannot give as
 * channel numbers: the "Drums (auto)" sidechain key, and effects aimed at a
 * channel role (EffectConfig.channelRole).
 *
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

/** The channel classifier's reading of the loaded song, or null with no song. */
async function classifyLoadedSong(): Promise<ReadonlyArray<{ role: ChannelRole; subrole?: ChannelSubrole }> | null> {
  const [{ useTrackerStore }, { useInstrumentStore }, { classifySongChannels }] = await Promise.all([
    import('@stores/useTrackerStore'),
    import('@stores/useInstrumentStore'),
    import('@/bridge/analysis/ChannelNaming'),
  ]);
  const patterns = useTrackerStore.getState().patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  const lookup = new Map(useInstrumentStore.getState().instruments.map((i) => [i.id, i]));
  return classifySongChannels(patterns, lookup, useTrackerStore.getState().patternOrder);
}

/** The loaded song's drum channel for SIDECHAIN_KEY_DRUMS, or -1. */
export async function resolveDrumKeyChannel(): Promise<number> {
  const analyses = await classifyLoadedSong();
  return analyses ? pickDrumKeyChannel(analyses) : -1;
}

/** Every channel the classifier does not call percussion. */
export function pickNonDrumChannels(analyses: ReadonlyArray<{ role: ChannelRole }>): number[] {
  return analyses.flatMap((a, i) => (a.role === 'percussion' ? [] : [i]));
}

/** Whether an effect is aimed at some channels rather than the whole mix. */
export function targetsChannels(fx: { selectedChannels?: number[]; channelRole?: string }): boolean {
  return fx.channelRole !== undefined || (Array.isArray(fx.selectedChannels) && fx.selectedChannels.length > 0);
}

/**
 * The channels an effect processes: its channelRole resolved against the
 * loaded song, else its selectedChannels.
 */
export async function channelRoleTargets(fx: { selectedChannels?: number[]; channelRole?: 'nonDrums' }): Promise<number[]> {
  if (fx.channelRole === 'nonDrums') {
    const analyses = await classifyLoadedSong();
    return analyses ? pickNonDrumChannels(analyses) : [];
  }
  return fx.selectedChannels ?? [];
}
