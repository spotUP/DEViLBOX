/**
 * One answer to "what is this channel called".
 *
 * DEViLBOX holds two competing names per channel. The TRACKER store names them
 * from the pattern data — `autoNameChannels` writes `Kick`, `Bass 1`, `Chords`
 * — and the MIXER store keeps its own, which stay at the placeholder `CH 1`
 * … `CH 16` unless a user renames them by hand.
 *
 * Measured 2026-09-22 on amanda.ahx: `get_channel_roles` reported
 * `Bass 1, Kick, Chords, Bass 2` while `get_mixer_state` reported
 * `CH 1, CH 2, CH 3, CH 4`. Anything reading the mixer therefore showed
 * placeholders — the Dub Deck's channel strips, and worse, `versionDrop`, which
 * passes those names into `buildMusicalChannelProfile` as the instrument-name
 * evidence. The profile was being told every channel is called "CH 1".
 *
 * This resolves the two in one place: a real mixer name wins, because a user
 * typed it; otherwise the tracker's name; otherwise the placeholder.
 */

import { isGenericChannelName } from '@/bridge/analysis/ChannelNaming';

/**
 * Pick the most meaningful name available for one channel.
 *
 * `mixerName` is authoritative when it is not a placeholder, since only a user
 * sets it. `trackerName` is the classifier's proposal and is used whenever the
 * mixer has nothing real to say.
 */
export function resolveChannelName(
  mixerName: string | null | undefined,
  trackerName: string | null | undefined,
  channelIndex: number,
): string {
  if (mixerName && !isGenericChannelName(mixerName)) return mixerName;
  if (trackerName && !isGenericChannelName(trackerName)) return trackerName;
  return mixerName || trackerName || `CH ${channelIndex + 1}`;
}

/**
 * Resolve names for every channel.
 *
 * Length follows `mixerNames`, which is the mixer's fixed channel count; a song
 * with fewer channels simply leaves the tail on placeholders.
 */
export function resolveChannelNames(
  mixerNames: readonly (string | null | undefined)[],
  trackerNames: readonly (string | null | undefined)[],
): string[] {
  return mixerNames.map((m, i) => resolveChannelName(m, trackerNames[i], i));
}
