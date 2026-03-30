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

import React, { useMemo } from 'react';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiFT2Toolbar, FT2_TOOLBAR_HEIGHT } from './tracker/PixiFT2Toolbar';
import { PixiInstrumentPanel } from './tracker/PixiInstrumentPanel';
import { PixiPatternMinimap } from './tracker/PixiPatternMinimap';
import { PixiAutomationLanes } from './tracker/PixiAutomationLanes';
import { PixiAutomationParamPicker } from './tracker/PixiAutomationParamPicker';
import { PixiMacroLanes } from './tracker/PixiMacroLanes';
import { PixiMacroSlotsPanel } from './tracker/PixiMacroSlotsPanel';
import { PixiMIDIKnobBar } from './tracker/PixiMIDIKnobBar';
import { PixiEditorControlsBar } from './tracker/PixiEditorControlsBar';
import { PixiChannelVUMeters } from './tracker/PixiChannelVUMeters';
import { PixiRandomizeDialog } from '../dialogs/PixiRandomizeDialog';
import { PixiAcidPatternDialog } from '../dialogs/PixiAcidPatternDialog';
import { PixiFurnaceView } from './furnace/PixiFurnaceView';
import { PixiHivelyView } from './hively/PixiHivelyView';
import { PixiKlysView } from './klystrack/PixiKlysView';
import { PixiJamCrackerView } from './jamcracker/PixiJamCrackerView';
import { PixiTFMXView } from './tfmx/PixiTFMXView';
import { PixiPitchSlider } from './tracker/PixiPitchSlider';
import { PixiTB303KnobPanel, TB303_PANEL_COLLAPSED_H, TB303_PANEL_EXPANDED_H } from './tracker/PixiTB303KnobPanel';
import { PixiSCKnobPanel, SC_PANEL_COLLAPSED_H, SC_PANEL_EXPANDED_H } from './tracker/PixiSCKnobPanel';
import { PixiCMIKnobPanel, CMI_PANEL_COLLAPSED_H, CMI_PANEL_EXPANDED_H } from './tracker/PixiCMIKnobPanel';
import { PixiMusicLineTrackTable } from './tracker/PixiMusicLineTrackTable';
import { PixiMusicLinePatternViewer } from './tracker/PixiMusicLinePatternViewer';
import { PixiPatternEditor } from './tracker/PixiPatternEditor';
import { PixiTrackerVisualBg } from './tracker/PixiTrackerVisualBg';
import { PixiGridSequencer } from './tracker/PixiGridSequencer';
import { PixiTB303View } from './tracker/PixiTB303View';
import { PixiSunVoxChannelView } from './sunvox/PixiSunVoxChannelView';
import { PixiPianoRollView } from './PixiPianoRollView';
import { PixiGTUltraView } from './gtultra/PixiGTUltraView';
import { PixiSc68View } from './sc68/PixiSc68View';
import { useTrackerView } from '@/hooks/views/useTrackerView';
import { AUTOMATION_LANE_WIDTH, AUTOMATION_LANE_MIN } from '@/hooks/views/usePatternEditor';
import { useTrackerStore, useUIStore, useInstrumentStore, useEditorStore, useAutomationStore } from '@stores';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useShallow } from 'zustand/react/shallow';
import { TITLE_H } from '../workbench/workbenchLayout';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { PixiButton } from '../components/PixiButton';


const MUSICLINE_MATRIX_HEIGHT = 220;
const MIDI_KNOB_BAR_H_COLLAPSED = 20;
const MIDI_KNOB_BAR_H_EXPANDED = 56;

export const PixiTrackerView: React.FC = () => {
  const theme = usePixiTheme();
  // Shared logic: keyboard hooks, view mode, grid channel, editor mode, ML export
  const {
    viewMode,
    setViewMode,
    gridChannelIndex,
    setGridChannelIndex,
    editorMode,
    handleExportML,
  } = useTrackerView();

  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const showMacroSlots = useUIStore(s => s.showMacroSlots);
  const showKnobBar = useMIDIStore(s => s.showKnobBar);
  const showInstrumentPanel = useUIStore(s => s.showInstrumentPanel);


  // PixiTrackerView lives inside a PixiWindow — use the window's own dimensions,
  // not the screen dimensions, so layout calculations are correct when the window
  // is resized or is smaller than the screen.
  const trackerWin = useWorkbenchStore(s => s.windows['tracker']);
  const windowWidth = trackerWin?.width ?? 900;
  // Content height = window height minus the PixiWindow title bar
  const contentH = trackerWin ? (trackerWin.height - TITLE_H) : 572;

  // Hide instrument panel on narrow windows (matches DOM TrackerView)
  const canShowInstrumentPanel = windowWidth >= 900;
  const instrumentPanelVisible = viewMode !== 'tb303' && viewMode !== 'sunvox' && canShowInstrumentPanel && showInstrumentPanel;
  const INSTRUMENT_PANEL_W = 200;

  // Pattern data for automation/macro lanes overlay.
  // Use stable primitive selectors — avoids re-rendering the whole tracker view on every cell edit.
  // Cell edits change s.patterns reference but never change id/length/channelCount/patternOrder.
  const showAutomation = useUIStore(s => s.showAutomationLanes);
  const showMacroLanes = useUIStore(s => s.showMacroLanes);
  const patternEditorScrollLeft = useUIStore(s => s.patternEditorScrollLeft);
  const tb303Collapsed = useUIStore(s => s.tb303Collapsed);
  const scCollapsed = useUIStore(s => s.scCollapsed ?? true);
  const cmiCollapsed = useUIStore(s => s.cmiCollapsed ?? true);
  const hasTB303 = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'TB303'));
  const hasSC = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'SuperCollider' && !!i.superCollider?.binary));
  const hasCMI = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'MAMECMI'));
  const patternId     = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.id ?? '');
  const patternLength = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.length ?? 64);
  const channelCount  = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.channels?.length ?? 4);
  const ROW_HEIGHT = 18; // matches PatternEditorCanvas default row height

  // Channel layout for automation lane positioning — mirrors usePatternEditor layout.
  // Only the offsets/widths matter here; we read the current pattern's channel metadata.
  const currentPattern = useTrackerStore(s => s.patterns[s.currentPatternIndex]);
  const columnVisibility = useEditorStore(s => s.columnVisibility);
  // Per-channel automation lane count (for multi-lane width allocation)
  const channelLaneCounts = useAutomationStore(useShallow((s) => {
    if (!showAutomation || !currentPattern) return [] as number[];
    const nc = currentPattern.channels.length;
    const counts: number[] = [];
    for (let ch = 0; ch < nc; ch++) {
      const lane = s.channelLanes.get(ch);
      if (!lane) { counts.push(1); continue; }
      const n = lane.activeParameters?.length || (lane.activeParameter ? 1 : 0);
      counts.push(Math.max(1, n));
    }
    return counts;
  }));

  const { channelOffsets, channelWidths } = useMemo(() => {
    if (!currentPattern) return { channelOffsets: [] as number[], channelWidths: [] as number[] };
    const CHAR_W = 10, LINE_NUM_W = 40;
    const noteW = CHAR_W * 3 + 4;
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;
    const offsets: number[] = [];
    const widths: number[] = [];
    let x = LINE_NUM_W;
    for (let ch = 0; ch < currentPattern.channels.length; ch++) {
      const channel = currentPattern.channels[ch];
      const lc = showAutomation ? (channelLaneCounts[ch] ?? 1) : 0;
      const autoExtra = lc <= 0 ? 0
        : lc === 1 ? AUTOMATION_LANE_WIDTH
        : Math.max(AUTOMATION_LANE_WIDTH, lc * AUTOMATION_LANE_MIN + 4);
      if (channel?.collapsed) {
        const cw = noteW + 40 + autoExtra;
        offsets.push(x); widths.push(cw); x += cw;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectW = effectCols * (CHAR_W * 3 + 4);
        const paramW = CHAR_W * 4 + 8 + effectW + (showAcid ? CHAR_W * 2 + 8 : 0) + (showProb ? CHAR_W * 2 + 4 : 0);
        const cw = noteW + paramW + 60 + autoExtra;
        offsets.push(x); widths.push(cw); x += cw;
      }
    }
    return { channelOffsets: offsets, channelWidths: widths };
  }, [currentPattern, columnVisibility, showAutomation, channelLaneCounts]);

  // Adjacent pattern IDs for ghost automation curves
  const prevPatternId = useTrackerStore(s => {
    const prev = s.currentPositionIndex > 0 ? s.currentPositionIndex - 1 : -1;
    return prev >= 0 ? (s.patterns[s.patternOrder[prev]]?.id ?? undefined) : undefined;
  });
  const prevPatternLength = useTrackerStore(s => {
    const prev = s.currentPositionIndex > 0 ? s.currentPositionIndex - 1 : -1;
    return prev >= 0 ? (s.patterns[s.patternOrder[prev]]?.length ?? undefined) : undefined;
  });
  const nextPatternId = useTrackerStore(s => {
    const next = s.currentPositionIndex < s.patternOrder.length - 1 ? s.currentPositionIndex + 1 : -1;
    return next >= 0 ? (s.patterns[s.patternOrder[next]]?.id ?? undefined) : undefined;
  });
  const nextPatternLength = useTrackerStore(s => {
    const next = s.currentPositionIndex < s.patternOrder.length - 1 ? s.currentPositionIndex + 1 : -1;
    return next >= 0 ? (s.patterns[s.patternOrder[next]]?.length ?? undefined) : undefined;
  });

  // Compute usable heights from the PixiWindow's content area.
  // Unlike the old full-screen layout, PixiTrackerView is inside a PixiWindow so
  // there's no NavBar or StatusBar to subtract — those are outside the window.
  const CONTROLS_BAR_H = 36;
  const MACRO_SLOTS_H = showMacroSlots ? 32 : 0;
  const toolbarH = FT2_TOOLBAR_HEIGHT;
  const tb303PanelH = hasTB303 && viewMode !== 'tb303' && viewMode !== 'sunvox'
    ? (tb303Collapsed ? TB303_PANEL_COLLAPSED_H : TB303_PANEL_EXPANDED_H)
    : 0;
  const scPanelH = hasSC && viewMode !== 'tb303' && viewMode !== 'sunvox'
    ? (scCollapsed ? SC_PANEL_COLLAPSED_H : SC_PANEL_EXPANDED_H)
    : 0;
  const cmiPanelH = hasCMI && viewMode !== 'tb303' && viewMode !== 'sunvox'
    ? (cmiCollapsed ? CMI_PANEL_COLLAPSED_H : CMI_PANEL_EXPANDED_H)
    : 0;
  const midiKnobBarH = showKnobBar ? MIDI_KNOB_BAR_H_EXPANDED : MIDI_KNOB_BAR_H_COLLAPSED;
  const instrumentPanelHeight = contentH - toolbarH - CONTROLS_BAR_H - MACRO_SLOTS_H - tb303PanelH - scPanelH - cmiPanelH - midiKnobBarH;
  const editorWidth = windowWidth - (instrumentPanelVisible ? INSTRUMENT_PANEL_W : 0) - 16; // minus instrument panel and minimap

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* FT2 Toolbar + Menu bar */}
      <PixiFT2Toolbar />

      {/* TB-303 Knob Panel — shown when a TB-303 instrument is active and not in TB-303/SunVox view */}
      <pixiContainer layout={{ width: '100%', height: tb303PanelH, flexShrink: 0 }} alpha={tb303PanelH > 0 ? 1 : 0} renderable={tb303PanelH > 0}>
        <PixiTB303KnobPanel width={windowWidth} />
      </pixiContainer>

      {/* SuperCollider Knob Panel — shown when an SC instrument with compiled binary is active */}
      <pixiContainer layout={{ width: '100%', height: scPanelH, flexShrink: 0 }} alpha={scPanelH > 0 ? 1 : 0} renderable={scPanelH > 0}>
        <PixiSCKnobPanel width={windowWidth} />
      </pixiContainer>

      {/* Fairlight CMI Knob Panel — shown when a MAMECMI instrument is active */}
      <pixiContainer layout={{ width: '100%', height: cmiPanelH, flexShrink: 0 }} alpha={cmiPanelH > 0 ? 1 : 0} renderable={cmiPanelH > 0}>
        <PixiCMIKnobPanel width={windowWidth} />
      </pixiContainer>

      {/* Editor controls bar — pure Pixi, no DOM overlay */}
      <PixiEditorControlsBar viewMode={viewMode} onViewModeChange={setViewMode} gridChannelIndex={gridChannelIndex} onGridChannelChange={setGridChannelIndex} />

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
          {/* Editor — only the ACTIVE view is mounted.
              Inactive views are fully unmounted (no React fibers, no Yoga nodes,
              no subscriptions, no pixi subtrees). This eliminates ~25ms of
              @pixi/react reconciler + Yoga layout overhead per frame.
              Views receive explicit dimensions — no Yoga layout needed. */}
          <pixiContainer layout={{ flex: 1, width: '100%', height: '100%' }}>
            {viewMode === 'tracker' && editorMode === 'classic' && (
              <PixiPatternEditor width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} isActive />
            )}
            {viewMode === 'grid' && (
              <PixiGridSequencer channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} isActive />
            )}
            {viewMode === 'pianoroll' && (
              <PixiPianoRollView isActive />
            )}
            {viewMode === 'tb303' && (
              <PixiTB303View channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
            )}
            {viewMode === 'sunvox' && (
              <PixiSunVoxChannelView channelIndex={gridChannelIndex} width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
            )}
            {viewMode === 'tracker' && editorMode === 'furnace' && (
              <PixiFurnaceView width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
            )}
            {viewMode === 'tracker' && editorMode === 'hively' && (
              <PixiHivelyView width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
            )}
            {viewMode === 'tracker' && editorMode === 'tfmx' && (
              <PixiTFMXView width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
            )}
            {viewMode === 'tracker' && editorMode === 'musicline' && (
              <pixiContainer layout={{ width: Math.max(100, editorWidth), height: instrumentPanelHeight, flexDirection: 'column' }}>
                {/* MusicLine toolbar */}
                <pixiContainer layout={{ width: '100%', height: 28, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, gap: 6 }}>
                  <pixiBitmapText
                    text="MusicLine"
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                  />
                  <pixiContainer layout={{ flex: 1, height: 28 }} />
                  <PixiButton
                    label="Export .ml"
                    variant="ft2"
                    size="sm"
                    color="green"
                    onClick={handleExportML}
                  />
                </pixiContainer>
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
                  height={Math.max(50, instrumentPanelHeight - MUSICLINE_MATRIX_HEIGHT - 28)}
                />
              </pixiContainer>
            )}
            {viewMode === 'tracker' && editorMode === 'goattracker' && (
              <PixiGTUltraView
                width={Math.max(100, editorWidth)}
                height={Math.max(100, instrumentPanelHeight)}
              />
            )}
            {viewMode === 'tracker' && editorMode === 'klystrack' && (
              <PixiKlysView
                width={Math.max(100, editorWidth)}
                height={Math.max(100, instrumentPanelHeight)}
              />
            )}
            {viewMode === 'tracker' && editorMode === 'jamcracker' && (
              <PixiJamCrackerView
                width={Math.max(100, editorWidth)}
                height={Math.max(100, instrumentPanelHeight)}
              />
            )}
            {viewMode === 'tracker' && editorMode === 'sc68' && (
              <PixiSc68View
                width={Math.max(100, editorWidth)}
                height={Math.max(100, instrumentPanelHeight)}
              />
            )}
          </pixiContainer>

          {/* Overlays — ALWAYS mounted to avoid @pixi/layout Yoga BindingErrors.
              Use alpha/renderable (NOT visible) — @pixi/layout calls _onChildRemoved()
              on visible=false, detaching Yoga nodes and causing BindingErrors. */}
          {/* Audio-reactive visual background — renders behind everything else */}
          <pixiContainer alpha={viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0} renderable={viewMode === 'tracker' && editorMode === 'classic'} eventMode="none" layout={{ position: 'absolute', top: 0, width: Math.max(100, editorWidth), height: Math.max(100, instrumentPanelHeight) }}>
            <PixiTrackerVisualBg width={Math.max(100, editorWidth)} height={Math.max(100, instrumentPanelHeight)} />
          </pixiContainer>
          {/* VU meters overlay — covers top half of editor down to the edit bar.
              VU segments draw upward from the bottom of this area, so they
              appear to shoot out from the edit cursor row.
              Height accounts for PixiPatternEditor internal layout:
              header(28) + grid, with cursor centered in grid.
              The scrollbar (12px) uses display:'none' when all channels fit,
              so the header offset is just PE_HEADER in that case. */}
          {(() => {
            const PE_HEADER = 28;     // PixiPatternEditor channel header
            const gridH = instrumentPanelHeight - PE_HEADER;
            const editRowY = Math.floor(gridH / 2); // Center of grid area (edit row position)
            return (
              <pixiContainer alpha={viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0} renderable={viewMode === 'tracker' && editorMode === 'classic'} eventMode={viewMode === 'tracker' && editorMode === 'classic' ? 'static' : 'none'} layout={{ position: 'absolute', top: PE_HEADER, width: Math.max(100, editorWidth), height: gridH }}>
                <PixiChannelVUMeters width={Math.max(100, editorWidth)} height={gridH} editRowY={editRowY} />
              </pixiContainer>
            );
          })()}
          {/* Automation parameter pickers (per-channel) */}
          <pixiContainer alpha={viewMode === 'tracker' && showAutomation && !!patternId ? 1 : 0} renderable={viewMode === 'tracker' && showAutomation && !!patternId} eventMode={viewMode === 'tracker' && showAutomation && !!patternId ? 'static' : 'none'} layout={{ position: 'absolute', top: 10, left: 0, flexDirection: 'row' }}>
            {Array.from({ length: channelCount }, (_, i) => (
              <PixiAutomationParamPicker
                key={`auto-pick-${i}`}
                channelIndex={i}
                channelWidth={Math.floor(Math.max(100, editorWidth) / channelCount)}
              />
            ))}
          </pixiContainer>
          <pixiContainer alpha={viewMode === 'tracker' && showAutomation && !!patternId ? 1 : 0} renderable={viewMode === 'tracker' && showAutomation && !!patternId} eventMode={viewMode === 'tracker' && showAutomation && !!patternId ? 'static' : 'none'} layout={{ position: 'absolute', top: 28 }}>
            <PixiAutomationLanes
              width={Math.max(100, editorWidth)}
              height={Math.max(100, instrumentPanelHeight - 28)}
              patternId={patternId || ''}
              patternLength={patternLength}
              rowHeight={ROW_HEIGHT}
              channelCount={channelCount}
              channelOffsets={channelOffsets}
              channelWidths={channelWidths}
              scrollLeft={patternEditorScrollLeft}
              prevPatternId={prevPatternId}
              prevPatternLength={prevPatternLength}
              nextPatternId={nextPatternId}
              nextPatternLength={nextPatternLength}
            />
          </pixiContainer>
          <pixiContainer alpha={viewMode === 'tracker' && showMacroLanes ? 1 : 0} renderable={viewMode === 'tracker' && showMacroLanes} eventMode={viewMode === 'tracker' && showMacroLanes ? 'static' : 'none'} layout={{ position: 'absolute', top: 28 }}>
            <PixiMacroLanes
              width={Math.max(100, editorWidth)}
              height={Math.max(100, instrumentPanelHeight - 28)}
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

        {/* Pitch slider — 52px wide matching DOM's DJPitchSlider (style={{ width: 52 }}) */}
        <PixiPitchSlider width={52} height={Math.max(100, instrumentPanelHeight)} />

        {/* Instrument panel toggle button — always mounted, zero-width when hidden */}
        <PixiInstrumentToggle
          show={canShowInstrumentPanel && viewMode !== 'tb303' && viewMode !== 'sunvox'}
          visible={instrumentPanelVisible}
          onClick={() => useUIStore.getState().toggleInstrumentPanel()}
        />

        {/* Instrument list */}
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

const PixiInstrumentToggle: React.FC<{ show: boolean; visible: boolean; onClick: () => void }> = ({ show, visible, onClick }) => {
  const theme = usePixiTheme();

  return (
    <pixiContainer
      alpha={show ? 1 : 0}
      renderable={show}
      eventMode={show ? 'static' : 'none'}
      layout={{ width: show ? 24 : 0, height: '100%', alignItems: 'center', justifyContent: 'center' }}
      cursor="pointer"
      onPointerUp={onClick}
    >
      {/* Left border */}
      <layoutContainer alpha={0.25} layout={{ position: 'absolute', left: 0, top: 0, width: 1, height: '100%', backgroundColor: theme.border.color }} />
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

