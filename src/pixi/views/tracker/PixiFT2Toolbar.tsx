/**
 * PixiFT2Toolbar — FT2-style toolbar rendered entirely in Pixi (no DOM overlay).
 *
 * Layout rows:
 *   Row 1 (28px)  — PixiMenuBar: File / Module / Help
 *   Row 2 (36px)  — Transport: BPM, Stop/Play/Record, pattern name + rows input
 *   Row 3 (56px)  — Visualizer + PAT/AUTO toggle buttons
 *   (Row 3 is hidden / height-0 when compactToolbar is true)
 *
 * Stores used:
 *   useTransportStore — bpm, setBPM, isPlaying, play, stop
 *   useTrackerStore   — recordMode, toggleRecordMode, patterns, currentPatternIndex,
 *                       updatePatternName, resizePattern
 *   useUIStore        — modalOpen, openModal, closeModal, compactToolbar,
 *                       toggleCompactToolbar, showPatterns, togglePatterns,
 *                       showAutomationLanes, toggleAutomationLanes
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiMenuBar } from '../../components/PixiMenuBar';
import { PixiButton, PixiNumericInput } from '../../components';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { PixiVisualizer } from './PixiVisualizer';
import { useTransportStore, useTrackerStore, useUIStore } from '@stores';
import { buildFT2Menus } from './ft2MenuDefs';

// ─── Layout constants ────────────────────────────────────────────────────────

const MENU_ROW_H = 28;
const TRANSPORT_ROW_H = 36;
const VIZ_ROW_H = 56;

/** Total height when expanded */
export const FT2_TOOLBAR_HEIGHT = MENU_ROW_H + TRANSPORT_ROW_H + VIZ_ROW_H;
/** Total height when compact (menu + transport only) */
export const FT2_TOOLBAR_HEIGHT_COMPACT = MENU_ROW_H + TRANSPORT_ROW_H;

// ─── Stable layout objects (avoid Yoga BindingErrors) ───────────────────────

const LAYOUT_FILL_ROW: Record<string, unknown> = {
  position: 'absolute',
  width: '100%',
};

// ─── PixiFT2Toolbar ──────────────────────────────────────────────────────────

export const PixiFT2Toolbar: React.FC = () => {
  const theme = usePixiTheme();

  // Transport store
  const bpm = useTransportStore(s => s.bpm);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const setBPM = useTransportStore(s => s.setBPM);
  const play = useTransportStore(s => s.play);
  const stop = useTransportStore(s => s.stop);

  // Tracker store
  const recordMode = useTrackerStore(s => s.recordMode);
  const toggleRecordMode = useTrackerStore(s => s.toggleRecordMode);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const patterns = useTrackerStore(s => s.patterns);
  const updatePatternName = useTrackerStore(s => s.updatePatternName);
  const resizePattern = useTrackerStore(s => s.resizePattern);

  const currentPattern = patterns[currentPatternIndex];
  const patternName = currentPattern?.name ?? '';
  const patternLength = currentPattern?.length ?? 64;

  // UI store
  const modalOpen = useUIStore(s => s.modalOpen);
  const compactToolbar = useUIStore(s => s.compactToolbar);
  const showPatterns = useUIStore(s => s.showPatterns);
  const showAutomation = useUIStore(s => s.showAutomationLanes);

  // Local pattern-name edit state
  const [localName, setLocalName] = useState(patternName);
  const nameRef = useRef(patternName);
  useEffect(() => {
    nameRef.current = patternName;
    setLocalName(patternName);
  }, [patternName]);

  // ─── Modal / menu action handlers ──────────────────────────────────────────

  const handleShowExport = useCallback(() => {
    useUIStore.getState().openModal('export');
  }, []);

  const handleShowHelp = useCallback((tab?: string) => {
    useUIStore.getState().openModal('help', { initialTab: tab || 'shortcuts' });
  }, []);

  const handleShowMasterFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);

  const handleShowInstrumentFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
  }, []);

  const handleShowInstruments = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  const handleShowPatternOrder = useCallback(() => {
    useUIStore.getState().openModal('patternOrder');
  }, []);

  const handleShowDrumpads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  const menus = buildFT2Menus({
    onShowExport: handleShowExport,
    onShowHelp: handleShowHelp,
    onShowMasterFX: handleShowMasterFX,
    onShowInstrumentFX: handleShowInstrumentFX,
    onShowInstruments: handleShowInstruments,
    onShowPatternOrder: handleShowPatternOrder,
    onShowDrumpads: handleShowDrumpads,
    showMasterFX: modalOpen === 'masterFx',
    showInstrumentFX: modalOpen === 'instrumentFx',
  });

  // ─── Transport handlers ─────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      play().catch(() => {});
    }
  }, [isPlaying, play, stop]);

  const handleRecord = useCallback(() => {
    toggleRecordMode();
  }, [toggleRecordMode]);

  const handleBPMChange = useCallback((val: number) => {
    setBPM(val);
  }, [setBPM]);

  // ─── Pattern name handlers ──────────────────────────────────────────────────

  const handleNameChange = useCallback((val: string) => {
    setLocalName(val);
  }, []);

  const handleNameSubmit = useCallback((val: string) => {
    updatePatternName(currentPatternIndex, val);
  }, [updatePatternName, currentPatternIndex]);

  const handleNameCancel = useCallback(() => {
    setLocalName(nameRef.current);
  }, []);

  // ─── Pattern length handler ─────────────────────────────────────────────────

  const handleLengthChange = useCallback((val: number) => {
    resizePattern(currentPatternIndex, val);
  }, [resizePattern, currentPatternIndex]);

  // ─── Toggle handlers ────────────────────────────────────────────────────────

  const handleToggleCompact = useCallback(() => {
    useUIStore.getState().toggleCompactToolbar();
  }, []);

  const handleTogglePatterns = useCallback(() => {
    useUIStore.getState().togglePatterns();
  }, []);

  const handleToggleAutomation = useCallback(() => {
    useUIStore.getState().toggleAutomationLanes();
  }, []);

  // ─── Background drawing ─────────────────────────────────────────────────────

  const drawMenuRowBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, MENU_ROW_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, MENU_ROW_H - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [theme]);

  const drawTransportRowBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, TRANSPORT_ROW_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, TRANSPORT_ROW_H - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  const drawVizRowBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, VIZ_ROW_H);
    g.fill({ color: theme.bg.color });
    g.rect(0, VIZ_ROW_H - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  const drawSep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, TRANSPORT_ROW_H - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  // ─── Total toolbar height ───────────────────────────────────────────────────

  const totalHeight = compactToolbar
    ? FT2_TOOLBAR_HEIGHT_COMPACT
    : FT2_TOOLBAR_HEIGHT;

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: totalHeight,
        flexDirection: 'column',
      }}
    >
      {/* ── Row 1: Menu bar ── */}
      <pixiContainer
        layout={{
          width: '100%',
          height: MENU_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 4,
        }}
      >
        <pixiGraphics
          draw={drawMenuRowBg}
          layout={{ ...LAYOUT_FILL_ROW, height: MENU_ROW_H }}
        />
        <PixiMenuBar menus={menus} height={MENU_ROW_H} />
      </pixiContainer>

      {/* ── Row 2: Transport ── */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TRANSPORT_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics
          draw={drawTransportRowBg}
          layout={{ ...LAYOUT_FILL_ROW, height: TRANSPORT_ROW_H }}
        />

        {/* BPM label + input */}
        <pixiBitmapText
          text="BPM"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiNumericInput
          value={bpm}
          min={20}
          max={999}
          step={1}
          onChange={handleBPMChange}
          width={44}
        />

        {/* Separator */}
        <pixiGraphics draw={drawSep} layout={{ width: 1, height: TRANSPORT_ROW_H }} />

        {/* Stop button */}
        <PixiButton
          label="STOP"
          variant="ft2"
          color="default"
          size="sm"
          onClick={handleStop}
        />

        {/* Play/Pause button */}
        <PixiButton
          label={isPlaying ? 'PAUSE' : 'PLAY'}
          variant="ft2"
          color={isPlaying ? 'green' : 'default'}
          size="sm"
          active={isPlaying}
          onClick={handlePlay}
        />

        {/* Record button */}
        <PixiButton
          label="REC"
          variant={recordMode ? 'ft2' : 'ghost'}
          color={recordMode ? 'red' : 'default'}
          size="sm"
          active={recordMode}
          onClick={handleRecord}
        />

        {/* Separator */}
        <pixiGraphics draw={drawSep} layout={{ width: 1, height: TRANSPORT_ROW_H }} />

        {/* Pattern name label */}
        <pixiBitmapText
          text="PAT"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />

        {/* Pattern name text input */}
        <PixiPureTextInput
          value={localName}
          onChange={handleNameChange}
          onSubmit={handleNameSubmit}
          onCancel={handleNameCancel}
          placeholder="Pattern name..."
          width={120}
          height={24}
          fontSize={11}
          font="mono"
        />

        {/* Rows label + input */}
        <pixiBitmapText
          text="ROWS"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiNumericInput
          value={patternLength}
          min={1}
          max={256}
          step={1}
          onChange={handleLengthChange}
          width={44}
        />

        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />

        {/* Compact toggle */}
        <PixiButton
          label={compactToolbar ? 'EXPAND' : 'COMPACT'}
          variant="ghost"
          size="sm"
          onClick={handleToggleCompact}
        />
      </pixiContainer>

      {/* ── Row 3: Visualizer + toggles (hidden when compact) ── */}
      <pixiContainer
        visible={!compactToolbar}
        layout={{
          width: '100%',
          height: compactToolbar ? 0 : VIZ_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics
          draw={drawVizRowBg}
          layout={{ ...LAYOUT_FILL_ROW, height: VIZ_ROW_H }}
        />

        {/* Visualizer */}
        <PixiVisualizer width={200} height={VIZ_ROW_H - 8} />

        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />

        {/* PAT toggle */}
        <PixiButton
          label="PAT"
          variant={showPatterns ? 'ft2' : 'ghost'}
          color={showPatterns ? 'blue' : 'default'}
          size="sm"
          active={showPatterns}
          onClick={handleTogglePatterns}
        />

        {/* AUTO toggle */}
        <PixiButton
          label="AUTO"
          variant={showAutomation ? 'ft2' : 'ghost'}
          color={showAutomation ? 'blue' : 'default'}
          size="sm"
          active={showAutomation}
          onClick={handleToggleAutomation}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
