/**
 * PixiDJCratePanel — Unified tabbed crate for the GL DJ view.
 *
 * Merges Playlists, Online, and Serato into a single panel with tab buttons.
 * The "Browser" tab opens the modal file browser (same as the old Browser button).
 */

import React, { useState, useCallback } from 'react';
import { Div } from '../../layout';
import { PixiButton } from '../../components/PixiButton';
import { PixiDJPlaylistPanel } from './PixiDJPlaylistPanel';
import { PixiDJModlandBrowser } from './PixiDJModlandBrowser';
import { PixiDJSeratoBrowser } from './PixiDJSeratoBrowser';
import { useUIStore } from '@stores';

type CrateTab = 'browser' | 'playlists' | 'online' | 'serato';

const TABS: { id: CrateTab; label: string; icon?: string }[] = [
  { id: 'browser', label: 'Browser', icon: 'open' },
  { id: 'playlists', label: 'Playlists', icon: 'diskio' },
  { id: 'online', label: 'Online', icon: 'globe' },
  { id: 'serato', label: 'Serato', icon: 'preset-a' },
];

interface PixiDJCratePanelProps {
  onClose: () => void;
}

export const PixiDJCratePanel: React.FC<PixiDJCratePanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<CrateTab>('playlists');

  const handleTabClick = useCallback((tab: CrateTab) => {
    if (tab === 'browser') {
      const s = useUIStore.getState();
      if (s.modalOpen === 'fileBrowser') s.closeModal();
      else s.openModal('fileBrowser');
      return;
    }
    setActiveTab(tab);
  }, []);

  return (
    <pixiContainer eventMode="static" layout={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      {/* Tab bar */}
      <Div
        layout={{ width: '100%', height: 28, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 4, paddingRight: 4 }}
        className="bg-dark-bgSecondary"
      >
        {TABS.map(({ id, label, icon }) => (
          <PixiButton
            key={id}
            label={label}
            icon={icon}
            variant={activeTab === id && id !== 'browser' ? 'ft2' : 'ghost'}
            color={activeTab === id && id !== 'browser' ? 'blue' : undefined}
            size="sm"
            active={activeTab === id && id !== 'browser'}
            onClick={() => handleTabClick(id)}
          />
        ))}
        <pixiContainer layout={{ flex: 1 }} />
        <PixiButton icon="close" label="" variant="ghost" size="sm" width={24} height={22} onClick={onClose} />
      </Div>

      {/* Tab content */}
      <pixiContainer eventMode="static" layout={{ width: '100%', flex: 1 }}>
        {activeTab === 'playlists' && <PixiDJPlaylistPanel />}
        {activeTab === 'online' && <PixiDJModlandBrowser />}
        {activeTab === 'serato' && <PixiDJSeratoBrowser />}
      </pixiContainer>
    </pixiContainer>
  );
};
