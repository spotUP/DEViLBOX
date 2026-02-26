/**
 * PixiTrackerView — Tracker view for WebGL mode.
 * Layout: FT2Toolbar (top) | Editor controls bar | Main area split:
 *   [PatternEditorCanvas (flex) | InstrumentList (side panel)]
 *
 * The pattern editor grid and instrument list are DOM <canvas>/<div> overlays
 * (via PixiDOMOverlay), positioned within the PixiJS layout regions.
 *
 * Keyboard input (useTrackerInput) and block operations (useBlockOperations)
 * are hooked here — they only attach window event listeners, no DOM rendering.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiButton, PixiNumericInput } from '../components';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { PixiFT2Toolbar } from './tracker/PixiFT2Toolbar';
import { PixiInstrumentPanel } from './tracker/PixiInstrumentPanel';
import { PixiChannelVUMeters } from './tracker/PixiChannelVUMeters';
import { PixiPatternMinimap } from './tracker/PixiPatternMinimap';
import { PixiAutomationLanes } from './tracker/PixiAutomationLanes';
import { PixiMacroLanes } from './tracker/PixiMacroLanes';
import { PixiMacroSlotsPanel } from './tracker/PixiMacroSlotsPanel';
import { PixiMIDIKnobBar } from './tracker/PixiMIDIKnobBar';
import { PixiRandomizeDialog } from '../dialogs/PixiRandomizeDialog';
import { PixiAcidPatternDialog } from '../dialogs/PixiAcidPatternDialog';
import { PixiFurnaceView } from './furnace/PixiFurnaceView';
import { PixiHivelyView } from './hively/PixiHivelyView';
import { PixiPatternEditor } from './tracker/PixiPatternEditor';
import { PixiGridSequencer } from './tracker/PixiGridSequencer';
import { PixiTB303View } from './tracker/PixiTB303View';
import { PixiPianoRollView } from './PixiPianoRollView';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@/hooks/tracker/BlockOperations';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useAudioStore } from '@stores/useAudioStore';
import { useFPSMonitor } from '@/hooks/useFPSMonitor';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { SYSTEM_PRESETS, getGroupedPresets } from '@/constants/systemPresets';
import { notify } from '@stores/useNotificationStore';
import { useThemeStore } from '@stores/useThemeStore';
import { PatternManagement } from '@/components/pattern/PatternManagement';
/** Deferred pitch slider — avoids circular import from @engine/PatternScheduler */
const PitchSliderOverlay: React.FC = () => {
  const [Comp, setComp] = useState<React.ComponentType<{ className?: string }> | null>(null);
  useEffect(() => {
    import('@/components/transport/DJPitchSlider').then(m => setComp(() => m.DJPitchSlider));
  }, []);
  return Comp ? <Comp className="h-full" /> : null;
};

/** Deferred TB303KnobPanel — dynamic import avoids circular deps */
const TB303KnobPanelOverlay: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    import('@components/tracker/TB303KnobPanel').then(m => setComp(() => m.TB303KnobPanel));
  }, []);
  if (!visible || !Comp) return null;
  return <Comp />;
};

/** Generate theme-aware inline styles for DOM <select> overlays */
const useSelectStyle = (variant: 'default' | 'accent' = 'default'): React.CSSProperties => {
  const themeColors = useThemeStore(s => s.getCurrentTheme().colors);
  return {
    width: '100%',
    height: '100%',
    padding: '0 4px',
    fontSize: '11px',
    fontFamily: 'monospace',
    background: themeColors.bg,
    color: variant === 'accent' ? themeColors.accent : themeColors.text,
    border: `1px solid ${themeColors.border}`,
    borderRadius: '3px',
    cursor: 'pointer',
    outline: 'none',
  };
};

type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303' | 'arrangement' | 'dj' | 'drumpad';

const PATTERN_PANEL_HEIGHT = 180;

const FT2_TOOLBAR_HEIGHT = 160; // DOM FT2Toolbar via PixiDOMOverlay: ~120px content + ~28px menu + padding

export const PixiTrackerView: React.FC = () => {
  // Enable FT2-style keyboard input (window event listeners — no DOM needed)
  useTrackerInput();
  useBlockOperations();

  const [viewMode, setViewMode] = useState<ViewMode>('tracker');
  const [gridChannelIndex, setGridChannelIndex] = useState(0);
  const showPatterns = useUIStore(s => s.showPatterns);
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const editorMode = useTrackerStore(s => s.editorMode);
  const { width: windowWidth, height: windowHeight } = usePixiResponsive();
  const showMacroSlots = useUIStore(s => s.showMacroSlots);
  const [showInstrumentPanel, setShowInstrumentPanel] = useState(true);

  // Hide instrument panel on narrow windows (matches DOM TrackerView)
  const canShowInstrumentPanel = windowWidth >= 900;
  const instrumentPanelVisible = viewMode !== 'tb303' && canShowInstrumentPanel && showInstrumentPanel;
  const INSTRUMENT_PANEL_W = 200;

  // Pattern data for automation/macro lanes overlay
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const showAutomation = useUIStore(s => s.showAutomationLanes);
  const showMacroLanes = useUIStore(s => s.showMacroLanes);
  const currentPattern = patterns[currentPatternIndex];
  const patternId = currentPattern?.id || '';
  const patternLength = currentPattern?.length || 64;
  const channelCount = currentPattern?.channels?.length || 4;
  const ROW_HEIGHT = 18; // matches PatternEditorCanvas default row height

  // Adjacent pattern IDs for ghost automation curves
  const prevPositionIdx = currentPositionIndex > 0 ? currentPositionIndex - 1 : -1;
  const nextPositionIdx = currentPositionIndex < patternOrder.length - 1 ? currentPositionIndex + 1 : -1;
  const prevPatternId = prevPositionIdx >= 0 ? patterns[patternOrder[prevPositionIdx]]?.id : undefined;
  const prevPatternLength = prevPositionIdx >= 0 ? patterns[patternOrder[prevPositionIdx]]?.length : undefined;
  const nextPatternId = nextPositionIdx >= 0 ? patterns[patternOrder[nextPositionIdx]]?.id : undefined;
  const nextPatternLength = nextPositionIdx >= 0 ? patterns[patternOrder[nextPositionIdx]]?.length : undefined;

  // Compute instrument panel height: window minus navbar(76) + toolbar(160) + controls(32) + statusbar(32) + optional pattern panel
  const NAVBAR_H = 98; // NavBar(45px) + TabBar(41px) + borders+padding — must match PixiNavBar height
  const STATUSBAR_H = 32; // must match PixiStatusBar STATUS_BAR_HEIGHT
  const CONTROLS_BAR_H = 32;
  const MACRO_SLOTS_H = showMacroSlots ? 32 : 0;
  const instrumentPanelHeight = windowHeight - NAVBAR_H - FT2_TOOLBAR_HEIGHT - CONTROLS_BAR_H - STATUSBAR_H - MACRO_SLOTS_H - (showPatterns ? PATTERN_PANEL_HEIGHT : 0);
  const editorWidth = windowWidth - (instrumentPanelVisible ? INSTRUMENT_PANEL_W : 0) - 16; // minus instrument panel and minimap

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* FT2 Toolbar + Menu bar — native Pixi rendering */}
      <PixiFT2Toolbar />

      {/* TB-303 Knob Panel — shown when not in TB-303 view (matches DOM TrackerView) */}
      <PixiDOMOverlay
        layout={{ width: '100%', height: 0 }}
        style={{ overflow: 'visible', zIndex: 34 }}
        autoHeight
      >
        <TB303KnobPanelOverlay visible={viewMode !== 'tb303'} />
      </PixiDOMOverlay>

      {/* Editor controls bar — DOM overlay for 1:1 parity */}
      <PixiEditorControlsBarOverlay viewMode={viewMode} onViewModeChange={setViewMode} gridChannelIndex={gridChannelIndex} onGridChannelChange={setGridChannelIndex} />

      {/* Pattern management panel (collapsible) — always mounted, height:0 when hidden
          to avoid Yoga node swap errors in @pixi/layout */}
      <PixiDOMOverlay
        layout={{ width: '100%', height: showPatterns ? PATTERN_PANEL_HEIGHT : 0 }}
        style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        {showPatterns && <PatternManagement />}
      </PixiDOMOverlay>

      {/* Main content: editor + instrument panel */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          height: instrumentPanelHeight,
          flexDirection: 'row',
        }}
      >
        {/* Editor area with overlays */}
        <pixiContainer layout={{ flex: 1, width: '100%', height: '100%' }}>
          {/* Editor — native Pixi components for each view mode.
              All editors are ALWAYS mounted to avoid @pixi/layout BindingError
              when swapping Yoga child nodes. Visibility controlled via visible +
              zero layout dimensions. */}

          {/* Classic tracker pattern editor — native Pixi */}
          <pixiContainer
            visible={viewMode === 'tracker' && editorMode === 'classic'}
            layout={{
              flex: viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0,
              height: viewMode === 'tracker' && editorMode === 'classic' ? '100%' : 0,
              width: viewMode === 'tracker' && editorMode === 'classic' ? '100%' : 0,
            }}
          >
            <PixiPatternEditor width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* Grid sequencer — native Pixi */}
          <pixiContainer
            visible={viewMode === 'grid'}
            layout={{
              flex: viewMode === 'grid' ? 1 : 0,
              height: viewMode === 'grid' ? '100%' : 0,
              width: viewMode === 'grid' ? '100%' : 0,
            }}
          >
            <PixiGridSequencer channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* Piano Roll — native Pixi (existing PixiPianoRollView) */}
          <pixiContainer
            visible={viewMode === 'pianoroll'}
            layout={{
              flex: viewMode === 'pianoroll' ? 1 : 0,
              height: viewMode === 'pianoroll' ? '100%' : 0,
              width: viewMode === 'pianoroll' ? '100%' : 0,
            }}
          >
            <PixiPianoRollView />
          </pixiContainer>

          {/* TB-303 view — native Pixi */}
          <pixiContainer
            visible={viewMode === 'tb303'}
            layout={{
              flex: viewMode === 'tb303' ? 1 : 0,
              height: viewMode === 'tb303' ? '100%' : 0,
              width: viewMode === 'tb303' ? '100%' : 0,
            }}
          >
            <PixiTB303View channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* Furnace / Hively — still DOM-based, via PixiDOMOverlay */}
          <PixiDOMOverlay
            layout={{
              flex: viewMode === 'tracker' && (editorMode === 'furnace' || editorMode === 'hively') ? 1 : 0,
              height: viewMode === 'tracker' && (editorMode === 'furnace' || editorMode === 'hively') ? '100%' : 0,
              width: viewMode === 'tracker' && (editorMode === 'furnace' || editorMode === 'hively') ? '100%' : 0,
            }}
            style={{ overflow: 'hidden' }}
          >
            {viewMode === 'tracker' && editorMode === 'furnace' ? (
              <AutoSizeFurnaceView />
            ) : viewMode === 'tracker' && editorMode === 'hively' ? (
              <AutoSizeHivelyView />
            ) : null}
          </PixiDOMOverlay>

          {/* Overlays — ALWAYS mounted to avoid @pixi/layout Yoga insertChild crash.
              Conditional mount/unmount of Pixi children triggers BindingError in
              Emscripten's Yoga WASM binding. Use visible + layout sizing instead. */}
          {/* VU meters overlay — covers top half of editor down to the edit bar.
              VU segments draw upward from the bottom of this area, so they
              appear to shoot out from the edit cursor row.
              Height accounts for PixiPatternEditor internal layout:
              scrollbar(12) + header(28) + grid, with cursor centered in grid. */}
          {(() => {
            const PE_SCROLLBAR = 12;  // PixiPatternEditor top scrollbar
            const PE_HEADER = 28;     // PixiPatternEditor channel header
            const PE_ROW = 24;        // PixiPatternEditor row height
            const gridH = instrumentPanelHeight - PE_HEADER - PE_SCROLLBAR;
            const vuHeight = Math.max(50, Math.floor(PE_SCROLLBAR + PE_HEADER + (gridH - PE_ROW) / 2));
            return (
              <pixiContainer visible={viewMode === 'tracker' && editorMode === 'classic'} layout={{ position: 'absolute', width: Math.max(100, editorWidth), height: vuHeight }}>
                <PixiChannelVUMeters width={Math.max(100, editorWidth)} height={vuHeight} />
              </pixiContainer>
            );
          })()}
          <pixiContainer visible={viewMode === 'tracker' && showAutomation && !!patternId} layout={{ position: 'absolute' }}>
            <PixiAutomationLanes
              width={Math.max(100, editorWidth)}
              height={Math.max(100, instrumentPanelHeight)}
              patternId={patternId || ''}
              patternLength={patternLength}
              rowHeight={ROW_HEIGHT}
              channelCount={channelCount}
              prevPatternId={prevPatternId}
              prevPatternLength={prevPatternLength}
              nextPatternId={nextPatternId}
              nextPatternLength={nextPatternLength}
            />
          </pixiContainer>
          <pixiContainer visible={viewMode === 'tracker' && showMacroLanes} layout={{ position: 'absolute' }}>
            <PixiMacroLanes
              width={Math.max(100, editorWidth)}
              height={Math.max(100, instrumentPanelHeight)}
              patternLength={patternLength}
              rowHeight={ROW_HEIGHT}
              channelCount={channelCount}
            />
          </pixiContainer>
        </pixiContainer>

        {/* Pattern minimap — always mounted, zero-width when hidden */}
        <pixiContainer visible={viewMode === 'tracker'} layout={{ width: viewMode === 'tracker' ? 16 : 0 }}>
          <PixiPatternMinimap height={Math.max(100, instrumentPanelHeight)} />
        </pixiContainer>

        {/* Pitch slider — DOM overlay, matches DOM TrackerView layout */}
        <PixiDOMOverlay
          layout={{ width: 32, height: Math.max(100, instrumentPanelHeight) }}
          style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
        >
          <PitchSliderOverlay />
        </PixiDOMOverlay>

        {/* Instrument panel toggle button — always mounted, zero-width when hidden */}
        <PixiDOMOverlay
          layout={{ width: canShowInstrumentPanel && viewMode !== 'tb303' ? 24 : 0, height: '100%' }}
          style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
        >
          {canShowInstrumentPanel && viewMode !== 'tb303' && (
            <button
              onClick={() => setShowInstrumentPanel(p => !p)}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-secondary)',
                border: 'none',
                cursor: 'pointer',
                color: instrumentPanelVisible ? 'var(--color-accent)' : 'var(--color-text-dim)',
                fontSize: '14px',
                padding: 0,
              }}
              title={instrumentPanelVisible ? 'Hide Instruments' : 'Show Instruments'}
            >
              {instrumentPanelVisible ? '\u25B6' : '\u25C0'}
            </button>
          )}
        </PixiDOMOverlay>

        {/* Instrument list — always mounted, zero-width when hidden */}
        <pixiContainer visible={instrumentPanelVisible} layout={{ width: instrumentPanelVisible ? INSTRUMENT_PANEL_W : 0, height: '100%' }}>
          <PixiInstrumentPanel width={INSTRUMENT_PANEL_W} height={Math.max(100, instrumentPanelHeight)} />
        </pixiContainer>
      </pixiContainer>

      {/* Macro Slots Panel — always mounted, zero-height when hidden */}
      <pixiContainer visible={showMacroSlots && viewMode === 'tracker'} layout={{ width: '100%', height: showMacroSlots && viewMode === 'tracker' ? 32 : 0 }}>
        <PixiMacroSlotsPanel width={windowWidth} />
      </pixiContainer>

      {/* MIDI Knob Bar */}
      <PixiMIDIKnobBar width={windowWidth} />

      {/* Pixi-native dialogs (rendered in Pixi canvas, triggered via modalOpen state) */}
      <PixiRandomizeDialog
        isOpen={modalOpen === 'randomize'}
        onClose={closeModal}
        channelIndex={gridChannelIndex}
      />
      <PixiAcidPatternDialog
        isOpen={modalOpen === 'acidPattern'}
        onClose={closeModal}
        channelIndex={gridChannelIndex}
      />
    </pixiContainer>
  );
};

// ─── Auto-sizing wrappers for format-specific editors ───────────────────────

const AutoSizeFurnaceView: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) setSize({ width: w, height: h });
      }
    });
    obs.observe(el);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) setSize({ width: w, height: h });
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <PixiFurnaceView width={size.width} height={size.height} />
    </div>
  );
};

const AutoSizeHivelyView: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        // Only update when we have real dimensions — the PixiDOMOverlay portal
        // starts with display:none, so clientWidth/Height are 0 until the Yoga
        // layout is computed. Updating to (0,0) would make the view black.
        if (w > 0 && h > 0) setSize({ width: w, height: h });
      }
    });
    obs.observe(el);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) setSize({ width: w, height: h });
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <PixiHivelyView width={size.width} height={size.height} />
    </div>
  );
};

// ─── Editor Controls Bar (DOM Overlay) ──────────────────────────────────────

interface EditorControlsBarOverlayProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (index: number) => void;
}

/**
 * Lazy-loaded DOM EditorControlsBar rendered via PixiDOMOverlay
 * for pixel-perfect parity with the DOM tracker view.
 */
const EditorControlsBarInner: React.FC<EditorControlsBarOverlayProps> = ({ viewMode, onViewModeChange, gridChannelIndex, onGridChannelChange }) => {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import('@components/tracker/EditorControlsBar').then(m => setComp(() => m.EditorControlsBar));
  }, []);
  if (!Comp) return null;
  return (
    <Comp
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      gridChannelIndex={gridChannelIndex}
      onGridChannelChange={onGridChannelChange}
    />
  );
};

const PixiEditorControlsBarOverlay: React.FC<EditorControlsBarOverlayProps> = (props) => {
  return (
    <PixiDOMOverlay
      layout={{ width: '100%', height: 32 }}
      style={{ overflow: 'visible', zIndex: 33 }}
      autoHeight
    >
      <EditorControlsBarInner {...props} />
    </PixiDOMOverlay>
  );
};

/* Legacy Pixi editor controls bar — replaced by DOM EditorControlsBar via PixiDOMOverlay above */
// @ts-expect-error Legacy code kept for reference, not actively used
const _LegacyPixiEditorControlsBar: React.FC<EditorControlsBarOverlayProps> = ({ viewMode, onViewModeChange, gridChannelIndex, onGridChannelChange }) => {
  const theme = usePixiTheme();
  const fps = useFPSMonitor();
  const selectStyle = useSelectStyle('default');
  const selectStyleAccent = useSelectStyle('accent');

  // Store subscriptions
  const songLength = useTrackerStore(s => s.patternOrder.length);
  const channelCount = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels?.length || 4;
  });
  const patternLength = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.length || 64;
  });
  const resizePattern = useTrackerStore(s => s.resizePattern);
  const recordMode = useTrackerStore(s => s.recordMode);
  const showGhostPatterns = useTrackerStore(s => s.showGhostPatterns);
  const grooveTemplateId = useTransportStore(s => s.grooveTemplateId);
  const setGrooveTemplate = useTransportStore(s => s.setGrooveTemplate);
  const smoothScrolling = useTransportStore(s => s.smoothScrolling);
  const masterMuted = useAudioStore(s => s.masterMuted);
  const statusMessage = useUIStore(s => s.statusMessage);

  const grooveName = GROOVE_TEMPLATES.find(t => t.id === grooveTemplateId)?.name || 'Straight';
  const grooveIndex = GROOVE_TEMPLATES.findIndex(t => t.id === grooveTemplateId);
  const grooveActive = grooveTemplateId !== 'straight';

  const handleInsertPosition = useCallback(() => {
    const { patternOrder, currentPositionIndex, setPatternOrder, setCurrentPosition } = useTrackerStore.getState();
    const patIdx = patternOrder[currentPositionIndex] ?? 0;
    const newOrder = [...patternOrder];
    newOrder.splice(currentPositionIndex + 1, 0, patIdx);
    setPatternOrder(newOrder);
    setCurrentPosition(currentPositionIndex + 1);
  }, []);

  const handleDeletePosition = useCallback(() => {
    const { patternOrder, currentPositionIndex, setPatternOrder, setCurrentPosition } = useTrackerStore.getState();
    if (patternOrder.length <= 1) return;
    const newOrder = [...patternOrder];
    newOrder.splice(currentPositionIndex, 1);
    setPatternOrder(newOrder);
    if (currentPositionIndex >= newOrder.length) {
      setCurrentPosition(newOrder.length - 1);
    }
  }, []);

  const handlePatternLengthPreset = useCallback((preset: number) => {
    resizePattern(useTrackerStore.getState().currentPatternIndex, preset);
  }, [resizePattern]);

  const handleCycleGroove = useCallback((delta: number) => {
    const newIndex = ((grooveIndex + delta) % GROOVE_TEMPLATES.length + GROOVE_TEMPLATES.length) % GROOVE_TEMPLATES.length;
    setGrooveTemplate(GROOVE_TEMPLATES[newIndex].id);
  }, [grooveIndex, setGrooveTemplate]);

  const handleLengthChange = useCallback((newLength: number) => {
    if (newLength >= 1 && newLength <= 256) {
      resizePattern(useTrackerStore.getState().currentPatternIndex, newLength);
    }
  }, [resizePattern]);

  const handleToggleRecord = useCallback(() => {
    useTrackerStore.getState().toggleRecordMode();
  }, []);

  const handleToggleGhosts = useCallback(() => {
    const s = useTrackerStore.getState();
    s.setShowGhostPatterns(!s.showGhostPatterns);
  }, []);

  const handleToggleMute = useCallback(() => {
    useAudioStore.getState().toggleMasterMute();
  }, []);

  const handleToggleSmooth = useCallback(() => {
    const s = useTransportStore.getState();
    s.setSmoothScrolling(!s.smoothScrolling);
  }, []);

  const handleGrooveSettings = useCallback(() => {
    useUIStore.getState().openModal('grooveSettings');
  }, []);

  // Overlay toggles
  const showAutoLanes = useUIStore(s => s.showAutomationLanes);
  const showMacLanes = useUIStore(s => s.showMacroLanes);
  const showMacSlots = useUIStore(s => s.showMacroSlots);

  const handleToggleAutoLanes = useCallback(() => {
    useUIStore.getState().toggleAutomationLanes();
  }, []);
  const handleToggleMacroLanes = useCallback(() => {
    useUIStore.getState().toggleMacroLanes();
  }, []);
  const handleToggleMacroSlots = useCallback(() => {
    useUIStore.getState().toggleMacroSlots();
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 32);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, 31, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: 32,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: 32 }} />

      {/* View Mode Selector */}
      <PixiDOMOverlay
        layout={{ height: 24, width: 90 }}
        style={{ overflow: 'visible' }}
      >
        <select
          value={viewMode}
          onChange={(e) => {
            const v = e.target.value as ViewMode;
            // Defer to break cross-reconciler sync: this DOM event handler calls
            // a Pixi reconciler state setter, which can corrupt @pixi/layout's
            // Yoga tree if the commit runs during react-dom's event dispatch.
            if (v === 'arrangement' || v === 'dj' || v === 'drumpad') {
              // These are global views — switch via useUIStore
              setTimeout(() => useUIStore.getState().setActiveView(v), 0);
            } else {
              setTimeout(() => onViewModeChange(v), 0);
            }
          }}
          style={selectStyle}
        >
          <option value="tracker">Tracker</option>
          <option value="grid">Grid</option>
          <option value="pianoroll">Piano Roll</option>
          <option value="tb303">TB-303</option>
          <option value="arrangement">Arrangement</option>
          <option value="dj">DJ Mixer</option>
          <option value="drumpad">Drum Pads</option>
          <option value="vj">VJ View</option>
        </select>
      </PixiDOMOverlay>

      {/* Channel selector (for grid/pianoroll/tb303 modes).
          Always rendered to avoid Yoga node swap errors — hidden via width:0 in tracker mode. */}
      <PixiDOMOverlay
        layout={{ height: 24, width: viewMode !== 'tracker' ? 56 : 0 }}
        style={{ overflow: 'visible' }}
      >
        {viewMode !== 'tracker' && (
          <select
            value={gridChannelIndex}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTimeout(() => onGridChannelChange(v), 0);
            }}
            style={selectStyleAccent}
          >
            {Array.from({ length: channelCount }, (_, i) => (
              <option key={i} value={i}>Ch {i + 1}</option>
            ))}
          </select>
        )}
      </PixiDOMOverlay>

      <PixiControlsSep />

      {/* Song Length */}
      <PixiControlsSection label="SONG">
        <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <pixiBitmapText
            text={String(songLength)}
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
        </pixiContainer>
      </PixiControlsSection>

      {/* Insert / Delete Position */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        <PixiButton label="INS" variant="ghost" size="sm" onClick={handleInsertPosition} />
        <PixiButton label="DEL" variant="ghost" size="sm" onClick={handleDeletePosition} />
      </pixiContainer>

      <PixiControlsSep />

      {/* Pattern Length with presets */}
      <PixiControlsSection label="LEN">
        <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <PixiNumericInput
            value={patternLength}
            min={1}
            max={256}
            onChange={handleLengthChange}
            width={44}
          />
          <PixiButton label="16" variant="ghost" size="sm" onClick={() => handlePatternLengthPreset(16)} />
          <PixiButton label="32" variant="ghost" size="sm" onClick={() => handlePatternLengthPreset(32)} />
          <PixiButton label="64" variant="ghost" size="sm" onClick={() => handlePatternLengthPreset(64)} />
          <PixiButton label="128" variant="ghost" size="sm" onClick={() => handlePatternLengthPreset(128)} />
        </pixiContainer>
      </PixiControlsSection>

      <PixiControlsSep />

      {/* Groove */}
      <PixiControlsSection label="GRV">
        <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <PixiButton label="<" variant="ghost" size="sm" onClick={() => handleCycleGroove(-1)} />
          <PixiButton
            label={grooveName}
            variant={grooveActive ? 'ft2' : 'ghost'}
            color={grooveActive ? 'blue' : undefined}
            size="sm"
            active={grooveActive}
            onClick={handleGrooveSettings}
          />
          <PixiButton label=">" variant="ghost" size="sm" onClick={() => handleCycleGroove(1)} />
        </pixiContainer>
      </PixiControlsSection>

      <PixiControlsSep />

      {/* Ghost Patterns */}
      <PixiButton
        label="Ghosts"
        variant={showGhostPatterns ? 'ft2' : 'ghost'}
        color={showGhostPatterns ? 'blue' : undefined}
        size="sm"
        active={showGhostPatterns}
        onClick={handleToggleGhosts}
      />

      {/* REC button + settings */}
      <PixiButton
        label="REC"
        variant={recordMode ? 'ft2' : 'ghost'}
        color={recordMode ? 'red' : undefined}
        size="sm"
        active={recordMode}
        onClick={handleToggleRecord}
      />
      <PixiButton
        label="..."
        variant="ghost"
        size="sm"
        onClick={() => useUIStore.getState().openModal('settings')}
      />

      {/* Master Mute */}
      <PixiButton
        label={masterMuted ? 'Unmute' : 'Mute'}
        variant={masterMuted ? 'ft2' : 'ghost'}
        color={masterMuted ? 'red' : undefined}
        size="sm"
        active={masterMuted}
        onClick={handleToggleMute}
      />

      {/* Smooth / Stepped scrolling */}
      <PixiButton
        label={smoothScrolling ? 'Smooth' : 'Stepped'}
        variant={smoothScrolling ? 'ft2' : 'ghost'}
        color={smoothScrolling ? 'blue' : undefined}
        size="sm"
        active={smoothScrolling}
        onClick={handleToggleSmooth}
      />

      <PixiControlsSep />

      {/* Overlay toggles */}
      <PixiButton
        label="Auto"
        variant={showAutoLanes ? 'ft2' : 'ghost'}
        color={showAutoLanes ? 'blue' : undefined}
        size="sm"
        active={showAutoLanes}
        onClick={handleToggleAutoLanes}
      />
      <PixiButton
        label="Macro"
        variant={showMacLanes ? 'ft2' : 'ghost'}
        color={showMacLanes ? 'blue' : undefined}
        size="sm"
        active={showMacLanes}
        onClick={handleToggleMacroLanes}
      />
      <PixiButton
        label="Slots"
        variant={showMacSlots ? 'ft2' : 'ghost'}
        color={showMacSlots ? 'blue' : undefined}
        size="sm"
        active={showMacSlots}
        onClick={handleToggleMacroSlots}
      />

      <PixiControlsSep />

      {/* Hardware System Preset Selector */}
      <PixiHardwarePresetSelector />

      {/* Subsong Selector (only shown for Furnace multi-subsong modules) */}
      <PixiSubsongSelector />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* FPS / Quality indicator */}
      <pixiBitmapText
        text={`${fps.averageFps}FPS`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={fps.quality === 'high' ? theme.success.color : fps.quality === 'medium' ? theme.warning.color : theme.error.color}
        layout={{}}
      />

      {/* Status message */}
      {statusMessage && (
        <pixiBitmapText
          text={statusMessage.toUpperCase()}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ marginLeft: 8 }}
        />
      )}
    </pixiContainer>
  );
};

// ─── Hardware System Preset Selector ────────────────────────────────────────

const PixiHardwarePresetSelector: React.FC = () => {
  const applySystemPreset = useTrackerStore(s => s.applySystemPreset);
  const selectStyle = useSelectStyle('default');

  const groupedPresets = useMemo(() => getGroupedPresets(), []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    if (presetId === 'none') return;
    applySystemPreset(presetId);
    const preset = SYSTEM_PRESETS.find(p => p.id === presetId);
    notify.success(`Hardware System: ${preset?.name.toUpperCase() ?? presetId}`);
  }, [applySystemPreset]);

  return (
    <PixiDOMOverlay
      layout={{ height: 24, width: 160 }}
      style={{ overflow: 'visible' }}
    >
      <select
        onChange={handleChange}
        defaultValue="none"
        title="Select Hardware System Preset (NES, SMS, Genesis, etc.)"
        style={selectStyle}
      >
        <option value="none" disabled>HW SYSTEM...</option>
        {groupedPresets.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.presets.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.name.toUpperCase()}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </PixiDOMOverlay>
  );
};

// ─── Subsong Selector ───────────────────────────────────────────────────────

const PixiSubsongSelector: React.FC = () => {
  const selectStyle = useSelectStyle('accent');
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const patterns = useTrackerStore(s => s.patterns);
  const loadPatterns = useTrackerStore(s => s.loadPatterns);
  const setPatternOrder = useTrackerStore(s => s.setPatternOrder);
  const setBPM = useTransportStore(s => s.setBPM);
  const setSpeed = useTransportStore(s => s.setSpeed);

  const pattern = patterns[currentPatternIndex];
  const furnaceData = pattern?.importMetadata?.furnaceData;

  const subsongNames: string[] = useMemo(() => furnaceData?.subsongNames || [], [furnaceData?.subsongNames]);
  const allSubsongs: any[] = useMemo(() => furnaceData?.allSubsongs || [], [furnaceData?.allSubsongs]);

  const handleSubsongChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSubsongIndex = Number(e.target.value);
    if (!furnaceData) return;
    const currentSubsong = furnaceData.currentSubsong ?? 0;
    if (newSubsongIndex === currentSubsong) return;

    if (newSubsongIndex === 0) {
      notify.success(`Switched to: ${subsongNames[0]}`);
      useTrackerStore.setState((state) => {
        const firstPattern = state.patterns[0];
        if (firstPattern?.importMetadata?.furnaceData) {
          firstPattern.importMetadata.furnaceData.currentSubsong = 0;
        }
      });
    } else {
      const subsongData = allSubsongs.find((s: { subsongIndex: number }) => s.subsongIndex === newSubsongIndex);
      if (!subsongData) {
        notify.error(`Subsong ${newSubsongIndex} data not found`);
        return;
      }

      // Convert raw cells to Pattern objects
      const newPatterns = subsongData.patterns.map((patternChannels: any[][], patIdx: number) => {
        const patternLength = Math.max(...patternChannels.map((ch: any[]) => ch.length));
        const channels = patternChannels.map((rows: any[], chIdx: number) => ({
          id: `ch-${Date.now()}-${chIdx}`,
          name: `Channel ${chIdx + 1}`,
          rows: rows.slice(0, patternLength),
          muted: false,
          solo: false,
          collapsed: false,
          volume: 80,
          pan: 0,
          instrumentId: null,
          color: null,
        }));
        return {
          id: `pat-${Date.now()}-${patIdx}`,
          name: `Subsong ${newSubsongIndex} Pattern ${patIdx}`,
          length: patternLength,
          channels,
          importMetadata: pattern?.importMetadata,
        };
      });

      loadPatterns(newPatterns);
      setPatternOrder(subsongData.patternOrderTable || Array.from({ length: subsongData.ordersLen || 1 }, (_: unknown, i: number) => i));
      setBPM(subsongData.initialBPM || 120);
      setSpeed(subsongData.initialSpeed || 6);

      useTrackerStore.setState((state) => {
        const firstPattern = state.patterns[0];
        if (firstPattern?.importMetadata?.furnaceData) {
          firstPattern.importMetadata.furnaceData.currentSubsong = newSubsongIndex;
        }
      });

      notify.success(`Switched to: ${subsongNames[newSubsongIndex] || `Subsong ${newSubsongIndex + 1}`}`);
    }
  }, [furnaceData, subsongNames, allSubsongs, pattern, loadPatterns, setPatternOrder, setBPM, setSpeed]);

  // Only show if there are multiple subsongs
  if (!furnaceData || !furnaceData.subsongCount || furnaceData.subsongCount <= 1) {
    return null;
  }

  const currentSubsong = furnaceData.currentSubsong ?? 0;

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      <PixiDOMOverlay
        layout={{ height: 24, width: 140 }}
        style={{ overflow: 'visible' }}
      >
        <select
          value={currentSubsong}
          onChange={handleSubsongChange}
          title="Select subsong (Furnace multi-song module)"
          style={selectStyle}
        >
          {subsongNames.map((name: string, idx: number) => (
            <option key={idx} value={idx}>
              {idx + 1}. {name || `Subsong ${idx + 1}`}
            </option>
          ))}
        </select>
      </PixiDOMOverlay>
    </pixiContainer>
  );
};

const PixiControlsSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
      />
      {children}
    </pixiContainer>
  );
};

const PixiControlsSep: React.FC = () => {
  const theme = usePixiTheme();
  return (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear();
        g.rect(0, 4, 1, 24);
        g.fill({ color: theme.border.color, alpha: 0.25 });
      }}
      layout={{ width: 1, height: 32 }}
    />
  );
};
