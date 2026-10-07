/**
 * useModuleImport — React callbacks for the TD-3 and SunVox patch dialogs.
 *
 * Module imports are not here: the import dialog is an optional step in front
 * of openSong (src/lib/song/openSong.ts), which owns every song open.
 */

import { useCallback } from 'react';
import { useUIStore } from '@stores';
import type { SunVoxConfig } from '@/types/instrument/exotic';
import { notify } from '@stores/useNotificationStore';

export function useModuleImport() {
  // ── TD-3 pattern import ──────────────────────────────────────────────────
  const handleTD3Import = useCallback(async (file: File, replacePatterns: boolean) => {
    const { loadFile } = await import('@lib/file/UnifiedFileLoader');
    const result = await loadFile(file, { replacePatterns });
    if (result.success === true) notify.success(result.message);
    else if (result.success === false) notify.error(result.error);
  }, []);

  // ── SunVox .sunsynth patch import ────────────────────────────────────────
  // (.sunvox song files are loaded directly via UnifiedFileLoader, no dialog needed.)
  const handleSunVoxImport = useCallback(async (name: string, config: SunVoxConfig) => {
    useUIStore.getState().setPendingSunVoxFile(null);
    try {
      const { useInstrumentStore } = await import('@stores');
      useInstrumentStore.getState().createInstrument({ name, synthType: 'SunVoxSynth', sunvox: config });
      notify.success(`Imported SunVox patch: ${name}`);
    } catch (err) {
      notify.error('Failed to import SunVox patch');
      console.error('[useModuleImport] SunVox patch import failed:', err);
    }
  }, []);

  return { handleTD3Import, handleSunVoxImport };
}
