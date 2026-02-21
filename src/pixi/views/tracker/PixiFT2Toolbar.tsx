/**
 * PixiFT2Toolbar — FT2-style toolbar for the tracker view.
 * Row 1: Transport | BPM/Speed | Pattern selector | Play buttons
 * Row 2: Menu bar buttons (Load, Save, Export, etc.)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiNumericInput } from '../../components';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useProjectStore } from '@stores/useProjectStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import * as Tone from 'tone';

const TOOLBAR_HEIGHT = 80;
const MENUBAR_HEIGHT = 28;

export const PixiFT2Toolbar: React.FC = () => {
  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: TOOLBAR_HEIGHT + MENUBAR_HEIGHT,
        flexDirection: 'column',
      }}
    >
      <PixiFT2MainRow />
      <PixiFT2MenuBar />
    </pixiContainer>
  );
};

// ─── Main toolbar row ───────────────────────────────────────────────────────

const PixiFT2MainRow: React.FC = () => {
  const theme = usePixiTheme();

  // Transport store
  const bpm = useTransportStore(s => s.bpm);
  const setBPM = useTransportStore(s => s.setBPM);
  const speed = useTransportStore(s => s.speed);
  const setSpeed = useTransportStore(s => s.setSpeed);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const isLooping = useTransportStore(s => s.isLooping);

  // Tracker store
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);
  const numPatterns = useTrackerStore(s => s.patterns.length);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const patternOrderLength = useTrackerStore(s => s.patternOrder.length);
  const editStep = useTrackerStore(s => s.editStep);
  const setEditStep = useTrackerStore(s => s.setEditStep);
  const patternLength = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.length || 64;
  });
  const resizePattern = useTrackerStore(s => s.resizePattern);

  const handlePlaySong = useCallback(async () => {
    Tone.start();
    const engine = getToneEngine();
    const { isPlaying, isLooping, play, stop, setIsLooping, setCurrentRow } = useTransportStore.getState();
    if (isPlaying && !isLooping) {
      getTrackerReplayer().stop(); stop(); engine.releaseAll();
    } else {
      if (isPlaying) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
      setIsLooping(false);
      setCurrentRow(0);
      await engine.init();
      await play();
    }
  }, []);

  const handlePlayPattern = useCallback(async () => {
    Tone.start();
    const engine = getToneEngine();
    const { isPlaying, isLooping, play, stop, setIsLooping, setCurrentRow } = useTransportStore.getState();
    if (isPlaying && isLooping) {
      getTrackerReplayer().stop(); stop(); engine.releaseAll();
    } else {
      if (isPlaying) { getTrackerReplayer().stop(); stop(); engine.releaseAll(); }
      setIsLooping(true);
      setCurrentRow(0);
      await engine.init();
      await play();
    }
  }, []);

  const handleLengthChange = useCallback((newLength: number) => {
    if (newLength >= 1 && newLength <= 256) {
      resizePattern(useTrackerStore.getState().currentPatternIndex, newLength);
    }
  }, [resizePattern]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, TOOLBAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  // Tap tempo
  const tapTimesRef = useRef<number[]>([]);
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    // Reset if last tap was more than 2 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      tapTimesRef.current = [];
    }
    taps.push(now);
    if (taps.length > 8) taps.shift(); // Keep last 8 taps
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 32 && bpm <= 255) {
        useTransportStore.getState().setBPM(bpm);
      }
    }
  }, []);

  const isPlayingSong = isPlaying && !isLooping;
  const isPlayingPattern = isPlaying && isLooping;

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: TOOLBAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_HEIGHT }} />

      {/* Position */}
      <PixiToolbarSection label="POS">
        <PixiNumericInput
          value={currentPositionIndex}
          min={0}
          max={Math.max(0, patternOrderLength - 1)}
          onChange={setCurrentPosition}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* BPM */}
      <PixiToolbarSection label="BPM">
        <PixiNumericInput
          value={bpm}
          min={32}
          max={255}
          onChange={setBPM}
          width={44}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Pattern */}
      <PixiToolbarSection label="PAT">
        <PixiNumericInput
          value={currentPatternIndex}
          min={0}
          max={Math.max(0, numPatterns - 1)}
          onChange={setCurrentPattern}
          width={36}
          formatValue={(v) => String(v).padStart(2, '0')}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Edit Step */}
      <PixiToolbarSection label="STEP">
        <PixiNumericInput
          value={editStep}
          min={0}
          max={16}
          onChange={setEditStep}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Speed */}
      <PixiToolbarSection label="SPD">
        <PixiNumericInput
          value={speed}
          min={1}
          max={31}
          onChange={setSpeed}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Pattern Length */}
      <PixiToolbarSection label="LEN">
        <PixiNumericInput
          value={patternLength}
          min={1}
          max={256}
          onChange={handleLengthChange}
          width={44}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Transport buttons */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiButton
          label={isPlayingSong ? 'STOP' : 'PLAY'}
          variant="ft2"
          color={isPlayingSong ? 'red' : 'green'}
          size="sm"
          active={isPlayingSong}
          onClick={handlePlaySong}
        />
        <PixiButton
          label={isPlayingPattern ? 'STOP' : 'PAT'}
          variant="ft2"
          color={isPlayingPattern ? 'red' : 'blue'}
          size="sm"
          active={isPlayingPattern}
          onClick={handlePlayPattern}
        />
        <PixiButton
          label="TAP"
          variant="ghost"
          size="sm"
          onClick={handleTapTempo}
        />
      </pixiContainer>

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Spectrum visualizer */}
      <PixiSpectrumVisualizer />
    </pixiContainer>
  );
};

// ─── Menu bar ───────────────────────────────────────────────────────────────

const PixiFT2MenuBar: React.FC = () => {
  const theme = usePixiTheme();
  const isDirty = useProjectStore(s => s.isDirty);
  const modalOpen = useUIStore(s => s.modalOpen);

  const handleSave = useCallback(() => {
    // Trigger save via keyboard command (Ctrl+S handler in useGlobalKeyboardHandler)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  }, []);

  const handleNew = useCallback(() => {
    if (confirm('Create new project? Unsaved changes will be lost.')) {
      useTrackerStore.getState().reset();
      useProjectStore.getState().setMetadata({ name: 'Untitled', author: '', description: '' });
    }
  }, []);

  const handleClear = useCallback(() => {
    if (confirm('Clear current pattern?')) {
      useTrackerStore.getState().clearPattern();
    }
  }, []);

  const handleLoad = useCallback(() => {
    useUIStore.getState().setShowFileBrowser(true);
  }, []);

  const handleSettings = useCallback(() => {
    useUIStore.getState().openModal('settings');
  }, []);

  const handleExport = useCallback(() => {
    useUIStore.getState().openModal('export');
  }, []);

  const handleInstruments = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  const handlePads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  const handleMasterFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);

  const handleInstrFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
  }, []);

  const handleAdvancedEdit = useCallback(() => {
    useUIStore.getState().openModal('advancedEdit');
  }, []);

  const handleAutomation = useCallback(() => {
    useUIStore.getState().openModal('automation');
  }, []);

  const handleReference = useCallback(() => {
    useUIStore.getState().openModal('help', { initialTab: 'chip-effects' });
  }, []);

  const handleHelp = useCallback(() => {
    useUIStore.getState().openModal('help', { initialTab: 'shortcuts' });
  }, []);

  const handleOrder = useCallback(() => {
    useUIStore.getState().openModal('patternOrder');
  }, []);

  const handleRevisions = useCallback(() => {
    useUIStore.getState().openModal('revisions');
  }, []);

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleSwitchToDOM = useCallback(() => {
    useSettingsStore.getState().setRenderMode('dom');
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, MENUBAR_HEIGHT);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, MENUBAR_HEIGHT - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  // Menu items with their handlers — matches DOM FT2Toolbar menu bar order
  const menuItems: { label: string; onClick: () => void; active?: boolean }[] = [
    { label: 'Load', onClick: handleLoad },
    { label: isDirty ? 'Save*' : 'Save', onClick: handleSave },
    { label: 'Revisions', onClick: handleRevisions },
    { label: 'Download', onClick: handleSave },
    { label: 'Export', onClick: handleExport },
    { label: 'New', onClick: handleNew },
    { label: 'Clear', onClick: handleClear },
    { label: 'Order', onClick: handleOrder },
    { label: 'Instr', onClick: handleInstruments },
    { label: 'Pads', onClick: handlePads },
    { label: 'Master FX', onClick: handleMasterFX, active: modalOpen === 'masterFx' },
    { label: 'Instr FX', onClick: handleInstrFX, active: modalOpen === 'instrumentFx' },
    { label: 'Edit', onClick: handleAdvancedEdit, active: modalOpen === 'advancedEdit' },
    { label: 'Auto', onClick: handleAutomation, active: modalOpen === 'automation' },
    { label: 'Reference', onClick: handleReference },
    { label: 'Help', onClick: handleHelp },
    { label: 'Settings', onClick: handleSettings },
    { label: 'Fullscr', onClick: handleFullscreen },
    { label: 'DOM Mode', onClick: handleSwitchToDOM },
  ];

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: MENUBAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 4,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: MENUBAR_HEIGHT }} />

      {menuItems.map(item => (
        <PixiButton
          key={item.label}
          label={item.label}
          variant={item.active ? 'ft2' : 'ghost'}
          color={item.active ? 'blue' : undefined}
          size="sm"
          active={item.active}
          onClick={item.onClick}
        />
      ))}
    </pixiContainer>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const PixiToolbarSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
      />
      {children}
    </pixiContainer>
  );
};

const PixiToolbarSep: React.FC = () => {
  const theme = usePixiTheme();
  return (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear();
        g.rect(0, 8, 1, TOOLBAR_HEIGHT - 16);
        g.fill({ color: theme.border.color, alpha: 0.25 });
      }}
      layout={{ width: 1, height: TOOLBAR_HEIGHT }}
    />
  );
};

// ─── Spectrum Visualizer ─────────────────────────────────────────────────────

const VIZ_WIDTH = 120;
const VIZ_HEIGHT = 64;
const VIZ_BARS = 32;

const PixiSpectrumVisualizer: React.FC = () => {
  const theme = usePixiTheme();
  const graphicsRef = useRef<GraphicsType | null>(null);
  const isPlaying = useTransportStore(s => s.isPlaying);

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;

    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;

      g.clear();

      // Background
      g.roundRect(0, 0, VIZ_WIDTH, VIZ_HEIGHT, 4);
      g.fill({ color: theme.bg.color });
      g.roundRect(0, 0, VIZ_WIDTH, VIZ_HEIGHT, 4);
      g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });

      try {
        const engine = getToneEngine();
        const fftData = engine.getFFT();
        const barWidth = (VIZ_WIDTH - 8) / VIZ_BARS;
        const step = Math.floor(fftData.length / VIZ_BARS);

        for (let i = 0; i < VIZ_BARS; i++) {
          // Average a range of FFT bins for each bar
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += fftData[i * step + j] ?? -100;
          }
          const db = sum / step;
          // Normalize: -100dB = 0, 0dB = 1
          const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
          const barH = normalized * (VIZ_HEIGHT - 8);

          if (barH > 0.5) {
            const x = 4 + i * barWidth;
            const y = VIZ_HEIGHT - 4 - barH;
            g.rect(x, y, barWidth - 1, barH);
            g.fill({ color: theme.accent.color, alpha: 0.4 + normalized * 0.6 });
          }
        }
      } catch {
        // Engine not ready — draw empty
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, theme]);

  // Static background when not playing
  const drawStatic = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, VIZ_WIDTH, VIZ_HEIGHT, 4);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, VIZ_WIDTH, VIZ_HEIGHT, 4);
    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{ width: VIZ_WIDTH, height: VIZ_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
    >
      {isPlaying ? (
        <pixiGraphics
          ref={graphicsRef}
          draw={() => {}} // Initial draw — rAF loop takes over
          layout={{ position: 'absolute', width: VIZ_WIDTH, height: VIZ_HEIGHT }}
        />
      ) : (
        <>
          <pixiGraphics
            draw={drawStatic}
            layout={{ position: 'absolute', width: VIZ_WIDTH, height: VIZ_HEIGHT }}
          />
          <pixiBitmapText
            text="SPECTRUM"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </>
      )}
    </pixiContainer>
  );
};
