/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixiButton, PixiViewHeader } from '../components';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';
import { PixiDeckWaveform } from './dj/PixiDeckWaveform';
import { PixiDJCratePanel } from './dj/PixiDJCratePanel';
import { useDJStore } from '@stores/useDJStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useVocoderStore } from '@stores/useVocoderStore';
import { getDJEngine, disposeDJEngine } from '@engine/dj/DJEngine';
import { clearSongCache } from '@engine/dj/DJSongCache';
import { cacheSong } from '@engine/dj/DJSongCache';
import { getToneEngine } from '@engine/ToneEngine';
import type { DJEngine } from '@engine/dj/DJEngine';
import { useDJKeyboardHandler } from '@components/dj/DJKeyboardHandler';
import { PixiDJControllerSelect } from './dj/PixiDJControllerSelect';
import { PixiDJFxPresets } from './dj/PixiDJFxPresets';
import { PixiDJSamplerPanel } from './dj/PixiDJSamplerPanel';
import { PixiDJAutoDJPanel } from './dj/PixiDJAutoDJPanel';
import { getPhaseInfo } from '@engine/dj/DJAutoSync';
import { useDeckStateSync } from '@hooks/dj/useDeckStateSync';
import { useDJHealth } from '@hooks/dj/useDJHealth';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { isAudioFile } from '@lib/audioFileUtils';
import { isUADEFormat } from '@lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@engine/dj/DJUADEPrerender';
import { getDJPipeline } from '@engine/dj/DJPipeline';
import { parseModuleToSong } from '@lib/import/parseModuleToSong';
import { detectBPM } from '@engine/dj/DJBeatDetector';
import type { DeckId } from '@engine/dj/DeckEngine';

type DJBrowserPanel = 'none' | 'crate';

/** Headless bridge -- polls engine state and updates the store for one deck. */
function DeckStateSyncBridge({ deckId }: { deckId: DeckId }) {
  useDeckStateSync(deckId);
  return null;
}

export const PixiDJView: React.FC = () => {
  const engineRef = useRef<DJEngine | null>(null);
  const setDJModeActive = useDJStore(s => s.setDJModeActive);
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);
  const health = useDJHealth();

  // Drag-and-drop state
  const [dragOverDeck, setDragOverDeck] = useState<DeckId | null>(null);
  const dragCountRef = useRef(0);

  // DJ keyboard shortcuts
  useDJKeyboardHandler();

  // Sync status: poll phase alignment between decks at 10Hz with hysteresis
  const [syncDriftMs, setSyncDriftMs] = useState<number | null>(null);
  const driftHistoryRef = useRef<number[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      const s = useDJStore.getState();
      if (!s.decks.A.isPlaying || !s.decks.B.isPlaying || !s.decks.A.beatGrid || !s.decks.B.beatGrid) {
        setSyncDriftMs(null);
        driftHistoryRef.current = [];
        return;
      }
      try {
        const phaseA = getPhaseInfo('A');
        const phaseB = getPhaseInfo('B');
        if (!phaseA || !phaseB) { setSyncDriftMs(null); return; }
        let phaseDiff = Math.abs(phaseA.beatPhase - phaseB.beatPhase);
        if (phaseDiff > 0.5) phaseDiff = 1 - phaseDiff;
        const beatPeriodMs = (60 / s.decks.A.beatGrid!.bpm) * 1000;
        const rawDrift = Math.round(phaseDiff * beatPeriodMs);

        // Rolling average of last 10 samples (1 second) for stable display
        const history = driftHistoryRef.current;
        history.push(rawDrift);
        if (history.length > 10) history.shift();
        const avgDrift = Math.round(history.reduce((a, b) => a + b, 0) / history.length);

        setSyncDriftMs(avgDrift);
      } catch { setSyncDriftMs(null); }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Initialize DJ engine on mount, clean up on unmount
  useEffect(() => {
    const { isPlaying, stop } = useTransportStore.getState();
    if (isPlaying) stop();
    getToneEngine().releaseAll();

    // Ensure AudioContext is running (browser may have suspended it)
    import('tone').then(Tone => Tone.start().catch(() => {}));

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

  // Subscribe to PFL/cue changes and route to engine (matches DOM DJView)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const u1 = useDJStore.subscribe(s => s.decks.A.pflEnabled, v => engine.mixer.setPFL('A', v));
    const u2 = useDJStore.subscribe(s => s.decks.B.pflEnabled, v => engine.mixer.setPFL('B', v));
    const u3 = useDJStore.subscribe(s => s.decks.C.pflEnabled, v => engine.mixer.setPFL('C', v));
    const u4 = useDJStore.subscribe(s => s.cueVolume, v => engine.cueEngine.setCueVolume(v));
    const u5 = useDJStore.subscribe(s => s.cueMix, v => engine.cueEngine.setCueMix(v));
    const u6 = useDJStore.subscribe(s => s.cueDeviceId, v => { if (v) void engine.cueEngine.setCueDevice(v); });
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  // ── Drag-and-drop: load file to deck via canvas events ─────────────────────
  const handleFileDrop = useCallback(async (file: File, deckId: DeckId) => {
    try {
      const engine = getDJEngine();
      if (isAudioFile(file.name)) {
        const buffer = await file.arrayBuffer();
        const info = await engine.loadAudioToDeck(deckId, buffer, file.name);

        let seratoBPM = 0;
        let seratoCues: import('@/lib/serato/seratoMetadata').SeratoCuePoint[] = [];
        let seratoLoops: import('@/lib/serato/seratoMetadata').SeratoLoop[] = [];
        let seratoBeatGrid: import('@/lib/serato/seratoMetadata').SeratoBeatMarker[] = [];
        let seratoKey: string | null = null;
        try {
          const { readSeratoMetadata } = await import('@/lib/serato/seratoMetadata');
          const meta = readSeratoMetadata(buffer);
          seratoBPM = meta.bpm ?? 0;
          seratoCues = meta.cuePoints;
          seratoLoops = meta.loops;
          seratoBeatGrid = meta.beatGrid;
          seratoKey = meta.key;
        } catch { /* Not a Serato-analyzed file */ }

        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: file.name.replace(/\.[^.]+$/, ''),
          detectedBPM: seratoBPM,
          effectiveBPM: seratoBPM,
          totalPositions: 0,
          songPos: 0,
          pattPos: 0,
          elapsedMs: 0,
          isPlaying: false,
          playbackMode: 'audio',
          durationMs: info.duration * 1000,
          audioPosition: 0,
          waveformPeaks: info.waveformPeaks,
          seratoCuePoints: seratoCues,
          seratoLoops: seratoLoops,
          seratoBeatGrid: seratoBeatGrid,
          seratoKey: seratoKey,
        });
      } else if (isUADEFormat(file.name)) {
        const moduleBuffer = await file.arrayBuffer();
        await loadUADEToDeck(engine, deckId, moduleBuffer, file.name, true);
        useDJStore.getState().setDeckViewMode('visualizer');
      } else {
        const song = await parseModuleToSong(file);
        cacheSong(file.name, song);
        const bpmResult = detectBPM(song);
        const moduleBuffer = await file.arrayBuffer();

        useDJStore.getState().setDeckState(deckId, {
          fileName: file.name,
          trackName: song.name || file.name,
          detectedBPM: bpmResult.bpm,
          effectiveBPM: bpmResult.bpm,
          analysisState: 'rendering',
          isPlaying: false,
        });

        try {
          const result = await getDJPipeline().loadOrEnqueue(moduleBuffer, file.name, deckId, 'high');
          await engine.loadAudioToDeck(deckId, result.wavData, file.name, song.name || file.name, result.analysis?.bpm || bpmResult.bpm, song);
          useDJStore.getState().setDeckViewMode('visualizer');
        } catch (err) {
          console.error(`[PixiDJView] Pipeline failed:`, err);
        }
      }
    } catch (err) {
      console.error(`[PixiDJView] Failed to load ${file.name} to deck ${deckId}:`, err);
    }
  }, []);

  // Attach native drag events to the canvas element
  useEffect(() => {
    const canvas = document.querySelector('canvas[data-pixijs]') as HTMLCanvasElement | null
      ?? document.querySelector('#pixi-app canvas') as HTMLCanvasElement | null
      ?? document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const getDeckFromX = (x: number): DeckId => {
      const rect = canvas.getBoundingClientRect();
      const relX = (x - rect.left) / rect.width;
      const state = useDJStore.getState();
      if (state.thirdDeckActive) {
        if (relX < 0.33) return 'A';
        if (relX < 0.66) return 'B';
        return 'C';
      }
      return relX < 0.5 ? 'A' : 'B';
    };

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setDragOverDeck(getDeckFromX(e.clientX));
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (e.dataTransfer?.types.includes('Files')) {
        setDragOverDeck(getDeckFromX(e.clientX));
      }
    };
    const onDragLeave = () => {
      dragCountRef.current--;
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0;
        setDragOverDeck(null);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      const deck = getDeckFromX(e.clientX);
      setDragOverDeck(null);
      const file = e.dataTransfer?.files?.[0];
      if (file) void handleFileDrop(file, deck);
    };

    canvas.addEventListener('dragenter', onDragEnter);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('dragleave', onDragLeave);
    canvas.addEventListener('drop', onDrop);
    return () => {
      canvas.removeEventListener('dragenter', onDragEnter);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('dragleave', onDragLeave);
      canvas.removeEventListener('drop', onDrop);
    };
  }, [handleFileDrop]);

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
      {/* Headless state sync -- runs in ALL view modes */}
      <DeckStateSyncBridge deckId="A" />
      <DeckStateSyncBridge deckId="B" />
      {thirdDeckActive && <DeckStateSyncBridge deckId="C" />}

      {/* Top control bar */}
      <PixiDJTopBar
        browserPanel={browserPanel}
        onBrowserPanelChange={setBrowserPanel}
        samplerOpen={samplerOpen}
        onSamplerToggle={() => setSamplerOpen(p => !p)}
        autoDJOpen={autoDJOpen || autoDJEnabled}
        onAutoDJToggle={() => setAutoDJOpen(p => !p)}
        audioHealth={health?.audioContext ?? null}
      />

      {/* Full-width waveform strip -- Serato-style */}
      <pixiContainer layout={{ width: '100%', height: 120, flexShrink: 0, flexDirection: 'column' }}>
        <PixiDeckWaveform deckId="A" height={60} />
        <PixiDeckWaveform deckId="B" height={60} />
        {/* Sync drift badge overlay */}
        {syncDriftMs !== null && <PixiSyncDriftBadge driftMs={syncDriftMs} />}
      </pixiContainer>

      {/* Crate panel — GL-native tabbed browser, collapses to 0 height when hidden */}
      <pixiContainer eventMode="static" layout={{ width: '100%', height: browserPanel === 'crate' ? 280 : 0, flexShrink: 0 }}>
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

      {/* Drag-and-drop overlay */}
      {dragOverDeck && <PixiDragDropOverlay deckId={dragOverDeck} />}
    </pixiContainer>
  );
};

// ─── Drag-and-Drop Overlay ──────────────────────────────────────────────────

const PixiDragDropOverlay: React.FC<{ deckId: DeckId }> = ({ deckId }) => {
  const deckLabel = `Drop to load Deck ${deckId}`;
  const deckColor = deckId === 'A' ? 0x3b82f6 : deckId === 'B' ? 0xef4444 : 0x22c55e;

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
      }}
      eventMode="none"
    >
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(0, 0, 4000, 4000);
          g.fill({ color: 0x000000, alpha: 0.6 });
          g.rect(0, 0, 4000, 4000);
          g.stroke({ color: deckColor, width: 3, alpha: 0.7 });
        }}
      />
      <pixiContainer layout={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <pixiBitmapText
          text={deckLabel}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 18, fill: deckColor }}
          anchor={0.5}
        />
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
  audioHealth: 'running' | 'suspended' | 'closed' | null;
}

const PixiDJTopBar: React.FC<DJTopBarProps> = ({ browserPanel, onBrowserPanelChange, samplerOpen, onSamplerToggle, autoDJOpen, onAutoDJToggle, audioHealth }) => {
  const deckViewMode = useDJStore(s => s.deckViewMode);
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);
  const vocoderActive = useVocoderStore(s => s.isActive);

  const togglePanel = useCallback((panel: DJBrowserPanel) => {
    onBrowserPanelChange(browserPanel === panel ? 'none' : panel);
  }, [browserPanel, onBrowserPanelChange]);

  const handleVocoderToggle = useCallback(() => {
    const store = useVocoderStore.getState();
    store.setActive(!store.isActive);
  }, []);

  return (
    <PixiViewHeader activeView="dj" title="DEVILBOX DJ" subtitle="DUAL DECK MIXER">

      {/* Controller selector */}
      <PixiDJControllerSelect width={140} height={24} layout={{ height: 28, width: 140 }} />

      {/* FX Quick Presets */}
      <PixiDJFxPresets width={130} height={24} layout={{ height: 28, width: 130 }} />

      {/* Deck view mode (cycle: Visualizer -> Vinyl -> 3D) */}
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

      {/* Vocoder toggle */}
      <PixiButton
        label="Vocoder"
        variant={vocoderActive ? 'ft2' : 'ghost'}
        color={vocoderActive ? 'purple' : undefined}
        size="sm"
        active={vocoderActive}
        onClick={handleVocoderToggle}
      />

      {/* Crate */}
      <PixiButton
        label="Crate"
        variant={browserPanel === 'crate' ? 'ft2' : 'ghost'}
        color="blue"
        size="sm"
        active={browserPanel === 'crate'}
        onClick={() => togglePanel('crate')}
      />

      {/* Audio health badge — only visible when AudioContext is not running */}
      {audioHealth && audioHealth !== 'running' && (
        <PixiAudioHealthBadge state={audioHealth} />
      )}
    </PixiViewHeader>
  );
};

// ─── Audio Health Badge ───────────────────────────────────────────────────────

const PixiAudioHealthBadge: React.FC<{ state: 'suspended' | 'closed' }> = ({ state }) => {
  const theme = usePixiTheme();
  const bgColor = state === 'suspended'
    ? (theme.warning?.color ?? 0xeab308)
    : (theme.error?.color ?? 0xef4444);
  const label = `Audio: ${state}`;
  const badgeW = label.length * 7 + 12;
  const badgeH = 18;

  return (
    <pixiContainer layout={{ height: badgeH, width: badgeW }}>
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.roundRect(0, 0, badgeW, badgeH, 3);
          g.fill({ color: bgColor, alpha: 0.9 });
        }}
      />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        x={badgeW / 2}
        y={badgeH / 2}
        anchor={0.5}
      />
    </pixiContainer>
  );
};

// ─── Sync Drift Badge ─────────────────────────────────────────────────────────

const PixiSyncDriftBadge: React.FC<{ driftMs: number }> = ({ driftMs }) => {
  const theme = usePixiTheme();

  const bgColor = driftMs < 30
    ? (theme.success?.color ?? 0x22c55e)
    : driftMs < 80
      ? (theme.warning?.color ?? 0xeab308)
      : (theme.error?.color ?? 0xef4444);

  const textColor = driftMs >= 30 && driftMs < 80 ? 0x000000 : 0xffffff;
  const label = driftMs < 30 ? 'SYNCED' : `${driftMs}ms`;
  const badgeW = label.length * 7 + 12;
  const badgeH = 16;

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        left: '50%',
        top: '50%',
      }}
    >
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 3);
          g.fill({ color: bgColor, alpha: 0.85 });
        }}
      />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: textColor }}
        anchor={0.5}
      />
    </pixiContainer>
  );
};
