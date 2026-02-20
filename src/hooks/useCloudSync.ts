/**
 * useCloudSync - Hook that syncs all user data to/from the server on login.
 *
 * Place this once in the app root (App.tsx). It watches the auth store
 * and triggers a full sync whenever the user logs in.
 *
 * Individual stores call pushToCloud() on their own mutations.
 * This hook handles the initial pull on login.
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { pushToCloud, pullFromCloud } from '@/lib/cloudSync';
import { usePresetStore } from '@/stores/usePresetStore';
import type { UserPreset } from '@/stores/usePresetStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import type { DJPlaylist } from '@/stores/useDJPlaylistStore';

// ── Sync keys ────────────────────────────────────────────────────────────────

export const SYNC_KEYS = {
  INSTRUMENT_PRESETS: 'instrument-presets',
  MASTER_FX_PRESETS: 'master-fx-presets',
  SETTINGS: 'user-settings',
  MIDI_CONFIG: 'midi-config',
  DJ_PLAYLISTS: 'dj-playlists',
  DRUM_PADS: 'drum-pads',
  MPC_PRESETS: 'mpc-presets',
} as const;

// ── localStorage key helpers ─────────────────────────────────────────────────

function readLS(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, data: unknown): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Settings bundle ──────────────────────────────────────────────────────────

interface SettingsBundle {
  settings?: unknown;       // devilbox-settings
  keyboard?: unknown;       // keyboard-preferences
  theme?: unknown;          // devilbox-theme
  ui?: unknown;             // devilbox-ui-settings
}

function gatherSettings(): SettingsBundle {
  return {
    settings: readLS('devilbox-settings'),
    keyboard: readLS('keyboard-preferences'),
    theme: readLS('devilbox-theme'),
    ui: readLS('devilbox-ui-settings'),
  };
}

function applySettings(bundle: SettingsBundle): void {
  if (bundle.settings) writeLS('devilbox-settings', bundle.settings);
  if (bundle.keyboard) writeLS('keyboard-preferences', bundle.keyboard);
  if (bundle.theme) writeLS('devilbox-theme', bundle.theme);
  if (bundle.ui) writeLS('devilbox-ui-settings', bundle.ui);
}

// ── MIDI config bundle ───────────────────────────────────────────────────────

interface MIDIBundle {
  midiSettings?: unknown;   // midi-settings
  ccMappings?: unknown;     // cc-mappings-v1
  padMappings?: unknown;    // pad-mappings-v1
  buttonMappings?: unknown; // button-mappings-v1
}

function gatherMIDI(): MIDIBundle {
  return {
    midiSettings: readLS('midi-settings'),
    ccMappings: readLS('cc-mappings-v1'),
    padMappings: readLS('pad-mappings-v1'),
    buttonMappings: readLS('button-mappings-v1'),
  };
}

function applyMIDI(bundle: MIDIBundle): void {
  if (bundle.midiSettings) writeLS('midi-settings', bundle.midiSettings);
  if (bundle.ccMappings) writeLS('cc-mappings-v1', bundle.ccMappings);
  if (bundle.padMappings) writeLS('pad-mappings-v1', bundle.padMappings);
  if (bundle.buttonMappings) writeLS('button-mappings-v1', bundle.buttonMappings);
}

// ── Main hook ────────────────────────────────────────────────────────────────

export function useCloudSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    // Only sync when a user just logged in (userId changed from null to non-null)
    if (!userId || userId === prevUserId.current) {
      prevUserId.current = userId;
      return;
    }
    prevUserId.current = userId;

    console.log('[CloudSync] User logged in, starting full sync...');

    (async () => {
      try {
        // ── 1. Instrument presets ─────────────────────────────────────
        const remotePresets = await pullFromCloud<UserPreset[]>(SYNC_KEYS.INSTRUMENT_PRESETS);
        if (remotePresets?.data) {
          const store = usePresetStore.getState();
          const localPresets = store.userPresets;
          // Merge: keep all remote, add unique locals
          const merged = [...remotePresets.data];
          for (const local of localPresets) {
            if (!merged.some((r) => r.id === local.id)) {
              merged.push(local);
            }
          }
          store.importPresets(merged);
          // Push merged back
          await pushToCloud(SYNC_KEYS.INSTRUMENT_PRESETS, merged);
        } else {
          // No remote data — push local up
          const presets = usePresetStore.getState().userPresets;
          if (presets.length > 0) {
            await pushToCloud(SYNC_KEYS.INSTRUMENT_PRESETS, presets);
          }
        }

        // ── 2. Master FX presets (already synced via DJFxQuickPresets, just ensure) ─
        const localMasterFx = readLS('master-fx-user-presets');
        if (localMasterFx && Array.isArray(localMasterFx) && localMasterFx.length > 0) {
          const remote = await pullFromCloud(SYNC_KEYS.MASTER_FX_PRESETS);
          if (!remote?.data) {
            await pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, localMasterFx);
          } else if (Array.isArray(remote.data)) {
            // Merge
            const merged = [...(remote.data as unknown[])];
            for (const local of localMasterFx) {
              const l = local as { name: string };
              if (!merged.some((r) => (r as { name: string }).name === l.name)) {
                merged.push(local);
              }
            }
            writeLS('master-fx-user-presets', merged);
            await pushToCloud(SYNC_KEYS.MASTER_FX_PRESETS, merged);
          }
        }

        // ── 3. Settings ──────────────────────────────────────────────
        const remoteSettings = await pullFromCloud<SettingsBundle>(SYNC_KEYS.SETTINGS);
        if (remoteSettings?.data) {
          applySettings(remoteSettings.data);
        } else {
          const local = gatherSettings();
          if (Object.values(local).some(Boolean)) {
            await pushToCloud(SYNC_KEYS.SETTINGS, local);
          }
        }

        // ── 4. MIDI config ───────────────────────────────────────────
        const remoteMIDI = await pullFromCloud<MIDIBundle>(SYNC_KEYS.MIDI_CONFIG);
        if (remoteMIDI?.data) {
          applyMIDI(remoteMIDI.data);
        } else {
          const local = gatherMIDI();
          if (Object.values(local).some(Boolean)) {
            await pushToCloud(SYNC_KEYS.MIDI_CONFIG, local);
          }
        }

        // ── 5. DJ Playlists ──────────────────────────────────────────
        const remotePlaylists = await pullFromCloud<DJPlaylist[]>(SYNC_KEYS.DJ_PLAYLISTS);
        if (remotePlaylists?.data && Array.isArray(remotePlaylists.data)) {
          useDJPlaylistStore.getState().importPlaylists(remotePlaylists.data);
          // Push merged set back
          await pushToCloud(SYNC_KEYS.DJ_PLAYLISTS, useDJPlaylistStore.getState().playlists);
        } else {
          const localPlaylists = useDJPlaylistStore.getState().playlists;
          if (localPlaylists.length > 0) {
            await pushToCloud(SYNC_KEYS.DJ_PLAYLISTS, localPlaylists);
          }
        }

        // ── 6. Drum pad programs ─────────────────────────────────────
        const localDrumPads = readLS('devilbox_drumpad');
        if (localDrumPads) {
          const remote = await pullFromCloud(SYNC_KEYS.DRUM_PADS);
          if (remote?.data) {
            writeLS('devilbox_drumpad', remote.data);
          } else {
            await pushToCloud(SYNC_KEYS.DRUM_PADS, localDrumPads);
          }
        }

        // ── 7. MPC resampler presets ─────────────────────────────────
        const localMPC = readLS('devilbox-mpc-presets');
        if (localMPC) {
          const remote = await pullFromCloud(SYNC_KEYS.MPC_PRESETS);
          if (remote?.data) {
            writeLS('devilbox-mpc-presets', remote.data);
          } else {
            await pushToCloud(SYNC_KEYS.MPC_PRESETS, localMPC);
          }
        }

        console.log('[CloudSync] Full sync complete');
      } catch (err) {
        console.warn('[CloudSync] Sync error:', err);
      }
    })();
  }, [userId]);
}
