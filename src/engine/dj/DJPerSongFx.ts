/**
 * DJPerSongFx — applies the per-song master FX override for a playlist track.
 *
 * Resolves the stored `track.masterFxPreset` first against the full master
 * FX library (`@/constants/fxPresets` — current scheme; the value is the
 * preset's `name`), then falls back to the legacy `DJ_FX_PRESETS` key format
 * used by playlists saved before the master FX library was wired in.
 *
 * ── Why the clear-on-unset branch matters ────────────────────────────────
 * Without it, the sequence
 *   1. Load track A with per-song preset X  → master chain = X
 *   2. Play track B with no per-song preset → chain STAYS X (phantom FX)
 * would leak X across every subsequent track forever, which the user
 * experiences as "some FX is active when I play the songs". We detect our
 * own per-song chains by the "persong-" id prefix and clear only those,
 * leaving manually-applied master FX (DJ FX presets button,
 * MasterEffectsModal, cloud-restored environment) alone.
 */

import { FX_PRESETS } from '@/constants/fxPresets';
import { useAudioStore } from '@/stores/useAudioStore';
import type { EffectConfig } from '@typedefs/instrument';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';

// Legacy compact FX presets. Kept here (not in DJPlaylistPanel) so the
// engine-side apply helper has no dependency back on the UI layer. Older
// tracks persisted `track.masterFxPreset` as one of these `key` strings;
// the playlist UI re-exports this for the "FX" badge label fallback.
export const DJ_FX_PRESETS = [
  { key: 'reverb-wash',  label: 'Reverb',   effects: [{ type: 'Reverb' as const, wet: 60, params: { decay: 4, preDelay: 0.02 } }] },
  { key: 'delay-echo',   label: 'Echo',     effects: [{ type: 'PingPongDelay' as const, wet: 40, params: { delayTime: '8n', feedback: 0.3 } }] },
  { key: 'chorus-wide',  label: 'Chorus',   effects: [{ type: 'Chorus' as const, wet: 50, params: { frequency: 1.5, delayTime: 3.5, depth: 0.7 } }] },
  { key: 'phaser',       label: 'Phaser',   effects: [{ type: 'Phaser' as const, wet: 50, params: { frequency: 0.5, octaves: 3, baseFrequency: 350 } }] },
  { key: 'bitcrush',     label: 'Crush',    effects: [{ type: 'BitCrusher' as const, wet: 80, params: { bits: 8 } }] },
  { key: 'flanger',      label: 'Flanger',  effects: [{ type: 'Chorus' as const, wet: 60, params: { frequency: 0.2, delayTime: 1, depth: 1 } }] },
  { key: 'distortion',   label: 'Dist',     effects: [{ type: 'Distortion' as const, wet: 50, params: { distortion: 0.4 } }] },
  { key: 'space-echo',   label: 'Space',    effects: [{ type: 'Reverb' as const, wet: 40, params: { decay: 6, preDelay: 0.05 } }, { type: 'PingPongDelay' as const, wet: 30, params: { delayTime: '4n', feedback: 0.4 } }] },
] as const;

/** Our per-song FX apply path tags every effect id with this prefix so a
 *  later track-load can tell "I put this chain here" from "user picked this
 *  via DJFxQuickPresets / MasterEffectsModal". */
const PER_SONG_ID_PREFIX = 'persong-';

/** Apply (or clear) the per-song master FX override for the given track.
 *  Called from the various "play this track" paths in both the playlist
 *  modal and the sidebar panel so they stay consistent. */
export function applyPerSongMasterFx(track: PlaylistTrack): void {
  const store = useAudioStore.getState();
  const current = store.masterEffects;
  const currentIsPerSong =
    current.length > 0 && current.every((e) => e.id?.startsWith(PER_SONG_ID_PREFIX));

  if (track.masterFxPreset) {
    // New-style: stored value is a master FX_PRESETS name.
    const fxPreset = FX_PRESETS.find((p) => p.name === track.masterFxPreset);
    if (fxPreset) {
      const effects: EffectConfig[] = fxPreset.effects.map((fx, i) => ({
        ...fx,
        id: `${PER_SONG_ID_PREFIX}${fxPreset.name}-${i}`,
      }));
      store.setMasterEffects(effects, fxPreset.gainCompensationDb);
      return;
    }
    // Legacy: stored value is a DJ_FX_PRESETS.key.
    const legacy = DJ_FX_PRESETS.find((p) => p.key === track.masterFxPreset);
    if (legacy) {
      const effects: EffectConfig[] = legacy.effects.map((fx, i) => ({
        id: `${PER_SONG_ID_PREFIX}${legacy.key}-${i}`,
        category: 'tonejs' as const,
        type: fx.type,
        enabled: true,
        wet: fx.wet,
        parameters: fx.params as Record<string, number | string>,
      }));
      store.setMasterEffects(effects, 0);
      return;
    }
    // Unknown id — don't touch anything.
    return;
  }

  // No per-song preset on this track. Only clear if the live chain is
  // something WE applied on an earlier track; never nuke the user's
  // manually-curated master FX.
  if (currentIsPerSong) {
    store.setMasterEffects([], 0);
  }
}
