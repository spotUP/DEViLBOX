/**
 * PixiFT2Toolbar — FT2-style toolbar rendered entirely in Pixi (no DOM overlay).
 *
 * Layout mirrors DOM FT2Toolbar exactly:
 *   Row 1 (28px)  — PixiMenuBar: File / Module / Help menus
 *   Row 2+3 (72px) — Transport section (left flex:1) + Visualizer (right, fixed width)
 *     Row 2 (36px): Position [Tap][Ins][Del] | BPM | Pattern | Edit Step | Play Song | Play Pattern
 *     Row 3 (36px): Song Len | Speed [Groove] | Length | Song Len
 *   Row 4 (32px)  — File / action buttons: Load Save Revisions Export New Clear Order Instruments Pads Master FX Help Fullscreen
 *
 * Stores used:
 *   useTransportStore — bpm, speed, isPlaying, isLooping, play, stop, setBPM, setSpeed,
 *                       grooveTemplateId, swing, jitter, useMpcScale, setGrooveTemplate, setIsLooping
 *   useTrackerStore   — recordMode, patterns, currentPatternIndex, patternOrder,
 *                       currentPositionIndex, editStep, setEditStep, setCurrentPattern,
 *                       setPatternOrder, setCurrentPosition, duplicatePosition,
 *                       removeFromOrder, resizePattern, updatePatternName, toggleRecordMode
 *   useUIStore        — modalOpen, openModal, closeModal,
 *                       showPatterns, togglePatterns, showAutomationLanes, toggleAutomationLanes
 *   useTabsStore      — addTab (New button)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton, PixiNumericInput } from '../../components';
import { PixiFXSearchReplace } from '../../components/PixiFXSearchReplace';
import { PixiVisualizer } from './PixiVisualizer';
import { useTransportStore, useTrackerStore, useUIStore, useInstrumentStore, useProjectStore, useAudioStore, useAutomationStore, useEditorStore } from '@stores';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { useAIStore } from '@stores/useAIStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import * as Tone from 'tone';
import { exportSong, getOriginalModuleDataForExport } from '@lib/export/exporters';
import { useShallow } from 'zustand/react/shallow';
import { useTapTempo } from '@hooks/useTapTempo';

import { notify } from '@stores/useNotificationStore';
import { useHistoryStore } from '@stores/useHistoryStore';
import { saveProjectToStorage } from '@hooks/useProjectPersistence';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { getTrackerReplayer } from '@engine/TrackerReplayer';

// ─── Layout constants ────────────────────────────────────────────────────────

const TRANSPORT_ROW_H = 36; // each transport row min-height (matches DOM — needs room for FT2Cell label+input)
const TRANSPORT_PAD = 6; // top + bottom padding
const TRANSPORT_GAP = 4; // gap between rows
const TRANSPORT_SECTION_H = TRANSPORT_ROW_H * 2 + TRANSPORT_PAD * 2 + TRANSPORT_GAP; // 36+36+12+4 = 88
const FILE_ROW_H  = 32;
const VIZ_WIDTH   = 220;

/** Total toolbar height (transport section + file row) */
export const FT2_TOOLBAR_HEIGHT = TRANSPORT_SECTION_H + FILE_ROW_H;

// ─── Stable layout objects ───────────────────────────────────────────────────

// ─── Labeled FT2-style numeric cell ──────────────────────────────────────────

interface FT2CellProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  width?: number;
  presets?: Array<{ label: string; value: number }>;
  formatValue?: (v: number) => string;
}

/** Default FT2-style zero-padded 3-digit display (matches DOM toolbar) */
const ft2Pad3 = (v: number) => v.toString().padStart(3, '0');

const FT2Cell: React.FC<FT2CellProps> = ({ label, value, min, max, onChange, width = 52, presets, formatValue }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
      <pixiBitmapText
        text={`${label.toUpperCase()}:`}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
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
        formatValue={formatValue ?? ft2Pad3}
      />
    </pixiContainer>
  );
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
  })));

  // ── Tracker store ─────────────────────────────────────────────────────────
  const {
    patterns,
    currentPatternIndex, setCurrentPattern,
    patternOrder, setPatternOrder,
    currentPositionIndex, setCurrentPosition,
    duplicatePosition, removeFromOrder,
    resizePattern, replacePattern,
  } = useTrackerStore(useShallow(s => ({
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    setCurrentPattern: s.setCurrentPattern,
    patternOrder: s.patternOrder,
    setPatternOrder: s.setPatternOrder,
    currentPositionIndex: s.currentPositionIndex,
    setCurrentPosition: s.setCurrentPosition,
    duplicatePosition: s.duplicatePosition,
    removeFromOrder: s.removeFromOrder,
    resizePattern: s.resizePattern,
    replacePattern: s.replacePattern,
  })));

  // ── History store (undo/redo) ───────────────────────────────────────────
  const { undo, redo, canUndo, canRedo } = useHistoryStore(useShallow(s => ({
    undo: s.undo, redo: s.redo, canUndo: s.canUndo, canRedo: s.canRedo,
  })));

  const handleUndo = useCallback(() => {
    if (!canUndo()) return;
    const pattern = undo();
    if (pattern) replacePattern(currentPatternIndex, pattern);
  }, [undo, canUndo, replacePattern, currentPatternIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo()) return;
    const pattern = redo();
    if (pattern) replacePattern(currentPatternIndex, pattern);
  }, [redo, canRedo, replacePattern, currentPatternIndex]);

  const editStep = useEditorStore(s => s.editStep);
  const setEditStep = useEditorStore(s => s.setEditStep);



  // ── UI store ─────────────────────────────────────────────────────────────
  const modalOpen = useUIStore(s => s.modalOpen);

  // ── AI store ─────────────────────────────────────────────────────────────
  const aiOpen = useAIStore(s => s.isOpen);
  const toggleAI = useAIStore(s => s.toggle);

  // ── Project store (isDirty for Save button label) ─────────────────────────
  const isDirty = useProjectStore(s => s.isDirty);

  // ── WASM position (for formats like MusicLine that bypass replayer) ───────
  const wasmSongPos = useWasmPositionStore(s => s.songPos);
  const wasmActive = useWasmPositionStore(s => s.active);

  // ── Derived values ────────────────────────────────────────────────────────
  const displayPositionIndex = (isPlaying && wasmActive) ? Math.min(wasmSongPos, patternOrder.length - 1) : currentPositionIndex;
  const currentPattern = patterns[currentPatternIndex];
  const patternLength = currentPattern?.length ?? 64;
  const songLength = patternOrder.length;
  const currentPatternInOrder = patternOrder[displayPositionIndex] ?? currentPatternIndex;

  // Groove button moved to EditorControlsBar (matching DOM)

  const editorMode = useFormatStore((s) => s.editorMode);
  const gtPlaying = useGTUltraStore((s) => s.playing);
  const isGT = editorMode === 'goattracker';
  const isPlayingSong    = (isGT ? gtPlaying : isPlaying && !isLooping);
  const isPlayingPattern = (isGT ? gtPlaying : isPlaying && isLooping);


  // ── Tap Tempo ─────────────────────────────────────────────────────────────
  const { tap: handleTapTempo, tapCount, isActive: tapActive } = useTapTempo(setBPM);

  // ── ASID hardware toggle ───────────────────────────────────────────────────
  const asidEnabled = useSettingsStore(s => s.asidEnabled);
  const [, setAsidReady] = useState(false);

  const handleToggleASID = useCallback(async () => {
    const settings = useSettingsStore.getState();
    if (settings.asidEnabled) {
      settings.setAsidEnabled(false);
      setAsidReady(false);
      notify.info('ASID hardware output disabled');
    } else {
      try {
        const { getASIDDeviceManager } = await import('@lib/sid/ASIDDeviceManager');
        const mgr = getASIDDeviceManager();
        await mgr.init();
        const devices = mgr.getDevices();
        if (devices.length === 0) {
          notify.warning('No ASID devices found. Connect USB-SID-Pico and retry.');
          return;
        }
        if (!settings.asidDeviceId && devices.length > 0) {
          settings.setAsidDeviceId(devices[0].id);
          mgr.selectDevice(devices[0].id);
        }
        settings.setAsidEnabled(true);
        setAsidReady(mgr.isDeviceReady());
        notify.success(`ASID enabled: ${devices[0]?.name || 'device'}`);
      } catch (err) {
        notify.error(`ASID init failed: ${err}`);
      }
    }
  }, []);

  // ── Power cut — shift+click on Play Song / Play Pattern ──────────────────
  const shiftKeyRef = useRef(false);
  const handleTransportPointerDown = useCallback((e: FederatedPointerEvent) => {
    shiftKeyRef.current = (e.nativeEvent as PointerEvent).shiftKey;
  }, []);

  // ── Modal handlers ────────────────────────────────────────────────────────
  const handleShowExport      = useCallback(() => useUIStore.getState().openModal('export'), []);
  const handleShowHelp        = useCallback((tab?: string) => useUIStore.getState().openModal('help', { initialTab: tab ?? 'shortcuts' }), []);
  const handleShowMasterFX    = useCallback(() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }, []);
  const handleShowInstruments  = useCallback(() => useUIStore.getState().openModal('instruments'), []);
  const handleShowPatternOrder = useCallback(() => useUIStore.getState().openModal('patternOrder'), []);
  const handleShowDrumpads     = useCallback(() => useUIStore.getState().openModal('drumpads'), []);

  // ── File operations ───────────────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    useUIStore.getState().setShowFileBrowser(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const saved = await saveProjectToStorage({ explicit: true });
      if (saved) {
        notify.success('Project saved!', 2000);
      } else {
        notify.error('Failed to save project');
      }
    } catch {
      notify.error('Failed to save project');
    }
  }, []);

  const handleDownload = useCallback(() => {
    try {
      const { patterns } = useTrackerStore.getState();
      const { metadata } = useProjectStore.getState();
      const { bpm, grooveTemplateId: gtId } = useTransportStore.getState();
      const { instruments } = useInstrumentStore.getState();
      const { masterEffects } = useAudioStore.getState();
      const { curves } = useAutomationStore.getState();
      const { patternOrder } = useTrackerStore.getState();
      const sequence = patternOrder.map(idx => patterns[idx]?.id).filter(Boolean);
      const automationData: Record<string, Record<number, Record<string, unknown>>> = {};
      patterns.forEach((pattern) => {
        pattern.channels.forEach((_ch, channelIndex) => {
          const ch = curves.filter((c) => c.patternId === pattern.id && c.channelIndex === channelIndex);
          if (ch.length > 0) {
            if (!automationData[pattern.id]) automationData[pattern.id] = {};
            automationData[pattern.id][channelIndex] = ch.reduce(
              (acc, c) => { acc[c.parameter] = c; return acc; },
              {} as Record<string, unknown>
            );
          }
        });
      });
      const { speed } = useTransportStore.getState();
      const { linearPeriods } = useEditorStore.getState();
      const trackerFormat = patterns[0]?.importMetadata?.sourceFormat as string | undefined;
      exportSong(
        metadata, bpm, instruments, patterns, sequence,
        Object.keys(automationData).length > 0 ? automationData : undefined,
        masterEffects.length > 0 ? masterEffects : undefined,
        curves.length > 0 ? curves : undefined,
        { prettify: true }, gtId,
        { speed, trackerFormat, linearPeriods },
        patternOrder,
        getOriginalModuleDataForExport(),
      );
      notify.success('Song downloaded!', 2000);
    } catch {
      notify.error('Failed to download file');
    }
  }, []);

  const handleClearProject = useCallback(() => {
    if (!window.confirm('Clear project? Unsaved changes will be lost.')) return;
    if (isPlaying) stop();
    useTrackerStore.getState().reset();
    useTransportStore.getState().reset();
    useInstrumentStore.getState().reset();
    useAutomationStore.getState().reset();
    notify.success('Project cleared', 1500);
  }, [isPlaying, stop]);

  // ── Import file (module/midi/audio) ────────────────────────────────────────
  const handleImportFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xm,.mod,.s3m,.it,.mptm,.fur,.dmf,.mid,.midi,.wav,.mp3,.ogg,.flac,.aiff,.sid,.sng,.med,.hvl,.ahx,.jam,.td3,.sunvox,.sunsynth';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) useUIStore.getState().setPendingModuleFile(file);
    };
    input.click();
  }, []);

  // ── Transport handlers ────────────────────────────────────────────────────

  const handlePlaySong = useCallback(async () => {
    // GT Ultra: delegate to its own engine
    if (isGT) {
      await Tone.start();
      const gtStore = useGTUltraStore.getState();
      const gtEngine = gtStore.engine;
      if (!gtEngine) return;
      const ctx = Tone.getContext().rawContext as AudioContext;
      if (ctx.state !== 'running') await ctx.resume();
      if (gtStore.playing) { gtEngine.stop(); gtStore.setPlaying(false); }
      else { gtEngine.play(); gtStore.setPlaying(true); }
      return;
    }
    if (isPlayingSong) {
      if (shiftKeyRef.current) { getTrackerScratchController().triggerPowerCut(); return; }
      // Instant restart from position 0, row 0
      getTrackerReplayer().forcePosition(0, 0);
      return;
    }
    setIsLooping(false);
    await play().catch(() => {});
  }, [isGT, isPlayingSong, setIsLooping, play]);

  const handlePlayPattern = useCallback(async () => {
    // GT Ultra: delegate (pattern play = same as song play for GT)
    if (isGT) {
      await Tone.start();
      const gtStore = useGTUltraStore.getState();
      const gtEngine = gtStore.engine;
      if (!gtEngine) return;
      const ctx = Tone.getContext().rawContext as AudioContext;
      if (ctx.state !== 'running') await ctx.resume();
      if (gtStore.playing) { gtEngine.stop(); gtStore.setPlaying(false); }
      else { gtEngine.play(); gtStore.setPlaying(true); }
      return;
    }
    if (isPlayingPattern) {
      if (shiftKeyRef.current) { getTrackerScratchController().triggerPowerCut(); return; }
      // Instant restart from current position, row 0
      const startPos = useTrackerStore.getState().currentPositionIndex;
      getTrackerReplayer().forcePosition(startPos, 0);
      return;
    }
    if (isPlaying) stop();
    setIsLooping(true);
    await play().catch(() => {});
  }, [isGT, isPlayingPattern, isPlaying, stop, setIsLooping, play]);


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



  // ── FX Search & Replace panel ─────────────────────────────────────────────
  const [showFXSearchReplace, setShowFXSearchReplace] = useState(false);
  const handleToggleFXSearchReplace = useCallback(() => setShowFXSearchReplace(v => !v), []);

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

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: FT2_TOOLBAR_HEIGHT,
        flexShrink: 0,
        flexDirection: 'column',
      }}
    >
      {/* ── Rows 1+2: Transport section + Visualizer side-by-side ── */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TRANSPORT_SECTION_H,
          flexDirection: 'row',
        }}
      >
        {/* Left: two transport rows stacked — DOM: padding 8px 14px, gap 4px */}
        <pixiContainer layout={{ flex: 1, flexDirection: 'column', padding: 8, paddingLeft: 14, paddingRight: 14, gap: 4, backgroundColor: theme.bgSecondary.color, borderBottomWidth: 1, borderColor: theme.border.color }}>

          {/* Transport Row 1: Position | BPM | Pattern | EditStep | PlaySong PlayPattern */}
          <layoutContainer
            eventMode="static"
            onPointerDown={handleTransportPointerDown}
            layout={{
              width: '100%',
              minHeight: 32,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >

            {/* Col 1: Position + Tap/Ins/Del (260px matching DOM .ft2-col-1) */}
            <pixiContainer layout={{ width: 260, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <FT2Cell label="Position" value={displayPositionIndex} min={0} max={Math.max(0, songLength - 1)} onChange={handlePositionChange} width={44} />
              <PixiButton
                label={tapActive ? `Tap${tapCount > 0 ? ` (${tapCount})` : ''}` : 'Tap'}
                variant={tapActive ? 'ft2' : 'ghost'}
                color={tapActive ? 'green' : 'default'}
                size="sm"
                onClick={handleTapTempo}
              />
              <PixiButton label="Ins" variant="ghost" size="sm" onClick={handleInsert} />
              <PixiButton label="Del" variant="ghost" size="sm" onClick={handleDelete} />
            </pixiContainer>

            {/* Col 2: BPM (220px matching DOM .ft2-col-2) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
              <FT2Cell label="BPM" value={bpm} min={32} max={255} onChange={setBPM} width={48} />
            </pixiContainer>

            {/* Col 3: Pattern (220px matching DOM .ft2-col-3) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
              <FT2Cell label="Pattern" value={currentPatternInOrder} min={0} max={Math.max(0, patterns.length - 1)} onChange={handlePatternChange} width={48} />
            </pixiContainer>

            {/* Col 4: Edit Step (220px matching DOM .ft2-col-4) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
              <FT2Cell label="Edit Step" value={editStep} min={0} max={16} onChange={setEditStep} width={48} />
            </pixiContainer>

            {/* Col 5: Play Song / Play Pattern (flex 1 matching DOM .ft2-section-playback) */}
            <pixiContainer layout={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 }}>
              <PixiButton
                label={isPlayingSong ? 'Stop Song' : 'Play Song'}
                variant={isPlayingSong ? 'danger' : 'primary'}
                size="sm"
                onClick={handlePlaySong}
                width={72}
              />
              <PixiButton
                label={isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}
                variant={isPlayingPattern ? 'danger' : 'primary'}
                size="sm"
                onClick={handlePlayPattern}
                width={88}
              />
              <PixiButton
                label="Hardware"
                variant={asidEnabled ? 'primary' : 'default'}
                size="sm"
                active={asidEnabled}
                onClick={handleToggleASID}
                width={72}
              />
            </pixiContainer>

            {/* Spacer */}
            <pixiContainer layout={{ flex: 1 }} />
          </layoutContainer>

          {/* Transport Row 2: SongLen | Speed Groove | Length | PatternName */}
          <layoutContainer
            layout={{
              width: '100%',
              minHeight: 32,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >

            {/* Col 1: Song Len (260px matching DOM .ft2-col-1) */}
            <pixiContainer layout={{ width: 260, flexDirection: 'row', alignItems: 'center' }}>
              <FT2Cell label="Song Len" value={songLength} min={1} max={256} onChange={handleSongLengthChange} width={48} />
            </pixiContainer>

            {/* Col 2: Speed (220px matching DOM .ft2-col-2) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
              <FT2Cell label="Speed" value={speed} min={1} max={31} onChange={setSpeed} width={44} />
            </pixiContainer>

            {/* Col 3: Length (220px matching DOM .ft2-col-3) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
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
            </pixiContainer>

            {/* Col 4: Song Len duplicate (220px matching DOM .ft2-col-4) */}
            <pixiContainer layout={{ width: 220, flexDirection: 'row', alignItems: 'center', paddingLeft: 10 }}>
              <FT2Cell label="Song Len" value={songLength} min={1} max={256} onChange={handleSongLengthChange} width={48} />
            </pixiContainer>

            {/* Col 5: spacer (flex 1) */}
            <pixiContainer layout={{ flex: 1 }} />
          </layoutContainer>
        </pixiContainer>

        {/* Right: Visualizer */}
        <pixiContainer
          layout={{
            width: VIZ_WIDTH,
            height: TRANSPORT_SECTION_H,
            overflow: 'hidden',
          }}
        >
          {/* Visualizer rendered first — PAT/AUTO buttons go on top in Pixi's compositor */}
          <PixiVisualizer width={VIZ_WIDTH} height={TRANSPORT_SECTION_H} />
        </pixiContainer>
      </pixiContainer>

      {/* ── Row 4: File / action buttons ── */}
      <layoutContainer
        layout={{
          width: '100%',
          height: FILE_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 4,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >

        <PixiButton label="Load"                    variant="ghost" size="sm" onClick={handleLoad} />
        <PixiButton label={isDirty ? 'Save*' : 'Save'} variant="ghost" size="sm" onClick={handleSave} />
        <PixiButton label="Undo" variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo()} />
        <PixiButton label="Redo" variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo()} />
        <PixiButton label="Download"                variant="ghost" size="sm" onClick={handleDownload} />
        <PixiButton label="Export"      variant="ghost" size="sm" onClick={handleShowExport} />
        <PixiButton label="New"         variant="ghost" size="sm" onClick={() => useUIStore.getState().openNewSongWizard()} />
        <PixiButton label="Clear"       variant="ghost" size="sm" onClick={handleClearProject} />
        <PixiButton label="Import"      variant="ghost" size="sm" onClick={handleImportFile} />
        <PixiButton label="Order"       variant="ghost" size="sm" onClick={handleShowPatternOrder} />
        <PixiButton
          label="FX Search"
          variant={showFXSearchReplace ? 'ft2' : 'ghost'}
          color={showFXSearchReplace ? 'blue' : 'default'}
          size="sm"
          active={showFXSearchReplace}
          onClick={handleToggleFXSearchReplace}
        />
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
        <PixiButton
          label="Inst FX"
          variant={modalOpen === 'instrumentFx' ? 'ft2' : 'ghost'}
          color={modalOpen === 'instrumentFx' ? 'purple' : 'default'}
          size="sm"
          active={modalOpen === 'instrumentFx'}
          onClick={() => { const s = useUIStore.getState(); if (s.modalOpen === 'instrumentFx') { s.closeModal(); } else { s.openModal('instrumentFx'); } }}
        />
        <PixiButton
          label="AI"
          variant={aiOpen ? 'ft2' : 'ghost'}
          color={aiOpen ? 'green' : 'default'}
          size="sm"
          active={aiOpen}
          onClick={toggleAI}
        />
        <PixiButton label="Help"      variant="ghost" size="sm" onClick={() => handleShowHelp('shortcuts')} />
        <PixiButton
          label="Info"
          variant={modalOpen === 'moduleInfo' ? 'ft2' : 'ghost'}
          color={modalOpen === 'moduleInfo' ? 'blue' : 'default'}
          size="sm"
          active={modalOpen === 'moduleInfo'}
          onClick={() => { const s = useUIStore.getState(); if (s.modalOpen === 'moduleInfo') { s.closeModal(); } else { requestAnimationFrame(() => s.openModal('moduleInfo')); } }}
        />
        <PixiButton
          label=""
          icon={isFullscreen ? 'zoomout' : 'zoomin'}
          variant={isFullscreen ? 'ft2' : 'ghost'}
          color={isFullscreen ? 'blue' : 'default'}
          size="sm"
          active={isFullscreen}
          onClick={handleToggleFullscreen}
        />
      </layoutContainer>

      {/* FX Search & Replace floating panel */}
      {showFXSearchReplace && (
        <PixiFXSearchReplace
          width={380}
          height={196}
          onClose={() => setShowFXSearchReplace(false)}
        />
      )}
    </pixiContainer>
  );
};
