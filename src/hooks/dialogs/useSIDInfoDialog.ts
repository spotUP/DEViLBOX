// src/hooks/dialogs/useSIDInfoDialog.ts
/**
 * useSIDInfoDialog — Shared logic hook for SIDInfoModal (DOM) and PixiSIDInfoModal (Pixi).
 *
 * Both dialogs call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, effects, and handlers live here.
 */

import { useState, useEffect, useCallback } from 'react';
import { useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { notify } from '@stores/useNotificationStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import {
  fetchComposerProfile,
  fetchComposerTunes,
  fetchFileInfoByPath,
} from '@/lib/sid/composerApi';
import type {
  ComposerProfile as ComposerData,
  DeepSIDFileInfo,
  ComposerTune,
} from '@/lib/sid/composerApi';
import { downloadHVSCFile } from '@/lib/hvscApi';
import { loadFile } from '@/lib/file/UnifiedFileLoader';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SIDTabId = 'profile' | 'scope' | 'stereo' | 'filter' | 'visuals' | 'stil' | 'player' | 'csdb' | 'gb64' | 'remix' | 'tags' | 'settings';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SID_TABS: { id: SIDTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'scope', label: 'Scope' },
  { id: 'stereo', label: 'Stereo' },
  { id: 'filter', label: 'Filter' },
  { id: 'visuals', label: 'Visuals' },
  { id: 'stil', label: 'STIL' },
  { id: 'player', label: 'Player' },
  { id: 'csdb', label: 'CSDb' },
  { id: 'gb64', label: 'GB64' },
  { id: 'remix', label: 'Remix' },
  { id: 'tags', label: 'Tags' },
  { id: 'settings', label: 'Settings' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSIDInfoDialogOptions {
  onClose: () => void;
}

export function useSIDInfoDialog({ onClose }: UseSIDInfoDialogOptions) {
  // ── Store subscriptions ────────────────────────────────────────────────────
  const { sidMetadata, setSidMetadata, songDBInfo } = useFormatStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
      songDBInfo: state.songDBInfo,
    }))
  );

  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const sidHwMode = useSettingsStore((s) => s.sidHardwareMode);

  // ── Local state ────────────────────────────────────────────────────────────
  const [composer, setComposer] = useState<ComposerData | null>(null);
  const [composerLoading, setComposerLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<DeepSIDFileInfo | null>(null);
  const [tunes, setTunes] = useState<ComposerTune[]>([]);
  const [tunesTotal, setTunesTotal] = useState(0);
  const [showAllTunes, setShowAllTunes] = useState(false);
  const [loadingTuneId, setLoadingTuneId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SIDTabId>('profile');

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLoadTune = useCallback(
    async (tune: ComposerTune) => {
      if (loadingTuneId !== null) return;
      setLoadingTuneId(tune.id);
      try {
        const buffer = await downloadHVSCFile(tune.path);
        const file = new File([buffer], tune.filename || tune.path.split('/').pop() || 'tune.sid');
        const result = await loadFile(file, { requireConfirmation: false });
        if (result.success === true) {
          notify.success(result.message);
          onClose();
        } else if (result.success === false) {
          notify.error(result.error);
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Failed to load tune');
      } finally {
        setLoadingTuneId(null);
      }
    },
    [loadingTuneId, onClose]
  );

  const handleSubsongChange = useCallback(
    async (newIdx: number) => {
      if (!sidMetadata || newIdx === sidMetadata.currentSubsong) return;
      try {
        const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
        const engine = getTrackerReplayer().getC64SIDEngine();
        if (engine) {
          engine.setSubsong(newIdx);
          setSidMetadata({ ...sidMetadata, currentSubsong: newIdx });
          notify.success(`SID Subsong ${newIdx + 1}/${sidMetadata.subsongs}`);
        }
      } catch {
        notify.error('Failed to switch SID subsong');
      }
    },
    [sidMetadata, setSidMetadata]
  );

  const handleEngineChange = useCallback(
    (value: string) => {
      const engine = value as SIDEngineType;
      setSidEngine(engine);
      notify.success(`SID engine changed to ${SID_ENGINES[engine].name}`);
    },
    [setSidEngine]
  );

  const handleSubsongPrev = useCallback(() => {
    if (!sidMetadata) return;
    const next = (sidMetadata.currentSubsong - 1 + sidMetadata.subsongs) % sidMetadata.subsongs;
    handleSubsongChange(next);
  }, [sidMetadata, handleSubsongChange]);

  const handleSubsongNext = useCallback(() => {
    if (!sidMetadata) return;
    const next = (sidMetadata.currentSubsong + 1) % sidMetadata.subsongs;
    handleSubsongChange(next);
  }, [sidMetadata, handleSubsongChange]);

  // ── Data fetching effects ──────────────────────────────────────────────────

  // Fetch composer profile when author changes
  useEffect(() => {
    if (!sidMetadata?.author) return;
    setComposerLoading(true);
    fetchComposerProfile({ author: sidMetadata.author })
      .then((result) => {
        if (result.found) setComposer(result);
      })
      .finally(() => setComposerLoading(false));
  }, [sidMetadata?.author]);

  // Fetch file info from DeepSID (for tags, YouTube, lengths)
  useEffect(() => {
    if (!sidMetadata?.title) return;
    if (composer?.fullname && sidMetadata.title) {
      fetchFileInfoByPath(
        composer.fullname + '/' + sidMetadata.title.replace(/\s+/g, '_') + '.sid'
      ).then((info) => {
        if (info) setFileInfo(info);
      });
    }
  }, [composer?.fullname, sidMetadata?.title]);

  // Fetch discography
  useEffect(() => {
    if (!sidMetadata?.author) return;
    fetchComposerTunes({ author: sidMetadata.author, limit: 50 }).then((result) => {
      setTunes(result.tunes);
      setTunesTotal(result.total);
    });
  }, [sidMetadata?.author]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    // Store data
    sidMetadata,
    setSidMetadata,
    songDBInfo,
    sidEngine,
    setSidEngine,
    sidHwMode,
    // Local state
    composer,
    composerLoading,
    fileInfo,
    tunes,
    tunesTotal,
    showAllTunes,
    setShowAllTunes,
    loadingTuneId,
    activeTab,
    setActiveTab,
    // Handlers
    handleLoadTune,
    handleSubsongChange,
    handleEngineChange,
    handleSubsongPrev,
    handleSubsongNext,
  };
}
