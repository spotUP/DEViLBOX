/**
 * PixiDJView — DJ view for WebGL mode.
 * Layout: Top bar | [Deck A | Mixer | Deck B] (flex row)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixiButton, PixiViewHeader } from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { PixiDJDeck } from './dj/PixiDJDeck';
import { PixiDJMixer } from './dj/PixiDJMixer';
import { PixiDeckWaveform } from './dj/PixiDeckWaveform';
import { PixiDJCratePanel } from './dj/PixiDJCratePanel';
import { useDJStore } from '@stores/useDJStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useUIStore } from '@stores/useUIStore';
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
import { usePixiTheme } from '../theme';
import { DECK_A, DECK_B, DECK_C } from '../colors';
import { PIXI_FONTS } from '../fonts';
import { isAudioFile } from '@lib/audioFileUtils';
import { isUADEFormat } from '@lib/import/formats/UADEParser';
import { loadUADEToDeck } from '@engine/dj/DJUADEPrerender';
import { getDJPipeline } from '@engine/dj/DJPipeline';
import { parseModuleToSong } from '@lib/import/parseModuleToSong';
import { detectBPM } from '@engine/dj/DJBeatDetector';
import type { DeckId } from '@engine/dj/DeckEngine';
import { getScenarioById, getScenariosByCategory } from '@/midi/djScenarioPresets';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';
import { DJRemoteMicReceiver } from '@/engine/dj/DJRemoteMicReceiver';

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
      // Keep DJ audio alive when navigating to companion views (drumpad/vj)
      // or when auto DJ is actively running (must never be interrupted)
      const nextView = useUIStore.getState().activeView;
      const { autoDJEnabled, autoDJStatus, decks } = useDJStore.getState();
      const autoDJActive = autoDJEnabled && autoDJStatus !== 'idle';
      const anyDeckPlaying = decks.A.isPlaying || decks.B.isPlaying || decks.C.isPlaying;
      const keepAudio = nextView === 'drumpad' || nextView === 'vj' || autoDJActive || anyDeckPlaying;

      if (!keepAudio) {
        setDJModeActive(false);
        disposeDJEngine();
        clearSongCache();
      }
      engineRef.current = null;

      if (!keepAudio) {
        const engine = getToneEngine();
        engine.setGlobalPlaybackRate(1.0);
        engine.setGlobalDetune(0);
        engine.releaseAll();
        useTransportStore.getState().setGlobalPitch(0);
      }
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
  const deckColor = deckId === 'A' ? DECK_A : deckId === 'B' ? DECK_B : DECK_C;

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

// ─── Scenario Selector ──────────────────────────────────────────────────────

const SCENARIO_STORAGE_KEY = 'devilbox-dj-scenario-preset';

const PixiDJScenarioSelector: React.FC<{ width?: number; height?: number; layout?: Record<string, unknown> }> = ({
  width = 140,
  height = 24,
  layout: layoutProp,
}) => {
  const [selectedId, setSelectedId] = useState<string>(() =>
    localStorage.getItem(SCENARIO_STORAGE_KEY) || 'open-format',
  );

  const applyScenario = useCallback((id: string) => {
    const scenario = getScenarioById(id);
    if (!scenario) return;

    const store = useDJStore.getState();
    const mapper = getDJControllerMapper();
    const currentPreset = mapper.getPreset();

    if (scenario.jogWheelSensitivity !== undefined) {
      store.setJogWheelSensitivity(scenario.jogWheelSensitivity);
    }
    if (scenario.crossfaderCurve) {
      store.setCrossfaderCurve(scenario.crossfaderCurve);
    }
    if (scenario.keyLockDefault !== undefined) {
      store.setDeckKeyLock('A', scenario.keyLockDefault);
      store.setDeckKeyLock('B', scenario.keyLockDefault);
    }
    if (currentPreset?.manufacturer === 'Generic' && scenario.knobMappings && scenario.padMappings) {
      mapper.setPreset({
        ...currentPreset,
        ccMappings: scenario.knobMappings,
        noteMappings: scenario.padMappings,
      });
    }
  }, []);

  // Apply scenario on mount
  useEffect(() => {
    if (selectedId) applyScenario(selectedId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo((): SelectOption[] => {
    const opts: SelectOption[] = [{ value: '', label: 'Default' }];
    const grouped = getScenariosByCategory();
    for (const [category, presets] of Object.entries(grouped)) {
      for (const p of presets) {
        opts.push({ value: p.id, label: p.name, group: category });
      }
    }
    return opts;
  }, []);

  const handleChange = useCallback((value: string) => {
    setSelectedId(value);
    if (value) {
      applyScenario(value);
      localStorage.setItem(SCENARIO_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(SCENARIO_STORAGE_KEY);
    }
  }, [applyScenario]);

  return (
    <PixiSelect
      options={options}
      value={selectedId}
      onChange={handleChange}
      width={width}
      height={height}
      placeholder="Scenario"
      layout={layoutProp}
    />
  );
};

// ─── Remote Control ─────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const PixiDJRemoteControl: React.FC = () => {
  const theme = usePixiTheme();
  const [showPanel, setShowPanel] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [localIP, setLocalIP] = useState('');
  const [micStatus, setMicStatus] = useState('');
  const receiverRef = useRef<DJRemoteMicReceiver | null>(null);

  const handleToggle = useCallback(async () => {
    if (showPanel) {
      receiverRef.current?.disconnect();
      receiverRef.current = null;
      setShowPanel(false);
      setRoomCode(null);
      setMicStatus('');
      return;
    }
    setShowPanel(true);
    try {
      const ipResp = await fetch(`${API_BASE}/network/local-ip`);
      const { ip } = await ipResp.json();
      setLocalIP(ip);

      const receiver = new DJRemoteMicReceiver();
      receiver.onStatusChange = (s) => setMicStatus(s);
      receiverRef.current = receiver;
      const code = await receiver.createRoom();
      setRoomCode(code);
    } catch (err) {
      console.error('[PixiRemoteControl] Setup failed:', err);
      setMicStatus('error');
    }
  }, [showPanel]);

  useEffect(() => {
    return () => { receiverRef.current?.disconnect(); };
  }, []);

  const controllerURL = localIP && roomCode
    ? `http://${localIP}:5173/controller.html?host=${localIP}&room=${roomCode}`
    : '';

  const handleCopyURL = useCallback(() => {
    if (controllerURL) navigator.clipboard?.writeText(controllerURL);
  }, [controllerURL]);

  const statusColor = micStatus === 'connected'
    ? theme.success.color
    : micStatus === 'waiting'
      ? theme.warning.color
      : theme.textMuted.color;

  return (
    <pixiContainer layout={{ flexDirection: 'column', position: 'relative' }}>
      <PixiButton
        label="Remote"
        variant={showPanel ? 'ft2' : 'ghost'}
        color={showPanel ? 'blue' : undefined}
        size="sm"
        active={showPanel}
        onClick={handleToggle}
      />

      {showPanel && (
        <pixiContainer
          layout={{
            position: 'absolute',
            top: 30,
            right: 0,
            width: 260,
            flexDirection: 'column',
            padding: 10,
            gap: 6,
          }}
          zIndex={100}
        >
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.roundRect(0, 0, 260, roomCode ? 130 : 50, 6);
              g.fill({ color: theme.bgSecondary.color });
              g.roundRect(0, 0, 260, roomCode ? 130 : 50, 6);
              g.stroke({ color: theme.borderLight.color, width: 1 });
            }}
            layout={{ position: 'absolute', top: 0, left: 0, width: 260, height: roomCode ? 130 : 50 }}
          />

          {/* Header */}
          <pixiContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <pixiBitmapText
              text="iPhone Controller"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: theme.text.color }}
            />
            <PixiButton label="X" variant="ghost" size="sm" onClick={handleToggle} />
          </pixiContainer>

          {roomCode ? (
            <pixiContainer layout={{ flexDirection: 'column', gap: 6, width: '100%' }}>
              {/* Room code */}
              <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <pixiBitmapText
                  text="Room:"
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
                />
                <pixiBitmapText
                  text={roomCode}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: theme.accent.color }}
                />
              </pixiContainer>

              {/* URL display */}
              <pixiBitmapText
                text={controllerURL}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: theme.textSecondary.color }}
                layout={{ width: 240 }}
              />

              {/* Copy URL button */}
              <PixiButton label="Copy URL" variant="ghost" size="sm" onClick={handleCopyURL} />

              {/* Mic status */}
              <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <pixiBitmapText
                  text="Mic:"
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
                />
                <pixiBitmapText
                  text={micStatus || 'initializing...'}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: statusColor }}
                />
              </pixiContainer>
            </pixiContainer>
          ) : (
            <pixiBitmapText
              text="Setting up..."
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: theme.textMuted.color }}
            />
          )}
        </pixiContainer>
      )}
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
    <PixiViewHeader activeView="dj" title="" subtitle="">

      {/* Controller selector */}
      <PixiDJControllerSelect width={140} height={24} layout={{ height: 28, width: 140 }} />

      {/* Scenario selector */}
      <PixiDJScenarioSelector width={140} height={24} layout={{ height: 28, width: 140 }} />

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

      {/* Remote Control */}
      <PixiDJRemoteControl />

      {/* Crate */}
      <PixiButton
        label="Crate"
        variant={browserPanel === 'crate' ? 'ft2' : 'ghost'}
        color="blue"
        size="sm"
        active={browserPanel === 'crate'}
        onClick={() => togglePanel('crate')}
      />

    </PixiViewHeader>
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
