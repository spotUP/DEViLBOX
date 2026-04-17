/**
 * DJCratePanel — Unified tabbed panel merging Browser, Playlists, Online, Serato
 *
 * Single "Crate" button opens this panel with tabs to switch between sources.
 * Replaces the old 4-button toggle approach.
 */

import React, { useState, useCallback } from 'react';
import { HardDrive, ListMusic, Globe, Disc3, X, type LucideIcon } from 'lucide-react';
import { DJFileBrowser } from './DJFileBrowser';
import { DJModlandBrowser } from './DJModlandBrowser';
import { DJSeratoBrowser } from './DJSeratoBrowser';
import { DJPlaylistModal } from './DJPlaylistModal';
import type { SeratoTrack } from '@/lib/serato';

type CrateTab = 'browser' | 'playlists' | 'online' | 'serato';

const TABS: { id: CrateTab; label: string; icon: LucideIcon }[] = [
  { id: 'browser', label: 'Browser', icon: HardDrive },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'online', label: 'Online', icon: Globe },
  { id: 'serato', label: 'Serato', icon: Disc3 },
];

interface DJCratePanelProps {
  onClose: () => void;
  onLoadSeratoTrack?: (track: SeratoTrack, deckId: 'A' | 'B' | 'C') => Promise<void>;
}

export const DJCratePanel: React.FC<DJCratePanelProps> = ({ onClose, onLoadSeratoTrack }) => {
  const [activeTab, setActiveTab] = useState<CrateTab>('browser');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const handleTabClick = useCallback((tab: CrateTab) => {
    if (tab === 'playlists') {
      setShowPlaylistModal(true);
      return;
    }
    setActiveTab(tab);
  }, []);

  return (
    <>
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg flex flex-col max-h-[50vh]">
        {/* Tab bar */}
        <div className="flex items-center border-b border-dark-border shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors border-b-2 ${
                activeTab === id && id !== 'playlists'
                  ? 'border-accent-primary text-accent-primary bg-dark-bg/50'
                  : 'border-transparent text-text-muted hover:text-text-secondary hover:bg-dark-bg/30'
              }`}
            >
              <Icon size={12} strokeWidth={1.5} />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors mr-1"
            title="Close crate"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === 'browser' && <DJFileBrowser />}
          {activeTab === 'online' && <DJModlandBrowser />}
          {activeTab === 'serato' && (
            <DJSeratoBrowser onLoadTrackToDevice={onLoadSeratoTrack} />
          )}
        </div>
      </div>

      {/* Playlist modal */}
      <DJPlaylistModal isOpen={showPlaylistModal} onClose={() => setShowPlaylistModal(false)} />
    </>
  );
};
