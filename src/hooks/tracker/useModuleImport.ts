/**
 * useModuleImport — React hook wrapper around the unified importTrackerModule.
 *
 * Thin wrapper that provides React callbacks for ImportModuleDialog.
 * All import logic lives in UnifiedFileLoader.importTrackerModule().
 */

import { useCallback } from 'react';
import { useUIStore } from '@stores';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from '@components/dialogs/ImportModuleDialog';
import type { SunVoxConfig } from '@/types/instrument/exotic';
import { notify } from '@stores/useNotificationStore';
import { importTrackerModule } from '@lib/file/UnifiedFileLoader';

export function useModuleImport() {
  // ── TD-3 pattern import ──────────────────────────────────────────────────
  const handleTD3Import = useCallback(async (file: File, replacePatterns: boolean) => {
    const { loadFile } = await import('@lib/file/UnifiedFileLoader');
    const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
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

  // ── Module import — delegates to the unified importTrackerModule ──────
  const handleModuleImport = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    try {
      await importTrackerModule(info, options);
    } catch (err) {
      const { showAlert } = await import('@stores/useConfirmStore');
      const msg = err instanceof Error ? err.message : String(err);
      const name = info.file?.name ?? info.metadata?.title ?? 'module';
      console.error('[useModuleImport] import failed:', err);
      void showAlert({ title: 'Load Failed', message: `${name}: ${msg}` });
    }
  }, []);

  return { handleModuleImport, handleTD3Import, handleSunVoxImport };
}
