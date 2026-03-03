/**
 * SIDInfoModal — Modal wrapper for SIDInfoPanel + ComposerProfile.
 * Shows full SID metadata and composer bio when the user clicks the info button in the toolbar.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { SIDInfoPanel } from './SIDInfoPanel';
import { ComposerProfile } from './ComposerProfile';
import { notify } from '@stores/useNotificationStore';
import { fetchComposerProfile } from '@/lib/sid/composerApi';
import type { ComposerProfile as ComposerData } from '@/lib/sid/composerApi';
import type { SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';

interface SIDInfoModalProps {
  onClose: () => void;
}

export const SIDInfoModal: React.FC<SIDInfoModalProps> = ({ onClose }) => {
  const { sidMetadata, setSidMetadata, songDBInfo } = useTrackerStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
      songDBInfo: state.songDBInfo,
    }))
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

  if (!sidMetadata) return null;

  // Tab state
  const [activeTab, setActiveTab] = useState<'info' | 'composer'>('info');
  const [composer, setComposer] = useState<ComposerData | null>(null);
  const [composerLoading, setComposerLoading] = useState(false);

  // Fetch composer profile when modal opens or tab switches
  useEffect(() => {
    if (!sidMetadata?.author) return;
    setComposerLoading(true);
    fetchComposerProfile({ author: sidMetadata.author })
      .then((result) => {
        if (result.found) setComposer(result);
      })
      .finally(() => setComposerLoading(false));
  }, [sidMetadata?.author]);

  // Build SIDHeaderInfo from store metadata
  const header: SIDHeaderInfo = {
    format: sidMetadata.format as 'PSID' | 'RSID',
    version: sidMetadata.version,
    title: sidMetadata.title,
    author: sidMetadata.author,
    copyright: sidMetadata.copyright,
    subsongs: sidMetadata.subsongs,
    defaultSubsong: sidMetadata.defaultSubsong,
    chipModel: sidMetadata.chipModel,
    clockSpeed: sidMetadata.clockSpeed,
    secondSID: sidMetadata.secondSID,
    thirdSID: sidMetadata.thirdSID,
  };

  // Build SongDB result if available
  const songDB: import('@/lib/songdb').SongDBResult | null = songDBInfo ? {
    found: true as const,
    format: songDBInfo.format ?? '',
    channels: null,
    authors: songDBInfo.authors ?? [],
    publishers: songDBInfo.publishers ?? [],
    album: songDBInfo.album ?? '',
    year: songDBInfo.year ?? '',
    subsongs: songDBInfo.duration_ms ? [{ duration_ms: songDBInfo.duration_ms, flags: '' }] : [],
  } : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dark-bgPrimary border border-blue-800/50 rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-blue-800/30 bg-blue-950/20">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                activeTab === 'info'
                  ? 'bg-blue-800/40 text-blue-200 font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              SID Info
            </button>
            <button
              onClick={() => setActiveTab('composer')}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'composer'
                  ? 'bg-blue-800/40 text-blue-200 font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Composer
              {composerLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              {!composerLoading && composer && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {activeTab === 'info' && (
            <SIDInfoPanel
              header={header}
              songDBInfo={songDB}
              stilInfo={null}
              selectedSubsong={sidMetadata.currentSubsong}
              onSubsongChange={handleSubsongChange}
            />
          )}
          {activeTab === 'composer' && (
            composerLoading ? (
              <div className="flex items-center justify-center py-8 text-text-muted">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading composer profile…</span>
              </div>
            ) : composer ? (
              <ComposerProfile composer={composer} />
            ) : (
              <div className="text-center py-8 text-text-muted text-sm">
                <p>No composer profile found for "{sidMetadata.author}"</p>
                <p className="text-xs mt-1 text-text-muted/60">
                  Profile data requires the DeepSID database on the server.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
