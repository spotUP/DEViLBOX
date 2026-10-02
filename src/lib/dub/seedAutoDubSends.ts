/**
 * Auto Dub's starting channel sends - the material the performer works with.
 *
 * Every Auto Dub start seeds the sends of the loaded pattern's channels that
 * are still closed (a send the user set is never overwritten): by channel role
 * from the persona's character preset, or a flat level without one.
 *
 * This lived in the Auto Dub panel's toggle, so only a click in the panel
 * seeded anything: after a reload Auto Dub resumed with every send at 0 and
 * the bus got nothing but the performer's brief rides. With the bus on
 * 'custom' it also ignored the persona and used a flat 0.15 (-16.5 dB), and
 * role levels were halved and capped at 0.45 - measured 2026-09-30, the bus
 * input sat 14-36 dB under the mix and the owner "still hear[d] almost none of
 * the dub moves and dub bus stuff".
 */
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useDubStore } from '@/stores/useDubStore';
import { DUB_CHARACTER_PRESETS } from '@/types/dub';
import { readSongChannelIdentity } from '@/engine/dub/songChannelIdentity';
import { sendIsAudible } from '@/lib/dub/sendAudibility';
import { FLAT_SEED_SEND } from '@/lib/dub/seedSendOnEnable';

/** Only the loaded pattern's channels: a 4-channel MOD has 16 mixer slots, and seeding the empty 12 is noise. */
export function autoDubSeedChannelCount(patternChannelCount: number | undefined, mixerChannelCount: number): number {
  const fromPattern = typeof patternChannelCount === 'number' && patternChannelCount > 0 ? patternChannelCount : mixerChannelCount;
  return Math.max(0, Math.min(fromPattern, mixerChannelCount, 16));
}

/**
 * A role's send level as Auto Dub's starting point: a fifth, between 0.1 and
 * 0.2. Low on purpose - the moves OPEN sends, and a move is heard only against
 * a quiet return. Measured 2026-09-30 with tools/dub-move-audit.ts on the
 * owner's song: with every send at ~0.43 a channel throw raised the return
 * peak +2 dB and 15 of 39 moves read SILENT; at 0.15 the throws rose
 * +8 to +18 dB (channelThrow +15.7, reverseEcho +18.5) and 12 of those 16
 * came through.
 */
export function autoDubSeedSendLevel(level: number): number {
  const clamped = Math.max(0, Math.min(1, level));
  return Math.max(0.1, Math.min(clamped * 0.2, 0.2));
}


/** Seed the closed channel sends of the loaded song for Auto Dub. */
export function seedAutoDubSends(): void {
  const { channels, setChannelDubSend } = useMixerStore.getState();
  const tracker = useTrackerStore.getState();
  const patternChannelCount = tracker.patterns[tracker.currentPatternIndex]?.channels.length;
  const count = autoDubSeedChannelCount(patternChannelCount, channels.length);

  // The bus's character preset, or - on 'custom' - the persona Auto Dub plays.
  const busPreset = useDrumPadStore.getState().dubBus.characterPreset;
  const key = busPreset && busPreset !== 'custom' ? busPreset : useDubStore.getState().autoDubPersona;
  const preset = DUB_CHARACTER_PRESETS[key as keyof typeof DUB_CHARACTER_PRESETS] ?? null;

  let roles: string[] = [];
  if (preset?.defaultSendsByRole) {
    // The one channel identity the deck labels its strips from.
    try { roles = readSongChannelIdentity().roles; } catch { /* flat sends */ }
  }

  for (let i = 0; i < count; i++) {
    // The user's own send. The BLEED floor is not one: counting it left a
    // bleeding channel at -36 dB instead of its starting send.
    if (sendIsAudible(channels[i]?.dubSend)) continue;
    if (preset?.defaultSendsByRole && roles.length > 0) {
      const sends = preset.defaultSendsByRole;
      const role = roles[i];
      const level = role && role in sends ? (sends[role as keyof typeof sends] as number) : (sends.default ?? FLAT_SEED_SEND);
      setChannelDubSend(i, autoDubSeedSendLevel(level));
    } else {
      setChannelDubSend(i, FLAT_SEED_SEND);
    }
  }
}
