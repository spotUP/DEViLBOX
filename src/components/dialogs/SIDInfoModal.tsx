/**
 * SIDInfoModal — Modal wrapper for SIDInfoPanel.
 * Shows full SID metadata when the user clicks the info button in the toolbar.
 */

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { SIDInfoPanel } from './SIDInfoPanel';
import { notify } from '@stores/useNotificationStore';
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-blue-800/30 bg-blue-950/20">
          <h2 className="text-sm font-medium text-blue-200">SID File Info</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <SIDInfoPanel
            header={header}
            songDBInfo={songDB}
            stilInfo={null}
            selectedSubsong={sidMetadata.currentSubsong}
            onSubsongChange={handleSubsongChange}
          />
        </div>
      </div>
    </div>
  );
};
