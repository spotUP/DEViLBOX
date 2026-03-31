/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixiButton, PixiViewHeader } from '../components';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';
import { PixiDJCratePanel } from './dj/PixiDJCratePanel';
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
import { PixiDJSamplerPanel } from './dj/PixiDJSamplerPanel';
import { PixiDJAutoDJPanel } from './dj/PixiDJAutoDJPanel';

type DJBrowserPanel = 'none' | 'crate';

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
  const [samplerOpen, setSamplerOpen] = useState(false);
  const [autoDJOpen, setAutoDJOpen] = useState(false);
  const autoDJEnabled = useDJStore(s => s.autoDJEnabled);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Top control bar */}
      <PixiDJTopBar
        browserPanel={browserPanel}
        onBrowserPanelChange={setBrowserPanel}
        samplerOpen={samplerOpen}
        onSamplerToggle={() => setSamplerOpen(p => !p)}
        autoDJOpen={autoDJOpen || autoDJEnabled}
        onAutoDJToggle={() => setAutoDJOpen(p => !p)}
      />

      {/* Crate panel — GL-native tabbed browser, collapses to 0 height when hidden */}
      <pixiContainer layout={{ width: '100%', height: browserPanel === 'crate' ? 280 : 0, flexShrink: 0 }}>
        {browserPanel === 'crate' && <PixiDJCratePanel onClose={() => setBrowserPanel('none')} />}
      </pixiContainer>

      {/* Main deck area: Deck A | Mixer | Deck B [| Deck C] */}
      <pixiContainer
        eventMode={browserPanel !== 'none' ? 'static' : 'auto'}
        onPointerDown={browserPanel !== 'none' ? () => setBrowserPanel('none') : undefined}
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

        {/* Auto DJ panel overlay */}
        {(autoDJOpen || autoDJEnabled) && (
          <pixiContainer layout={{ position: 'absolute', left: 8, top: 8 }}>
            <PixiDJAutoDJPanel isOpen={autoDJOpen || autoDJEnabled} onClose={() => setAutoDJOpen(false)} />
          </pixiContainer>
        )}

        {/* Sampler panel overlay */}
        {samplerOpen && (
          <pixiContainer layout={{ position: 'absolute', right: 8, top: 8 }}>
            <PixiDJSamplerPanel isOpen={samplerOpen} onClose={() => setSamplerOpen(false)} />
          </pixiContainer>
        )}
      </pixiContainer>

    </pixiContainer>
  );
};

// ─── Top Bar ────────────────────────────────────────────────────────────────

interface DJTopBarProps {
  browserPanel: DJBrowserPanel;
  onBrowserPanelChange: (panel: DJBrowserPanel) => void;
  samplerOpen: boolean;
  onSamplerToggle: () => void;
  autoDJOpen: boolean;
  onAutoDJToggle: () => void;
}

const PixiDJTopBar: React.FC<DJTopBarProps> = ({ browserPanel, onBrowserPanelChange, samplerOpen, onSamplerToggle, autoDJOpen, onAutoDJToggle }) => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const deckViewMode = useDJStore(s => s.deckViewMode);
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);

  const togglePanel = useCallback((panel: DJBrowserPanel) => {
    onBrowserPanelChange(browserPanel === panel ? 'none' : panel);
  }, [browserPanel, onBrowserPanelChange]);

  const handleFX = useCallback(() => {
    const s = useUIStore.getState();
    if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); }
  }, []);

  return (
    <PixiViewHeader activeView="dj" title="DEVILBOX DJ" subtitle="DUAL DECK MIXER">

      {/* Controller selector */}
      <PixiDJControllerSelect width={140} height={24} layout={{ height: 28, width: 140 }} />

      {/* FX Quick Presets */}
      <PixiDJFxPresets width={130} height={24} layout={{ height: 28, width: 130 }} />

      {/* Deck view mode (cycle: Visualizer → Vinyl → 3D) */}
      <PixiButton
        label={`Deck: ${deckViewMode === 'vinyl' ? 'Vinyl' : deckViewMode === '3d' ? '3D' : 'Visualizer'}`}
        variant="ghost"
        size="sm"
        onClick={() => useDJStore.getState().cycleDeckViewMode()}
      />

      {/* Deck C toggle */}
      <PixiButton
        label="Deck C"
        variant={thirdDeckActive ? 'ft2' : 'ghost'}
        color={thirdDeckActive ? 'green' : undefined}
        size="sm"
        active={thirdDeckActive}
        onClick={() => useDJStore.getState().setThirdDeckActive(!thirdDeckActive)}
      />

      {/* FX Editor */}
      <PixiButton
        label="FX Editor"
        variant={modalOpen === 'masterFx' ? 'ft2' : 'ghost'}
        color={modalOpen === 'masterFx' ? 'green' : undefined}
        size="sm"
        active={modalOpen === 'masterFx'}
        onClick={handleFX}
      />

      {/* Sampler / Drum Pads (unified) */}
      <PixiButton
        label="Pads"
        variant={samplerOpen ? 'ft2' : 'ghost'}
        color={samplerOpen ? 'yellow' : undefined}
        size="sm"
        active={samplerOpen}
        onClick={onSamplerToggle}
      />

      {/* Auto DJ */}
      <PixiButton
        label={autoDJOpen ? 'Auto DJ ON' : 'Auto DJ'}
        variant={autoDJOpen ? 'ft2' : 'ghost'}
        color={autoDJOpen ? 'green' : undefined}
        size="sm"
        active={autoDJOpen}
        onClick={onAutoDJToggle}
      />

      {/* Crate */}
      <PixiButton
        label="Crate"
        variant={browserPanel === 'crate' ? 'ft2' : 'ghost'}
        color={browserPanel === 'crate' ? 'blue' : undefined}
        size="sm"
        active={browserPanel === 'crate'}
        onClick={() => togglePanel('crate')}
      />
    </PixiViewHeader>
  );
};
