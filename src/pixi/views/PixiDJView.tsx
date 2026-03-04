/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiViewHeader } from '../components';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';
import { PixiDJPlaylistPanel } from './dj/PixiDJPlaylistPanel';
import { PixiDJModlandBrowser } from './dj/PixiDJModlandBrowser';
import { PixiDJSeratoBrowser } from './dj/PixiDJSeratoBrowser';
import { useUIStore } from '@stores';
import { useDJStore } from '@stores/useDJStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getDJEngine, disposeDJEngine } from '@engine/dj/DJEngine';
import { clearSongCache } from '@engine/dj/DJSongCache';
import { getToneEngine } from '@engine/ToneEngine';
import type { DJEngine } from '@engine/dj/DJEngine';
import { useDJKeyboardHandler } from '@components/dj/DJKeyboardHandler';
import { PixiDJControllerSelect } from './dj/PixiDJControllerSelect';
import { PixiDJFxPresets } from './dj/PixiDJFxPresets';

type DJBrowserPanel = 'none' | 'playlists' | 'modland' | 'serato';

export const PixiDJView: React.FC = () => {
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore(s => s.setDJModeActive);
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);

  // DJ keyboard shortcuts
  useDJKeyboardHandler();

  // Initialize DJ engine on mount, clean up on unmount
  useEffect(() => {
    const { isPlaying, stop } = useTransportStore.getState();
    if (isPlaying) stop();
    getToneEngine().releaseAll();

    engineRef.current = getDJEngine();
    setDJModeActive(true);

    return () => {
      setDJModeActive(false);
      disposeDJEngine();
      clearSongCache();
      engineRef.current = null;

      const engine = getToneEngine();
      engine.setGlobalPlaybackRate(1.0);
      engine.setGlobalDetune(0);
      engine.releaseAll();
      useTransportStore.getState().setGlobalPitch(0);
    };
  }, [setDJModeActive]);

  const [browserPanel, setBrowserPanel] = useState<DJBrowserPanel>('none');

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Top control bar */}
      <PixiDJTopBar browserPanel={browserPanel} onBrowserPanelChange={setBrowserPanel} />

      {/* Browser panel — GL-native, collapses to 0 height when hidden */}
      <pixiContainer layout={{ width: '100%', height: browserPanel !== 'none' ? 280 : 0 }}>
        {browserPanel === 'playlists' && <PixiDJPlaylistPanel />}
        {browserPanel === 'modland' && <PixiDJModlandBrowser />}
        {browserPanel === 'serato' && <PixiDJSeratoBrowser />}
      </pixiContainer>

      {/* Main deck area: Deck A | Mixer | Deck B [| Deck C] */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiDJDeck deckId="A" />
        <PixiDJMixer />
        <PixiDJDeck deckId="B" />
        {/* Third deck — always mounted to avoid @pixi/layout BindingError */}
        <pixiContainer
          alpha={thirdDeckActive ? 1 : 0}
          renderable={thirdDeckActive}
          layout={{ width: thirdDeckActive ? undefined : 0, height: '100%', overflow: 'hidden' }}
        >
          <PixiDJDeck deckId="C" />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Top Bar ────────────────────────────────────────────────────────────────

interface DJTopBarProps {
  browserPanel: DJBrowserPanel;
  onBrowserPanelChange: (panel: DJBrowserPanel) => void;
}

const PixiDJTopBar: React.FC<DJTopBarProps> = ({ browserPanel, onBrowserPanelChange }) => {
  const theme = usePixiTheme();
  const modalOpen = useUIStore(s => s.modalOpen);

  const handleBrowser = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'fileBrowser' ? s.closeModal() : s.openModal('fileBrowser');
  }, []);

  const togglePanel = useCallback((panel: DJBrowserPanel) => {
    onBrowserPanelChange(browserPanel === panel ? 'none' : panel);
  }, [browserPanel, onBrowserPanelChange]);

  const handleFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);

  const handleDrumpads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  const handleSettings = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'settings' ? s.closeModal() : s.openModal('settings');
  }, []);

  return (
    <PixiViewHeader activeView="dj" title="DEViLBOX DJ">

      {/* Browser panels */}
      <PixiButton
        label="Files"
        variant={modalOpen === 'fileBrowser' ? 'ft2' : 'ghost'}
        color={modalOpen === 'fileBrowser' ? 'blue' : undefined}
        size="sm"
        active={modalOpen === 'fileBrowser'}
        onClick={handleBrowser}
      />
      <PixiButton
        label="Playlists"
        variant={browserPanel === 'playlists' ? 'ft2' : 'ghost'}
        color={browserPanel === 'playlists' ? 'blue' : undefined}
        size="sm"
        active={browserPanel === 'playlists'}
        onClick={() => togglePanel('playlists')}
      />
      <PixiButton
        label="Modland"
        variant={browserPanel === 'modland' ? 'ft2' : 'ghost'}
        color={browserPanel === 'modland' ? 'blue' : undefined}
        size="sm"
        active={browserPanel === 'modland'}
        onClick={() => togglePanel('modland')}
      />
      <PixiButton
        label="Serato"
        variant={browserPanel === 'serato' ? 'ft2' : 'ghost'}
        color={browserPanel === 'serato' ? 'blue' : undefined}
        size="sm"
        active={browserPanel === 'serato'}
        onClick={() => togglePanel('serato')}
      />

      <pixiContainer layout={{ flex: 1 }} />

      {/* Controller selector */}
      <PixiDJControllerSelect width={130} height={24} layout={{ height: 28, width: 130 }} />

      {/* FX Quick Presets */}
      <PixiDJFxPresets width={130} height={24} layout={{ height: 28, width: 130 }} />

      <PixiButton
        label="FX"
        variant={modalOpen === 'masterFx' ? 'ft2' : 'ghost'}
        color={modalOpen === 'masterFx' ? 'green' : undefined}
        size="sm"
        active={modalOpen === 'masterFx'}
        onClick={handleFX}
      />
      <PixiButton
        label="Pads"
        variant="ghost"
        size="sm"
        onClick={handleDrumpads}
      />
      <PixiButton
        label="Settings"
        variant={modalOpen === 'settings' ? 'ft2' : 'ghost'}
        color={modalOpen === 'settings' ? 'blue' : undefined}
        size="sm"
        active={modalOpen === 'settings'}
        onClick={handleSettings}
      />
    </PixiViewHeader>
  );
};
