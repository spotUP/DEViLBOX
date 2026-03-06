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

import React, { useCallback } from 'react';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiFT2Toolbar, FT2_TOOLBAR_HEIGHT } from './tracker/PixiFT2Toolbar';
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
import { PixiSCKnobPanel, SC_PANEL_COLLAPSED_H, SC_PANEL_EXPANDED_H } from './tracker/PixiSCKnobPanel';
import { PixiMusicLineTrackTable } from './tracker/PixiMusicLineTrackTable';
import { PixiMusicLinePatternViewer } from './tracker/PixiMusicLinePatternViewer';
import { PixiPatternEditor } from './tracker/PixiPatternEditor';
import { PixiGridSequencer } from './tracker/PixiGridSequencer';
import { PixiTB303View } from './tracker/PixiTB303View';
import { PixiSunVoxChannelView } from './sunvox/PixiSunVoxChannelView';
import { PixiPianoRollView } from './PixiPianoRollView';
import { PixiGTUltraView } from './gtultra/PixiGTUltraView';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@/hooks/tracker/BlockOperations';
import { useTrackerStore, useUIStore, useInstrumentStore } from '@stores';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useProjectStore } from '@stores/useProjectStore';
import { TITLE_H } from '../workbench/workbenchLayout';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { PixiButton } from '../components/PixiButton';
import { exportMusicLineFile } from '@lib/export/MusicLineExporter';
import type { TrackerSong } from '@engine/TrackerReplayer';


const MUSICLINE_MATRIX_HEIGHT = 220;
const MIDI_KNOB_BAR_H_COLLAPSED = 20;
const MIDI_KNOB_BAR_H_EXPANDED = 56;

export const PixiTrackerView: React.FC = () => {
  // Enable FT2-style keyboard input (window event listeners — no DOM needed)
  useTrackerInput();
  useBlockOperations();

  const viewMode = useUIStore(s => s.trackerViewMode);
  const setViewMode = useUIStore(s => s.setTrackerViewMode);
  const gridChannelIndex = useUIStore(s => s.gridChannelIndex);
  const setGridChannelIndex = useUIStore(s => s.setGridChannelIndex);
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const editorMode = useTrackerStore(s => s.editorMode);
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
  // currentPositionIndex reserved for future automation lane scroll sync
  const showAutomation = useUIStore(s => s.showAutomationLanes);
  const showMacroLanes = useUIStore(s => s.showMacroLanes);
  const tb303Collapsed = useUIStore(s => s.tb303Collapsed);
  const scCollapsed = useUIStore(s => s.scCollapsed ?? true);
  const hasTB303 = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'TB303'));
  const hasSC = useInstrumentStore(s => s.instruments.some(i => i.synthType === 'SuperCollider' && !!i.superCollider?.binary));
  const patternId     = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.id ?? '');
  const patternLength = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.length ?? 64);
  const channelCount  = useTrackerStore(s => s.patterns[s.currentPatternIndex]?.channels?.length ?? 4);
  const ROW_HEIGHT = 18; // matches PatternEditorCanvas default row height

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
  const midiKnobBarH = showKnobBar ? MIDI_KNOB_BAR_H_EXPANDED : MIDI_KNOB_BAR_H_COLLAPSED;
  const instrumentPanelHeight = contentH - toolbarH - CONTROLS_BAR_H - MACRO_SLOTS_H - tb303PanelH - scPanelH - midiKnobBarH;
  const editorWidth = windowWidth - (instrumentPanelVisible ? INSTRUMENT_PANEL_W : 0) - 16; // minus instrument panel and minimap

  // MusicLine export handler
  const handleExportML = useCallback(() => {
    const s = useTrackerStore.getState();
    const t = useTransportStore.getState();
    const song: TrackerSong = {
      name: useProjectStore.getState().metadata.name || 'MusicLine Song',
      format: 'ML',
      patterns: s.patterns,
      instruments: useInstrumentStore.getState().instruments,
      songPositions: s.patternOrder,
      songLength: s.patternOrder.length,
      restartPosition: 0,
      numChannels: s.patterns[0]?.channels.length ?? 4,
      initialSpeed: t.speed,
      initialBPM: t.bpm,
      channelTrackTables: s.channelTrackTables ?? undefined,
      channelSpeeds: s.channelSpeeds ?? undefined,
      channelGrooves: s.channelGrooves ?? undefined,
    };
    const data = exportMusicLineFile(song);
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${song.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.ml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

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
      <pixiContainer layout={{ width: '100%', height: tb303PanelH }} alpha={tb303PanelH > 0 ? 1 : 0} renderable={tb303PanelH > 0}>
        <PixiTB303KnobPanel width={windowWidth} />
      </pixiContainer>

      {/* SuperCollider Knob Panel — shown when an SC instrument with compiled binary is active */}
      <pixiContainer layout={{ width: '100%', height: scPanelH }} alpha={scPanelH > 0 ? 1 : 0} renderable={scPanelH > 0}>
        <PixiSCKnobPanel width={windowWidth} />
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
            {viewMode === 'tracker' && editorMode === 'musicline' && (
              <pixiContainer layout={{ width: Math.max(100, editorWidth), height: instrumentPanelHeight, flexDirection: 'column' }}>
                {/* MusicLine toolbar */}
                <pixiContainer layout={{ width: '100%', height: 28, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, gap: 6 }}>
                  <pixiBitmapText
                    text="MusicLine"
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                    tint={0x888888}
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
          </pixiContainer>

          {/* Overlays — ALWAYS mounted to avoid @pixi/layout Yoga BindingErrors.
              Use alpha/renderable (NOT visible) — @pixi/layout calls _onChildRemoved()
              on visible=false, detaching Yoga nodes and causing BindingErrors. */}
          {/* VU meters overlay — covers top half of editor down to the edit bar.
              VU segments draw upward from the bottom of this area, so they
              appear to shoot out from the edit cursor row.
              Height accounts for PixiPatternEditor internal layout:
              header(28) + grid, with cursor centered in grid.
              The scrollbar (12px) uses display:'none' when all channels fit,
              so the header offset is just PE_HEADER in that case. */}
          {(() => {
            const PE_HEADER = 28;     // PixiPatternEditor channel header
            const PE_ROW = 24;        // PixiPatternEditor row height
            const HEADER_OFFSET = PE_HEADER; // below channel headers (scrollbar collapses via display:none)
            const gridH = instrumentPanelHeight - PE_HEADER;
            const vuHeight = Math.max(50, Math.floor((gridH - PE_ROW) / 2));
            return (
              <pixiContainer alpha={viewMode === 'tracker' && editorMode === 'classic' ? 1 : 0} renderable={viewMode === 'tracker' && editorMode === 'classic'} eventMode={viewMode === 'tracker' && editorMode === 'classic' ? 'static' : 'none'} layout={{ position: 'absolute', top: HEADER_OFFSET, width: Math.max(100, editorWidth), height: vuHeight }}>
                <PixiChannelVUMeters width={Math.max(100, editorWidth)} height={vuHeight} />
              </pixiContainer>
            );
          })()}
          <pixiContainer alpha={viewMode === 'tracker' && showAutomation && !!patternId ? 1 : 0} renderable={viewMode === 'tracker' && showAutomation && !!patternId} eventMode={viewMode === 'tracker' && showAutomation && !!patternId ? 'static' : 'none'} layout={{ position: 'absolute', top: 28 }}>
            <PixiAutomationLanes
              width={Math.max(100, editorWidth)}
              height={Math.max(100, instrumentPanelHeight - 28)}
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

        {/* Pitch slider — pure Pixi */}
        <PixiPitchSlider width={32} height={Math.max(100, instrumentPanelHeight)} />

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

