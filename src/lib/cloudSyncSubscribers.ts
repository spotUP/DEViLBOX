/**
 * Cloud Sync Subscribers
 *
 * Sets up zustand store subscriptions that push data to the server
 * whenever persistent stores change. Call setupCloudSyncSubscribers()
 * once at app init.
 *
 * This is separate from useCloudSync (which handles the initial pull on login).
 * These subscribers handle the ongoing push on local mutations.
 */

import { pushToCloud } from '@/lib/cloudSync';
import { SYNC_KEYS } from '@/hooks/useCloudSync';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useKeyboardStore } from '@/stores/useKeyboardStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useMIDIStore } from '@/stores/useMIDIStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function readLS(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function debouncedPush(key: string, data: unknown, delayMs = 3000): void {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => {
    pushToCloud(key, data).catch(() => {});
  }, delayMs);
}

// ── Setup ────────────────────────────────────────────────────────────────────

let initialized = false;

export function setupCloudSyncSubscribers(): void {
  if (initialized) return;
  initialized = true;

  // ── Settings bundle (4 stores → 1 server file) ──────────────────────────

  const pushSettings = () => {
    debouncedPush(SYNC_KEYS.SETTINGS, {
      settings: readLS('devilbox-settings'),
      keyboard: readLS('keyboard-preferences'),
      theme: readLS('devilbox-theme'),
      ui: readLS('devilbox-ui-settings'),
    });
  };

  useSettingsStore.subscribe(pushSettings);
  useKeyboardStore.subscribe(pushSettings);
  useThemeStore.subscribe(pushSettings);
  // Note: useUIStore changes are too frequent (cursor position, etc.)
  // We sync UI settings only on login pull, not on every change.

  // ── MIDI config bundle (zustand store + 3 localStorage managers) ─────────

  useMIDIStore.subscribe(() => {
    debouncedPush(SYNC_KEYS.MIDI_CONFIG, {
      midiSettings: readLS('midi-settings'),
      ccMappings: readLS('cc-mappings-v1'),
      padMappings: readLS('pad-mappings-v1'),
      buttonMappings: readLS('button-mappings-v1'),
    });
  });

  // ── Master FX user presets ──────────────────────────────────────────────

  // Watch for localStorage changes (from MasterEffectsPanel save/delete)
  // We use a storage event listener since the master FX presets are managed
  // via direct localStorage, not zustand.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'master-fx-user-presets' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          debouncedPush(SYNC_KEYS.MASTER_FX_PRESETS, data);
        } catch { /* ignore parse errors */ }
      }
    });
  }

  // ── Drum pads ───────────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'devilbox_drumpad' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          debouncedPush(SYNC_KEYS.DRUM_PADS, data);
        } catch { /* ignore */ }
      }
    });
  }

  // ── MPC presets ─────────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'devilbox-mpc-presets' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          debouncedPush(SYNC_KEYS.MPC_PRESETS, data);
        } catch { /* ignore */ }
      }
    });
  }
}
