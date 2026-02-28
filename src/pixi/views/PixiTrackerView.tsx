/**
 * PixiTrackerView — Tracker view for WebGL mode.
 * Layout: FT2Toolbar (top) | [TB303KnobPanel] | Editor controls bar |
 *   [PatternManagement] | Main area split:
 *   [PitchSlider | PatternEditor (flex) | InstrumentList (side panel)]
 *
 * Pure Pixi rendering — no DOM overlays.
 *
 * Keyboard input (useTrackerInput) and block operations (useBlockOperations)
 * are hooked here — they only attach window event listeners, no DOM rendering.
 */

import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiFT2Toolbar, FT2_TOOLBAR_HEIGHT, FT2_TOOLBAR_HEIGHT_COMPACT } from './tracker/PixiFT2Toolbar';
import { PixiInstrumentPanel } from './tracker/PixiInstrumentPanel';
import { PixiChannelVUMeters } from './tracker/PixiChannelVUMeters';
import { PixiPatternMinimap } from './tracker/PixiPatternMinimap';
import { PixiAutomationLanes } from './tracker/PixiAutomationLanes';
import { PixiMacroLanes } from './tracker/PixiMacroLanes';
import { PixiMacroSlotsPanel } from './tracker/PixiMacroSlotsPanel';
import { PixiMIDIKnobBar } from './tracker/PixiMIDIKnobBar';
import { PixiEditorControlsBar } from './tracker/PixiEditorControlsBar';
import { PixiRandomizeDialog } from '../dialogs/PixiRandomizeDialog';
import { PixiAcidPatternDialog } from '../dialogs/PixiAcidPatternDialog';
import { PixiFurnaceView } from './furnace/PixiFurnaceView';
import { PixiHivelyView } from './hively/PixiHivelyView';
import { PixiPitchSlider } from './tracker/PixiPitchSlider';
import { PixiTB303KnobPanel, TB303_PANEL_COLLAPSED_H, TB303_PANEL_EXPANDED_H } from './tracker/PixiTB303KnobPanel';
import { PixiPatternManagement } from './tracker/PixiPatternManagement';
import { PixiMusicLineTrackTable } from './tracker/PixiMusicLineTrackTable';
import { PixiMusicLinePatternViewer } from './tracker/PixiMusicLinePatternViewer';
import { PixiPatternEditor } from './tracker/PixiPatternEditor';
import { PixiGridSequencer } from './tracker/PixiGridSequencer';
import { PixiTB303View } from './tracker/PixiTB303View';
import { PixiSunVoxChannelView } from './sunvox/PixiSunVoxChannelView';
import { PixiPianoRollView } from './PixiPianoRollView';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@/hooks/tracker/BlockOperations';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useTrackerStore, useUIStore, useInstrumentStore } from '@stores';
import { getTrackerReplayer } from '@engine/TrackerReplayer';

type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303' | 'sunvox' | 'arrangement' | 'dj' | 'drumpad' | 'vj';

const PATTERN_PANEL_HEIGHT = 180;
const MUSICLINE_MATRIX_HEIGHT = 220;

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
  const compactToolbar = useUIStore(s => s.compactToolbar);
  const [showInstrumentPanel, setShowInstrumentPanel] = useState(true);

  // Hide instrument panel on narrow windows (matches DOM TrackerView)
  const canShowInstrumentPanel = windowWidth >= 900;
  const instrumentPanelVisible = viewMode !== 'tb303' && viewMode !== 'sunvox' && canShowInstrumentPanel && showInstrumentPanel;
  const INSTRUMENT_PANEL_W = 200;

  // Pattern data for automation/macro lanes overlay
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const showAutomation = useUIStore(s => s.showAutomationLanes);
  const showMacroLanes = useUIStore(s => s.showMacroLanes);
  const tb303Collapsed = useUIStore(s => s.tb303Collapsed);
  const hasTB303 = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'TB303'));
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

  // Compute instrument panel height: window minus navbar + toolbar + controls + statusbar + optional panels
  const NAVBAR_H = 98; // NavBar(45px) + TabBar(41px) + borders+padding — must match PixiNavBar height
  const STATUSBAR_H = 32; // must match PixiStatusBar STATUS_BAR_HEIGHT
  const CONTROLS_BAR_H = 32;
  const MACRO_SLOTS_H = showMacroSlots ? 32 : 0;
  const toolbarH = compactToolbar ? FT2_TOOLBAR_HEIGHT_COMPACT : FT2_TOOLBAR_HEIGHT;
  const tb303PanelH = hasTB303 && viewMode !== 'tb303' && viewMode !== 'sunvox'
    ? (tb303Collapsed ? TB303_PANEL_COLLAPSED_H : TB303_PANEL_EXPANDED_H)
    : 0;
  const instrumentPanelHeight = windowHeight - NAVBAR_H - toolbarH - CONTROLS_BAR_H - STATUSBAR_H - MACRO_SLOTS_H - (showPatterns ? PATTERN_PANEL_HEIGHT : 0) - tb303PanelH;
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

      {/* TB-303 Knob Panel — shown when a TB-303 instrument is active and not in TB-303/SunVox view */}
      <pixiContainer layout={{ width: '100%', height: tb303PanelH }} visible={tb303PanelH > 0}>
        <PixiTB303KnobPanel width={windowWidth} />
      </pixiContainer>

      {/* Editor controls bar — pure Pixi, no DOM overlay */}
      <PixiEditorControlsBar viewMode={viewMode} onViewModeChange={setViewMode} gridChannelIndex={gridChannelIndex} onGridChannelChange={setGridChannelIndex} />

      {/* Pattern management panel — always mounted, height:0 when hidden */}
      <pixiContainer layout={{ width: '100%', height: showPatterns ? PATTERN_PANEL_HEIGHT : 0 }} visible={showPatterns}>
        <PixiPatternManagement width={windowWidth} height={PATTERN_PANEL_HEIGHT} />
      </pixiContainer>

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
              when swapping Yoga child nodes. Visibility is controlled via
              alpha/renderable (NOT visible — @pixi/layout calls _onChildRemoved()
              when visible=false, detaching Yoga nodes and causing BindingErrors). */}

          {/* Classic tracker pattern editor — native Pixi */}
          <pixiContainer
            alpha={viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0}
            renderable={viewMode === 'tracker' && editorMode === 'classic'}
            eventMode={viewMode === 'tracker' && editorMode === 'classic' ? 'static' : 'none'}
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
            alpha={viewMode === 'grid' ? 1 : 0}
            renderable={viewMode === 'grid'}
            eventMode={viewMode === 'grid' ? 'static' : 'none'}
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
            alpha={viewMode === 'pianoroll' ? 1 : 0}
            renderable={viewMode === 'pianoroll'}
            eventMode={viewMode === 'pianoroll' ? 'static' : 'none'}
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
            alpha={viewMode === 'tb303' ? 1 : 0}
            renderable={viewMode === 'tb303'}
            eventMode={viewMode === 'tb303' ? 'static' : 'none'}
            layout={{
              flex: viewMode === 'tb303' ? 1 : 0,
              height: viewMode === 'tb303' ? '100%' : 0,
              width: viewMode === 'tb303' ? '100%' : 0,
            }}
          >
            <PixiTB303View channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* SunVox channel view — native Pixi */}
          <pixiContainer
            alpha={viewMode === 'sunvox' ? 1 : 0}
            renderable={viewMode === 'sunvox'}
            eventMode={viewMode === 'sunvox' ? 'static' : 'none'}
            layout={{
              flex: viewMode === 'sunvox' ? 1 : 0,
              height: viewMode === 'sunvox' ? '100%' : 0,
              width: viewMode === 'sunvox' ? '100%' : 0,
            }}
          >
            <PixiSunVoxChannelView channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* Furnace editor — pure Pixi */}
          <pixiContainer
            visible={viewMode === 'tracker' && editorMode === 'furnace'}
            layout={{
              flex: viewMode === 'tracker' && editorMode === 'furnace' ? 1 : 0,
              height: viewMode === 'tracker' && editorMode === 'furnace' ? '100%' : 0,
              width: viewMode === 'tracker' && editorMode === 'furnace' ? '100%' : 0,
            }}
          >
            <PixiFurnaceView width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* HivelyTracker editor — pure Pixi */}
          <pixiContainer
            visible={viewMode === 'tracker' && editorMode === 'hively'}
            layout={{
              flex: viewMode === 'tracker' && editorMode === 'hively' ? 1 : 0,
              height: viewMode === 'tracker' && editorMode === 'hively' ? '100%' : 0,
              width: viewMode === 'tracker' && editorMode === 'hively' ? '100%' : 0,
            }}
          >
            <PixiHivelyView width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>

          {/* MusicLine — pure Pixi */}
          <pixiContainer
            visible={viewMode === 'tracker' && editorMode === 'musicline'}
            layout={{
              flex: viewMode === 'tracker' && editorMode === 'musicline' ? 1 : 0,
              height: viewMode === 'tracker' && editorMode === 'musicline' ? '100%' : 0,
              width: viewMode === 'tracker' && editorMode === 'musicline' ? '100%' : 0,
              flexDirection: 'column',
            }}
          >
            <PixiMusicLineTrackTable
              width={Math.max(100, editorWidth)}
              height={MUSICLINE_MATRIX_HEIGHT}
              onSeek={(pos) => {
                useTrackerStore.getState().setCurrentPosition(pos);
                getTrackerReplayer().jumpToPosition(pos, 0);
              }}
            />
            <PixiMusicLinePatternViewer
              width={Math.max(100, editorWidth)}
              height={Math.max(50, instrumentPanelHeight - MUSICLINE_MATRIX_HEIGHT)}
            />
          </pixiContainer>

          {/* Overlays — ALWAYS mounted to avoid @pixi/layout Yoga BindingErrors.
              Use alpha/renderable (NOT visible) — @pixi/layout calls _onChildRemoved()
              on visible=false, detaching Yoga nodes and causing BindingErrors. */}
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
              <pixiContainer alpha={viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0} renderable={viewMode === 'tracker' && editorMode === 'classic'} eventMode={viewMode === 'tracker' && editorMode === 'classic' ? 'static' : 'none'} layout={{ position: 'absolute', width: Math.max(100, editorWidth), height: vuHeight }}>
                <PixiChannelVUMeters width={Math.max(100, editorWidth)} height={vuHeight} />
              </pixiContainer>
            );
          })()}
          <pixiContainer alpha={viewMode === 'tracker' && showAutomation && !!patternId ? 1 : 0} renderable={viewMode === 'tracker' && showAutomation && !!patternId} eventMode={viewMode === 'tracker' && showAutomation && !!patternId ? 'static' : 'none'} layout={{ position: 'absolute' }}>
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
          <pixiContainer alpha={viewMode === 'tracker' && showMacroLanes ? 1 : 0} renderable={viewMode === 'tracker' && showMacroLanes} eventMode={viewMode === 'tracker' && showMacroLanes ? 'static' : 'none'} layout={{ position: 'absolute' }}>
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
        <pixiContainer alpha={viewMode === 'tracker' ? 1 : 0} renderable={viewMode === 'tracker'} eventMode={viewMode === 'tracker' ? 'static' : 'none'} layout={{ width: viewMode === 'tracker' ? 16 : 0 }}>
          <PixiPatternMinimap height={Math.max(100, instrumentPanelHeight)} />
        </pixiContainer>

        {/* Pitch slider — pure Pixi */}
        <PixiPitchSlider width={32} height={Math.max(100, instrumentPanelHeight)} />

        {/* Instrument panel toggle button — pure Pixi */}
        {canShowInstrumentPanel && viewMode !== 'tb303' && viewMode !== 'sunvox' && (
          <PixiInstrumentToggle
            visible={instrumentPanelVisible}
            onClick={() => setShowInstrumentPanel(p => !p)}
          />
        )}

        {/* Instrument list — always mounted, zero-width when hidden */}
        <pixiContainer alpha={instrumentPanelVisible ? 1 : 0} renderable={instrumentPanelVisible} eventMode={instrumentPanelVisible ? 'static' : 'none'} layout={{ width: instrumentPanelVisible ? INSTRUMENT_PANEL_W : 0, height: '100%' }}>
          <PixiInstrumentPanel width={INSTRUMENT_PANEL_W} height={Math.max(100, instrumentPanelHeight)} />
        </pixiContainer>
      </pixiContainer>

      {/* Macro Slots Panel — always mounted, zero-height when hidden */}
      <pixiContainer alpha={showMacroSlots && viewMode === 'tracker' ? 1 : 0} renderable={showMacroSlots && viewMode === 'tracker'} eventMode={showMacroSlots && viewMode === 'tracker' ? 'static' : 'none'} layout={{ width: '100%', height: showMacroSlots && viewMode === 'tracker' ? 32 : 0 }}>
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

// ─── Instrument panel toggle — pure Pixi ────────────────────────────────────

const PixiInstrumentToggle: React.FC<{ visible: boolean; onClick: () => void }> = ({ visible, onClick }) => {
  const theme = usePixiTheme();

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 1, 9999);
    g.fill({ color: theme.border.color, alpha: 0.25 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{ width: 24, height: '100%', alignItems: 'center', justifyContent: 'center' }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
    >
      {/* Left border */}
      <pixiGraphics draw={drawBorder} layout={{ position: 'absolute', left: 0, top: 0, width: 1, height: '100%' }} />
      {/* Arrow */}
      <pixiBitmapText
        text={visible ? '\u25B6' : '\u25C0'}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={visible ? theme.accent.color : theme.textMuted.color}
        layout={{ alignSelf: 'center' }}
      />
    </pixiContainer>
  );
};

