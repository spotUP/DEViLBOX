/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';
import { useUIStore } from '@stores';
import { useThemeStore } from '@stores/useThemeStore';
import { useDJStore } from '@stores/useDJStore';
import { useTransportStore } from '@stores/useTransportStore';
import { getDJEngine, disposeDJEngine } from '@engine/dj/DJEngine';
import { clearSongCache } from '@engine/dj/DJSongCache';
import { getToneEngine } from '@engine/ToneEngine';
import type { DJEngine } from '@engine/dj/DJEngine';
import { useDJKeyboardHandler } from '@components/dj/DJKeyboardHandler';
import { DJPlaylistPanel } from '@components/dj/DJPlaylistPanel';
import { DJModlandBrowser } from '@components/dj/DJModlandBrowser';
import { DJSeratoBrowser } from '@components/dj/DJSeratoBrowser';
import { DJControllerSelector } from '@components/dj/DJControllerSelector';
import { DJFxQuickPresets } from '@components/dj/DJFxQuickPresets';

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

      {/* Browser panel — always mounted to avoid @pixi/layout BindingError; visible prop hides when 'none' */}
      <PixiDOMOverlay
        layout={{ width: '100%', height: browserPanel !== 'none' ? 280 : 0 }}
        style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        visible={browserPanel !== 'none'}
      >
        {browserPanel === 'playlists' && <DJPlaylistPanel onClose={() => setBrowserPanel('none')} />}
        {browserPanel === 'modland' && <DJModlandBrowser onClose={() => setBrowserPanel('none')} />}
        {browserPanel === 'serato' && <DJSeratoBrowser onClose={() => setBrowserPanel('none')} />}
      </PixiDOMOverlay>

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
  const themeColors = useThemeStore(s => s.getCurrentTheme().colors);
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

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 40);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 39, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 12,
        gap: 6,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: 40 }} />

      {/* View mode selector */}
      <PixiDOMOverlay
        layout={{ height: 24, width: 100 }}
        style={{ overflow: 'visible' }}
      >
        <select
          value="dj"
          onChange={(e) => {
            const v = e.target.value;
            setTimeout(() => useUIStore.getState().setActiveView(v as any), 0);
          }}
          style={{
            width: '100%',
            height: '100%',
            padding: '0 4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            background: themeColors.bg,
            color: themeColors.text,
            border: `1px solid ${themeColors.border}`,
            borderRadius: '3px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="tracker">Tracker</option>
          <option value="arrangement">Arrangement</option>
          <option value="pianoroll">Piano Roll</option>
          <option value="dj">DJ Mixer</option>
          <option value="drumpad">Drum Pads</option>
          <option value="vj">VJ View</option>
        </select>
      </PixiDOMOverlay>

      <pixiBitmapText
        text="DEViLBOX DJ"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{}}
      />

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
      <PixiDOMOverlay
        layout={{ height: 28, width: 130 }}
        style={{ overflow: 'visible' }}
      >
        <DJControllerSelector />
      </PixiDOMOverlay>

      {/* FX Quick Presets */}
      <PixiDOMOverlay
        layout={{ height: 28, width: 130 }}
        style={{ overflow: 'visible' }}
      >
        <DJFxQuickPresets />
      </PixiDOMOverlay>

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
    </pixiContainer>
  );
};
