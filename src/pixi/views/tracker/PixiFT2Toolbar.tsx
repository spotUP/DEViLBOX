/**
 * PixiFT2Toolbar — FT2-style toolbar rendered entirely in Pixi (no DOM overlay).
 *
 * Layout mirrors DOM FT2Toolbar exactly:
 *   Row 1 (28px)  — PixiMenuBar: File / Module / Help menus
 *   Row 2+3 (72px) — Transport section (left flex:1) + Visualizer (right, fixed width)
 *     Row 2 (36px): Position [Tap][Ins][Del] | BPM | Pattern | Edit Step | Play Song | Play Pattern
 *     Row 3 (36px): Song Len | Speed [Groove] | Length | Song Len
 *   Row 4 (32px)  — File / action buttons: Load Save Revisions Export New Clear Order Instruments Pads Master FX Reference Help Settings Fullscreen
 *
 * Stores used:
 *   useTransportStore — bpm, speed, isPlaying, isLooping, play, stop, setBPM, setSpeed,
 *                       grooveTemplateId, swing, jitter, useMpcScale, setGrooveTemplate, setIsLooping
 *   useTrackerStore   — recordMode, patterns, currentPatternIndex, patternOrder,
 *                       currentPositionIndex, editStep, setEditStep, setCurrentPattern,
 *                       setPatternOrder, setCurrentPosition, duplicatePosition,
 *                       removeFromOrder, resizePattern, updatePatternName, toggleRecordMode
 *   useUIStore        — modalOpen, openModal, closeModal, compactToolbar, toggleCompactToolbar,
 *                       showPatterns, togglePatterns, showAutomationLanes, toggleAutomationLanes
 *   useTabsStore      — addTab (New button)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiMenuBar } from '../../components/PixiMenuBar';
import { PixiButton, PixiNumericInput } from '../../components';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { PixiVisualizer } from './PixiVisualizer';
import { useTransportStore, useTrackerStore, useUIStore, useTabsStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useTapTempo } from '@hooks/useTapTempo';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { buildFT2Menus } from './ft2MenuDefs';
import { notify } from '@stores/useNotificationStore';

// ─── Layout constants ────────────────────────────────────────────────────────

const MENU_ROW_H  = 28;
const TRANSPORT_ROW_H = 36; // each transport row (×2)
const FILE_ROW_H  = 32;
const VIZ_WIDTH   = 220;

/** Total toolbar height (both transport rows + file row + menu row) */
export const FT2_TOOLBAR_HEIGHT = MENU_ROW_H + TRANSPORT_ROW_H * 2 + FILE_ROW_H;
/** Compact height — Row 4 (file action buttons) hidden, saving 32px */
export const FT2_TOOLBAR_HEIGHT_COMPACT = MENU_ROW_H + TRANSPORT_ROW_H * 2;

// ─── Stable layout objects ───────────────────────────────────────────────────

const LAYOUT_FILL_ROW: Record<string, unknown> = { position: 'absolute', width: '100%' };

// ─── Labeled FT2-style numeric cell ──────────────────────────────────────────

interface FT2CellProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  width?: number;
  presets?: Array<{ label: string; value: number }>;
}

const FT2Cell: React.FC<FT2CellProps> = ({ label, value, min, max, onChange, width = 52, presets }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
      <pixiBitmapText
        text={label.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
      />
      <PixiNumericInput
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={onChange}
        width={width}
        presets={presets}
      />
    </pixiContainer>
  );
};

// ─── Vertical separator ──────────────────────────────────────────────────────

const TransportSep: React.FC<{ height?: number }> = ({ height = 26 }) => {
  const theme = usePixiTheme();
  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 1, height);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [height, theme]);
  return <pixiGraphics draw={draw} layout={{ width: 1, height, alignSelf: 'center', marginLeft: 2, marginRight: 2 }} />;
};

// ─── PixiFT2Toolbar ──────────────────────────────────────────────────────────

export const PixiFT2Toolbar: React.FC = () => {
  const theme = usePixiTheme();

  // ── Transport store ──────────────────────────────────────────────────────
  const {
    bpm, setBPM,
    speed, setSpeed,
    isPlaying, isLooping,
    play, stop, setIsLooping,
    grooveTemplateId, swing, jitter, useMpcScale,
  } = useTransportStore(useShallow(s => ({
    bpm: s.bpm,
    setBPM: s.setBPM,
    speed: s.speed,
    setSpeed: s.setSpeed,
    isPlaying: s.isPlaying,
    isLooping: s.isLooping,
    play: s.play,
    stop: s.stop,
    setIsLooping: s.setIsLooping,
    grooveTemplateId: s.grooveTemplateId,
    swing: s.swing,
    jitter: s.jitter,
    useMpcScale: s.useMpcScale,
  })));

  // ── Tracker store ─────────────────────────────────────────────────────────
  const {
    patterns,
    currentPatternIndex, setCurrentPattern,
    patternOrder, setPatternOrder,
    currentPositionIndex, setCurrentPosition,
    editStep, setEditStep,
    duplicatePosition, removeFromOrder,
    resizePattern, updatePatternName,
    toggleRecordMode, recordMode,
  } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCurrentPattern: s.setCurrentPattern,
    patternOrder: s.patternOrder,
    setPatternOrder: s.setPatternOrder,
    currentPositionIndex: s.currentPositionIndex,
    setCurrentPosition: s.setCurrentPosition,
    editStep: s.editStep,
    setEditStep: s.setEditStep,
    duplicatePosition: s.duplicatePosition,
    removeFromOrder: s.removeFromOrder,
    resizePattern: s.resizePattern,
    updatePatternName: s.updatePatternName,
    toggleRecordMode: s.toggleRecordMode,
    recordMode: s.recordMode,
  })));

  const addTab = useTabsStore(s => s.addTab);

  // ── UI store ─────────────────────────────────────────────────────────────
  const modalOpen = useUIStore(s => s.modalOpen);
  const compactToolbar = useUIStore(s => s.compactToolbar);
  const showPatterns = useUIStore(s => s.showPatterns);
  const showAutomation = useUIStore(s => s.showAutomationLanes);

  // ── Derived values ────────────────────────────────────────────────────────
  const currentPattern = patterns[currentPatternIndex];
  const patternName = currentPattern?.name ?? '';
  const patternLength = currentPattern?.length ?? 64;
  const songLength = patternOrder.length;
  const currentPatternInOrder = patternOrder[currentPositionIndex] ?? currentPatternIndex;

  const grooveActive = grooveTemplateId !== 'straight' || swing !== (useMpcScale ? 50 : 100) || jitter > 0;
  const grooveName = GROOVE_TEMPLATES.find(g => g.id === grooveTemplateId)?.name ?? 'Groove';

  const isPlayingSong    = isPlaying && !isLooping;
  const isPlayingPattern = isPlaying && isLooping;

  // ── Pattern name local state ──────────────────────────────────────────────
  const [localName, setLocalName] = useState(patternName);
  const nameRef = useRef(patternName);
  useEffect(() => {
    nameRef.current = patternName;
    setLocalName(patternName);
  }, [patternName]);

  // ── Tap Tempo ─────────────────────────────────────────────────────────────
  const { tap: handleTapTempo, tapCount, isActive: tapActive } = useTapTempo(setBPM);

  // ── Modal handlers ────────────────────────────────────────────────────────
  const handleShowExport      = useCallback(() => useUIStore.getState().openModal('export'), []);
  const handleShowHelp        = useCallback((tab?: string) => useUIStore.getState().openModal('help', { initialTab: tab ?? 'shortcuts' }), []);
  const handleShowMasterFX    = useCallback(() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }, []);
  const handleShowInstrumentFX = useCallback(() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }, []);
  const handleShowInstruments  = useCallback(() => useUIStore.getState().openModal('instruments'), []);
  const handleShowPatternOrder = useCallback(() => useUIStore.getState().openModal('patternOrder'), []);
  const handleShowDrumpads     = useCallback(() => useUIStore.getState().openModal('drumpads'), []);
  const handleShowSettings     = useCallback(() => useUIStore.getState().openModal('settings'), []);
  const handleShowGroove       = useCallback(() => useUIStore.getState().openModal('grooveSettings'), []);
  const handleShowRevisions    = useCallback(() => useUIStore.getState().openModal('revisions'), []);

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

  // ── Transport handlers ────────────────────────────────────────────────────
  const handlePlaySong = useCallback(async () => {
    if (isPlayingSong) { stop(); return; }
    setIsLooping(false);
    await play().catch(() => {});
  }, [isPlayingSong, stop, setIsLooping, play]);

  const handlePlayPattern = useCallback(async () => {
    if (isPlayingPattern) { stop(); return; }
    if (isPlaying) stop();
    setIsLooping(true);
    await play().catch(() => {});
  }, [isPlayingPattern, isPlaying, stop, setIsLooping, play]);

  const handleStop = useCallback(() => { stop(); }, [stop]);

  // ── Pattern position / order handlers ─────────────────────────────────────
  const handlePositionChange = useCallback((v: number) => setCurrentPosition(v), [setCurrentPosition]);
  const handleInsert = useCallback(() => duplicatePosition(currentPositionIndex), [duplicatePosition, currentPositionIndex]);
  const handleDelete = useCallback(() => { if (patternOrder.length > 1) removeFromOrder(currentPositionIndex); }, [patternOrder.length, removeFromOrder, currentPositionIndex]);
  const handlePatternChange = useCallback((v: number) => {
    const order = [...patternOrder]; order[currentPositionIndex] = v; setPatternOrder(order); setCurrentPattern(v);
  }, [patternOrder, currentPositionIndex, setPatternOrder, setCurrentPattern]);
  const handleSongLengthChange = useCallback((newLen: number) => {
    const cur = patternOrder.length;
    if (newLen > cur) {
      const order = [...patternOrder];
      for (let i = cur; i < newLen; i++) order.push(patternOrder[patternOrder.length - 1] ?? 0);
      setPatternOrder(order);
    } else if (newLen < cur && newLen >= 1) {
      setPatternOrder(patternOrder.slice(0, newLen));
      if (currentPositionIndex >= newLen) setCurrentPosition(newLen - 1);
    }
  }, [patternOrder, currentPositionIndex, setPatternOrder, setCurrentPosition]);
  const handleLengthChange = useCallback((v: number) => { if (v >= 1 && v <= 256) resizePattern(currentPatternIndex, v); }, [resizePattern, currentPatternIndex]);

  // ── Pattern name handlers ─────────────────────────────────────────────────
  const handleNameChange = useCallback((v: string) => setLocalName(v), []);
  const handleNameSubmit = useCallback((v: string) => updatePatternName(currentPatternIndex, v), [updatePatternName, currentPatternIndex]);
  const handleNameCancel = useCallback(() => setLocalName(nameRef.current), []);

  // ── Toggle handlers ───────────────────────────────────────────────────────
  const handleToggleCompact   = useCallback(() => useUIStore.getState().toggleCompactToolbar(), []);
  const handleTogglePatterns  = useCallback(() => useUIStore.getState().togglePatterns(), []);
  const handleToggleAutomation= useCallback(() => useUIStore.getState().toggleAutomationLanes(), []);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* ignore */ }
  }, []);

  // ── Background draws ──────────────────────────────────────────────────────
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

  const drawTransportRow2Bg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, TRANSPORT_ROW_H);
    g.fill({ color: theme.bg.color });
    g.rect(0, TRANSPORT_ROW_H - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  const drawFileRowBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, FILE_ROW_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, FILE_ROW_H - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: compactToolbar ? FT2_TOOLBAR_HEIGHT_COMPACT : FT2_TOOLBAR_HEIGHT,
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
        <pixiGraphics draw={drawMenuRowBg} layout={{ ...LAYOUT_FILL_ROW, height: MENU_ROW_H }} />
        <PixiMenuBar menus={menus} height={MENU_ROW_H} />
      </pixiContainer>

      {/* ── Rows 2+3: Transport section + Visualizer side-by-side ── */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TRANSPORT_ROW_H * 2,
          flexDirection: 'row',
        }}
      >
        {/* Left: two transport rows stacked */}
        <pixiContainer layout={{ flex: 1, flexDirection: 'column' }}>

          {/* Transport Row 1: Position | BPM | Pattern | EditStep | PlaySong PlayPattern */}
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
            <pixiGraphics draw={drawTransportRowBg} layout={{ ...LAYOUT_FILL_ROW, height: TRANSPORT_ROW_H }} />

            {/* Position */}
            <FT2Cell label="Pos" value={currentPositionIndex} min={0} max={Math.max(0, songLength - 1)} onChange={handlePositionChange} width={44} />

            {/* Tap | Ins | Del */}
            <PixiButton
              label={tapActive ? `Tap${tapCount > 0 ? ` (${tapCount})` : ''}` : 'Tap'}
              variant={tapActive ? 'ft2' : 'ghost'}
              color={tapActive ? 'green' : 'default'}
              size="sm"
              onClick={handleTapTempo}
            />
            <PixiButton label="Ins" variant="ghost" size="sm" onClick={handleInsert} />
            <PixiButton label="Del" variant="ghost" size="sm" onClick={handleDelete} />

            <TransportSep />

            {/* BPM */}
            <FT2Cell label="BPM" value={bpm} min={32} max={255} onChange={setBPM} width={48} />

            <TransportSep />

            {/* Pattern */}
            <FT2Cell label="Pattern" value={currentPatternInOrder} min={0} max={Math.max(0, patterns.length - 1)} onChange={handlePatternChange} width={48} />

            <TransportSep />

            {/* Edit Step */}
            <FT2Cell label="Edit Step" value={editStep} min={0} max={16} onChange={setEditStep} width={48} />

            <TransportSep />

            {/* Play Song / Play Pattern */}
            <PixiButton
              label={isPlayingSong ? 'Stop Song' : 'Play Song'}
              variant="ft2"
              color={isPlayingSong ? 'red' : 'green'}
              size="sm"
              active={isPlayingSong}
              onClick={handlePlaySong}
            />
            <PixiButton
              label={isPlayingPattern ? 'Stop Pat.' : 'Play Pat.'}
              variant="ft2"
              color={isPlayingPattern ? 'red' : 'default'}
              size="sm"
              active={isPlayingPattern}
              onClick={handlePlayPattern}
            />

            {/* Spacer + compact toggle */}
            <pixiContainer layout={{ flex: 1 }} />
            <PixiButton
              label={compactToolbar ? 'Expand' : 'Compact'}
              variant="ghost"
              size="sm"
              onClick={handleToggleCompact}
            />
          </pixiContainer>

          {/* Transport Row 2: SongLen | Speed Groove | Length | PatternName */}
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
            <pixiGraphics draw={drawTransportRow2Bg} layout={{ ...LAYOUT_FILL_ROW, height: TRANSPORT_ROW_H }} />

            {/* Song Length */}
            <FT2Cell
              label="Song Len"
              value={songLength}
              min={1}
              max={256}
              onChange={handleSongLengthChange}
              width={48}
            />

            <TransportSep />

            {/* Speed + Groove button */}
            <FT2Cell label="Speed" value={speed} min={1} max={31} onChange={setSpeed} width={44} />
            <PixiButton
              label={grooveName}
              variant={grooveActive ? 'ft2' : 'ghost'}
              color={grooveActive ? 'blue' : 'default'}
              size="sm"
              active={grooveActive}
              onClick={handleShowGroove}
            />

            <TransportSep />

            {/* Length (pattern rows) */}
            <FT2Cell
              label="Length"
              value={patternLength}
              min={1}
              max={256}
              onChange={handleLengthChange}
              width={48}
              presets={[
                { label: '16 rows', value: 16 },
                { label: '32 rows', value: 32 },
                { label: '48 rows', value: 48 },
                { label: '64 rows (default)', value: 64 },
                { label: '96 rows', value: 96 },
                { label: '128 rows', value: 128 },
                { label: '192 rows', value: 192 },
                { label: '256 rows (max)', value: 256 },
              ]}
            />

            <TransportSep />

            {/* Pattern name */}
            <pixiBitmapText
              text="PAT"
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ alignSelf: 'center' }}
            />
            <PixiPureTextInput
              value={localName}
              onChange={handleNameChange}
              onSubmit={handleNameSubmit}
              onCancel={handleNameCancel}
              placeholder="Pattern name..."
              width={110}
              height={22}
              fontSize={10}
              font="mono"
            />

            {/* REC + Stop */}
            <pixiContainer layout={{ flex: 1 }} />
            <PixiButton
              label="REC"
              variant={recordMode ? 'ft2' : 'ghost'}
              color={recordMode ? 'red' : 'default'}
              size="sm"
              active={recordMode}
              onClick={toggleRecordMode}
            />
            <PixiButton
              label="Stop"
              variant="ft2"
              color="default"
              size="sm"
              onClick={handleStop}
            />
          </pixiContainer>
        </pixiContainer>

        {/* Right: Visualizer (hidden when compact) */}
        <pixiContainer
          layout={{
            width: compactToolbar ? 0 : VIZ_WIDTH,
            height: TRANSPORT_ROW_H * 2,
            overflow: 'hidden',
          }}
        >
          {!compactToolbar && (
            <>
              {/* Visualizer rendered first — PAT/AUTO buttons go on top in Pixi's compositor */}
              <PixiVisualizer width={VIZ_WIDTH} height={TRANSPORT_ROW_H * 2} />
              {/* PAT/AUTO toggles overlay — must come after PixiVisualizer in tree so they render on top */}
              <pixiContainer
                layout={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  flexDirection: 'row',
                  gap: 4,
                }}
              >
                <PixiButton
                  label="PAT"
                  variant={showPatterns ? 'ft2' : 'ghost'}
                  color={showPatterns ? 'blue' : 'default'}
                  size="sm"
                  active={showPatterns}
                  onClick={handleTogglePatterns}
                />
                <PixiButton
                  label="AUTO"
                  variant={showAutomation ? 'ft2' : 'ghost'}
                  color={showAutomation ? 'blue' : 'default'}
                  size="sm"
                  active={showAutomation}
                  onClick={handleToggleAutomation}
                />
              </pixiContainer>
            </>
          )}
        </pixiContainer>
      </pixiContainer>

      {/* ── Row 4: File / action buttons ── */}
      <pixiContainer
        alpha={!compactToolbar ? 1 : 0}
        renderable={!compactToolbar}
        eventMode={!compactToolbar ? 'static' : 'none'}
        layout={{
          width: '100%',
          height: compactToolbar ? 0 : FILE_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
        }}
      >
        <pixiGraphics draw={drawFileRowBg} layout={{ ...LAYOUT_FILL_ROW, height: FILE_ROW_H }} />

        <PixiButton label="Load"        variant="ghost" size="sm" onClick={() => notify.info('Use File menu to load')} />
        <PixiButton label="Save"        variant="ghost" size="sm" onClick={() => notify.info('Use File menu to save')} />
        <PixiButton label="Revisions"   variant="ghost" size="sm" onClick={handleShowRevisions} />
        <PixiButton label="Export"      variant="ghost" size="sm" onClick={handleShowExport} />
        <PixiButton label="New"         variant="ghost" size="sm" onClick={() => addTab()} />
        <PixiButton label="Clear"       variant="ghost" size="sm" onClick={() => notify.info('Use File menu to clear')} />
        <PixiButton label="Order"       variant="ghost" size="sm" onClick={handleShowPatternOrder} />
        <PixiButton label="Instruments" variant="ghost" size="sm" onClick={handleShowInstruments} />
        <PixiButton label="Pads"        variant="ghost" size="sm" onClick={handleShowDrumpads} />
        <PixiButton
          label="Master FX"
          variant={modalOpen === 'masterFx' ? 'ft2' : 'ghost'}
          color={modalOpen === 'masterFx' ? 'blue' : 'default'}
          size="sm"
          active={modalOpen === 'masterFx'}
          onClick={handleShowMasterFX}
        />
        <PixiButton label="Reference" variant="ghost" size="sm" onClick={() => handleShowHelp('chip-effects')} />
        <PixiButton label="Help"      variant="ghost" size="sm" onClick={() => handleShowHelp('shortcuts')} />
        <PixiButton label="Settings"  variant="ghost" size="sm" onClick={handleShowSettings} />
        <PixiButton
          label={isFullscreen ? '⇱' : '⇲'}
          variant={isFullscreen ? 'ft2' : 'ghost'}
          color={isFullscreen ? 'blue' : 'default'}
          size="sm"
          active={isFullscreen}
          onClick={handleToggleFullscreen}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
