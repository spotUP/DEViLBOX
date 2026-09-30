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
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useDubStore } from '@/stores/useDubStore';
import { DUB_CHARACTER_PRESETS } from '@/types/dub';
import { classifySongRoles } from '@/bridge/analysis/ChannelNaming';
import type { InstrumentConfig } from '@/types/instrument/defaults';

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

/** Flat starting send when there is no persona preset to take roles from. */
export const AUTO_DUB_FLAT_SEND = 0.15;

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
    try {
      const lookup = new Map<number, InstrumentConfig>();
      for (const inst of useInstrumentStore.getState().instruments) if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
      if (tracker.patterns.length > 0) roles = classifySongRoles(tracker.patterns, lookup, tracker.patternOrder);
    } catch { /* flat sends */ }
  }

  for (let i = 0; i < count; i++) {
    if ((channels[i]?.dubSend ?? 0) > 0) continue; // the user's own send
    if (preset?.defaultSendsByRole && roles.length > 0) {
      const sends = preset.defaultSendsByRole;
      const role = roles[i];
      const level = role && role in sends ? (sends[role as keyof typeof sends] as number) : (sends.default ?? AUTO_DUB_FLAT_SEND);
      setChannelDubSend(i, autoDubSeedSendLevel(level));
    } else {
      setChannelDubSend(i, AUTO_DUB_FLAT_SEND);
    }
  }
}
