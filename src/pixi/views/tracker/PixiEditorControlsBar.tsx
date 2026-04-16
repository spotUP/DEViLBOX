/**
 * PixiEditorControlsBar — Pure Pixi tracker controls bar.
 *
 * Mirrors DOM EditorControlsBar (src/components/tracker/EditorControlsBar.tsx)
 * without any PixiDOMOverlay usage.
 *
 * Contains: view mode selector, hardware preset selector, channel selector,
 * ghost patterns toggle, automation/macro lane toggles, REC button,
 * mute, smooth scrolling, groove, FPS pill, status message.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useUIStore, useFormatStore, useTrackerStore, useTransportStore, useLiveModeStore } from '@stores';
import { useEditorStore, type PasteMode, MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2 } from '@stores/useEditorStore';
import type { TrackerViewMode } from '@stores/useUIStore';
import { switchView } from '@/constants/viewOptions';
import { useShallow } from 'zustand/react/shallow';
import { useEditorControls } from '@hooks/views/useEditorControls';
import { notify } from '@stores/useNotificationStore';
import { useTrackerAnalysisDisplay } from '@/hooks/useTrackerAnalysis';
import { getGroupedPresets } from '@/constants/systemPresets';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton, PixiLabel } from '../../components';
import { useSettingsStore } from '@stores/useSettingsStore';
import { BG_MODES, getBgModeLabel } from '@/components/tracker/TrackerVisualBackground';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { PixiViewHeader } from '../../components/PixiViewHeader';

const BAR_H = 36;

const PASTE_MODE_OPTIONS: SelectOption[] = [
  { value: 'overwrite', label: 'Overwrite' },
  { value: 'mix',       label: 'Mix' },
  { value: 'flood',     label: 'Flood' },
  { value: 'insert',    label: 'Insert' },
];

const TRACKER_SUB_MODES = [
  { value: 'tracker', label: 'Tracker' },
  { value: 'grid', label: 'Grid' },
];

// ─── Genre Analysis Badge ─────────────────────────────────────────────────────

const PixiGenreAnalysisBadge: React.FC = () => {
  const theme = usePixiTheme();
  const { isCapturing, isAnalyzing, isReady, progress, genre } = useTrackerAnalysisDisplay();

  if (!isCapturing && !isAnalyzing && !isReady) return <pixiContainer />;

  if (isCapturing) {
    const barW = Math.round((progress / 100) * 48);
    return (
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 4 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 52, 14, 2);
            g.fill({ color: theme.bgSecondary.color, alpha: 1 });
            g.roundRect(0, 0, 52, 14, 2);
            g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
            // Fill bar
            if (barW > 0) {
              g.roundRect(2, 2, Math.max(2, barW), 10, 1);
              g.fill({ color: theme.accent.color, alpha: 0.6 });
            }
          }}
          layout={{ position: 'absolute', width: 52, height: 14 }}
        />
        <pixiBitmapText
          text="ANA"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>
    );
  }

  if (isAnalyzing) {
    return (
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 4 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 52, 14, 2);
            g.fill({ color: theme.accent.color, alpha: 0.15 });
            g.roundRect(0, 0, 52, 14, 2);
            g.stroke({ color: theme.accent.color, alpha: 0.4, width: 1 });
          }}
          layout={{ position: 'absolute', width: 52, height: 14 }}
        />
        <pixiBitmapText
          text="ANALYZING"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
      </pixiContainer>
    );
  }

  if (isReady && genre) {
    const label = (genre.subgenre || genre.primary).toUpperCase().slice(0, 10);
    const mood = genre.mood.toUpperCase().slice(0, 8);
    const text = `${label} \u2022 ${mood}`;
    return (
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 4 }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 120, 14, 2);
            g.fill({ color: theme.accent.color, alpha: 0.1 });
            g.roundRect(0, 0, 120, 14, 2);
            g.stroke({ color: theme.accent.color, alpha: 0.3, width: 1 });
          }}
          layout={{ position: 'absolute', width: 120, height: 14 }}
        />
        <pixiBitmapText
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ paddingLeft: 4 }}
        />
      </pixiContainer>
    );
  }

  return <pixiContainer />;
};

// ─── View Mode ───────────────────────────────────────────────────────────────

export interface PixiEditorControlsBarProps {
  viewMode: TrackerViewMode;
  onViewModeChange: (mode: TrackerViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (index: number) => void;
}

// ─── Separator ───────────────────────────────────────────────────────────────

const Sep: React.FC = () => {
  const theme = usePixiTheme();
  return (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear();
        g.rect(0, 4, 1, 24);
        g.fill({ color: theme.border.color, alpha: 0.25 });
      }}
      layout={{ width: 1, height: BAR_H }}
    />
  );
};

// ─── Hardware Preset Selector ────────────────────────────────────────────────

const HardwarePresetSelector: React.FC = () => {
  const { handleHardwarePresetChange } = useEditorControls();

  // Build flat SelectOption list from grouped presets, inserting group headers
  const options = useMemo<SelectOption[]>(() => {
    const grouped = getGroupedPresets();
    const result: SelectOption[] = [];
    for (const group of grouped) {
      result.push({ value: '__group__', label: group.label, disabled: true });
      for (const preset of group.presets) {
        result.push({ value: preset.id, label: preset.name.toUpperCase() });
      }
    }
    return result;
  }, []);

  return (
    <PixiSelect
      options={options}
      value="__none__"
      onChange={handleHardwarePresetChange}
      width={180}
      height={24}
      placeholder="Select Hardware..."
    />
  );
};

// ─── Subsong Selector ────────────────────────────────────────────────────────

const SubsongSelector: React.FC = () => {
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

  const options = useMemo<SelectOption[]>(() => {
    return subsongNames.map((name, idx) => ({
      value: String(idx),
      label: `${idx + 1}. ${name || `Subsong ${idx + 1}`}`,
    }));
  }, [subsongNames]);

  const handleChange = useCallback((val: string) => {
    const newSubsongIndex = Number(val);
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

    const isVisible = !!(furnaceData && furnaceData.subsongCount && furnaceData.subsongCount > 1);
  const currentSubsong = String(furnaceData?.currentSubsong ?? 0);

  return (
    <PixiSelect
      options={isVisible ? options : [{ value: '0', label: '' }]}
      value={currentSubsong}
      onChange={handleChange}
      width={140}
      height={24}
      layout={{ display: isVisible ? 'flex' : 'none' }}
    />
  );
};

// ─── SID Subsong Selector + Info Button ──────────────────────────────────────

const SIDSubsongAndInfo: React.FC = () => {
  const sidMetadata = useFormatStore(s => s.sidMetadata);
  const setSidMetadata = useFormatStore(s => s.setSidMetadata);
  const songDBInfo = useFormatStore(s => s.songDBInfo);

  const hasMultipleSubsongs = sidMetadata && sidMetadata.subsongs > 1;
  const hasInfo = !!(sidMetadata || songDBInfo);

  const subsongOptions = useMemo<SelectOption[]>(() => {
    if (!sidMetadata || sidMetadata.subsongs <= 1) return [];
    return Array.from({ length: sidMetadata.subsongs }, (_, i) => ({
      value: String(i),
      label: `Sub ${i + 1}`,
    }));
  }, [sidMetadata?.subsongs]);

  const handleSubsongChange = useCallback(async (val: string) => {
    const newIdx = Number(val);
    if (!sidMetadata || newIdx === sidMetadata.currentSubsong) return;
    try {
      const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
      const engine = getTrackerReplayer().getC64SIDEngine();
      if (engine) {
        engine.setSubsong(newIdx);
        setSidMetadata({ ...sidMetadata, currentSubsong: newIdx });
        notify.success(`SID Subsong ${newIdx + 1}/${sidMetadata.subsongs}`);
      }
    } catch {
      notify.error('Failed to switch SID subsong');
    }
  }, [sidMetadata, setSidMetadata]);

  const handleInfoClick = useCallback(() => {
    requestAnimationFrame(() => {
      useUIStore.getState().openModal('sidInfo');
    });
  }, []);

  if (!hasInfo) return <pixiContainer />;

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {/* SID chip badge */}
      {sidMetadata && (
        <PixiButton
          label={sidMetadata.chipModel !== 'Unknown' ? sidMetadata.chipModel : 'SID'}
          variant="ghost"
          size="sm"
          color="blue"
          active
          onClick={handleInfoClick}
        />
      )}

      {/* Subsong dropdown */}
      {hasMultipleSubsongs && (
        <PixiSelect
          options={subsongOptions}
          value={String(sidMetadata!.currentSubsong)}
          onChange={handleSubsongChange}
          width={80}
          height={24}
        />
      )}

      {/* Info button */}
      <PixiButton
        label="Info"
        variant="ghost"
        size="sm"
        onClick={handleInfoClick}
      />
    </pixiContainer>
  );
};

// ─── UADE Editable Subsong Selector ──────────────────────────────────────────

const UADESubsongSelector: React.FC = () => {
  const { uadeEditableSubsongs, uadeEditableCurrentSubsong } = useFormatStore(
    useShallow(s => ({
      uadeEditableSubsongs: s.uadeEditableSubsongs,
      uadeEditableCurrentSubsong: s.uadeEditableCurrentSubsong,
    }))
  );
  const setPatternOrder = useTrackerStore(s => s.setPatternOrder);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);
  const setSpeed = useTransportStore(s => s.setSpeed);

  const options = useMemo<SelectOption[]>(() => {
    if (!uadeEditableSubsongs) return [];
    return Array.from({ length: uadeEditableSubsongs.count }, (_, i) => ({
      value: String(i),
      label: `${i + 1}. Subsong ${i + 1}`,
    }));
  }, [uadeEditableSubsongs]);

  const handleChange = useCallback(async (val: string) => {
    const newIdx = Number(val);
    if (!uadeEditableSubsongs || newIdx === uadeEditableCurrentSubsong) return;

    // Update store, pattern view, and transport
    useFormatStore.setState({ uadeEditableCurrentSubsong: newIdx });
    setPatternOrder([newIdx]);
    setCurrentPattern(newIdx);
    setSpeed(uadeEditableSubsongs.speeds[newIdx] ?? 6);

    // Switch UADE subsong in-place (no full reload — avoids double-init)
    try {
      const { UADEEngine } = await import('@engine/uade/UADEEngine');
      if (UADEEngine.hasInstance()) {
        const engine = UADEEngine.getInstance();
        engine.setSubsong(newIdx);
        engine.play();
      }
    } catch (err) {
      console.error('[UADESubsongSelector] setSubsong failed:', err);
    }

    notify.success(`Subsong ${newIdx + 1}/${uadeEditableSubsongs.count}`);
  }, [uadeEditableSubsongs, uadeEditableCurrentSubsong, setPatternOrder, setCurrentPattern, setSpeed]);

  if (!uadeEditableSubsongs || uadeEditableSubsongs.count <= 1) return <pixiContainer />;

  return (
    <PixiSelect
      options={options}
      value={String(uadeEditableCurrentSubsong)}
      onChange={handleChange}
      width={120}
      height={24}
    />
  );
};

// ─── Module Info Button (non-SID) ────────────────────────────────────────────

const ModuleInfoButton: React.FC = () => {
  const sidMetadata = useFormatStore(s => s.sidMetadata);
  const songDBInfo = useFormatStore(s => s.songDBInfo);
  const patterns = useTrackerStore(s => s.patterns);

  // Only show for non-SID modules that have metadata
  const importMeta = patterns[0]?.importMetadata;
  const hasMetadata = !!(songDBInfo || importMeta?.modData);
  if (sidMetadata || !hasMetadata) return <pixiContainer />;

  const format = importMeta?.sourceFormat ?? songDBInfo?.format ?? '';

  return (
    <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {format && (
        <PixiButton
          label={format}
          variant="ghost"
          size="sm"
          color="blue"
          active
          onClick={() => {
            requestAnimationFrame(() => {
              useUIStore.getState().openModal('moduleInfo');
            });
          }}
        />
      )}
      <PixiButton
        label="Info"
        variant="ghost"
        size="sm"
        onClick={() => {
          requestAnimationFrame(() => {
            useUIStore.getState().openModal('moduleInfo');
          });
        }}
      />
    </pixiContainer>
  );
};

// ─── Live Mode Indicator ────────────────────────────────────────────────────

const PixiLiveModeIndicator: React.FC = () => {
  const { isLiveMode, toggleLiveMode } = useLiveModeStore(
    useShallow(s => ({ isLiveMode: s.isLiveMode, toggleLiveMode: s.toggleLiveMode }))
  );

  return (
    <PixiButton
      label={isLiveMode ? 'LIVE' : 'EDIT'}
      variant={isLiveMode ? 'ft2' : 'ghost'}
      color={isLiveMode ? 'green' : undefined}
      size="sm"
      active={isLiveMode}
      onClick={toggleLiveMode}
    />
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

export const PixiEditorControlsBar: React.FC<PixiEditorControlsBarProps> = ({
  viewMode,
  onViewModeChange,
  gridChannelIndex,
  onGridChannelChange,
}) => {
  const theme = usePixiTheme();

  // ── Shared hook ───────────────────────────────────────────────────────────
  const c = useEditorControls();

  // ── Modal state for active highlights ────────────────────────────────────
  const modalOpen = useUIStore(s => s.modalOpen);

  // ── Paste mode & mask ─────────────────────────────────────────────────────
  const pasteMode = useEditorStore((s) => s.pasteMode);
  const setPasteMode = useEditorStore((s) => s.setPasteMode);
  const pasteMask = useEditorStore((s) => s.pasteMask);
  const toggleMaskBit = useEditorStore((s) => s.toggleMaskBit);

  // ── Channel selector options ──────────────────────────────────────────────
  const channelOptions = useMemo<SelectOption[]>(
    () => Array.from({ length: c.channelCount }, (_, i) => ({ value: String(i), label: `Ch ${i + 1}` })),
    [c.channelCount],
  );

  // ── Pixi-specific handlers ────────────────────────────────────────────────
  const handleViewModeChange = useCallback((val: string) => {
    // Local sub-modes stay in tracker view; global views use shared switchView
    if (val === 'tracker' || val === 'grid') {
      setTimeout(() => onViewModeChange(val as TrackerViewMode), 0);
    } else {
      switchView(val);
    }
  }, [onViewModeChange]);

  const handleChannelChange = useCallback((val: string) => {
    setTimeout(() => onGridChannelChange(Number(val)), 0);
  }, [onGridChannelChange]);

  // ── FPS tint ──────────────────────────────────────────────────────────────
  const fpsTint = c.fps.quality === 'high'
    ? theme.success.color
    : c.fps.quality === 'medium'
    ? theme.warning.color
    : theme.error.color;

  return (
    <PixiViewHeader activeView={viewMode} title="">

      {/* Tracker sub-mode selector (tracker/grid/tb303/sunvox) */}
      <PixiSelect
        options={TRACKER_SUB_MODES}
        value={viewMode}
        onChange={handleViewModeChange}
        width={90}
        height={24}
      />

      {/* Channel selector — only in non-tracker modes */}
      <PixiSelect
        options={channelOptions}
        value={String(gridChannelIndex)}
        onChange={handleChannelChange}
        width={64}
        height={24}
        layout={{ display: viewMode !== 'tracker' ? 'flex' : 'none' }}
      />

      {/* Pattern Order */}
      <PixiButton
        label="Order"
        variant={modalOpen === 'patternOrder' ? 'ft2' : 'ghost'}
        color={modalOpen === 'patternOrder' ? 'blue' : undefined}
        size="sm"
        active={modalOpen === 'patternOrder'}
        onClick={() => useUIStore.getState().openModal('patternOrder')}
      />

      {/* Master FX */}
      <PixiButton
        label="Master FX"
        variant={modalOpen === 'masterFx' ? 'ft2' : 'ghost'}
        color={modalOpen === 'masterFx' ? 'blue' : undefined}
        size="sm"
        active={modalOpen === 'masterFx'}
        onClick={() => { const s = useUIStore.getState(); if (s.modalOpen === 'masterFx') { s.closeModal(); } else { s.openModal('masterFx'); } }}
      />

      <Sep />

      {/* Hardware Preset Selector */}
      <HardwarePresetSelector />

      {/* Subsong selector — only shows for furnace multi-subsong modules */}
      <SubsongSelector />

      {/* SID subsong selector + info button */}
      <SIDSubsongAndInfo />

      {/* UADE editable subsong selector (Steve Turner, etc.) */}
      <UADESubsongSelector />

      {/* Module info button (non-SID) */}
      <ModuleInfoButton />

      <Sep />

      {/* Ghost Patterns — only in tracker view */}
      <PixiButton
        label="Ghosts"
        variant="ghost"
        color={c.showGhostPatterns ? 'blue' : undefined}
        size="sm"
        active={c.showGhostPatterns}
        onClick={c.handleToggleGhosts}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Advanced Edit — tracker view only */}
      <PixiButton
        label="Edit"
        variant="ghost"
        size="sm"
        onClick={c.handleAdvancedEdit}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Cleanup — tracker view only */}
      <PixiButton
        label="Cleanup"
        variant="ghost"
        size="sm"
        onClick={() => useUIStore.getState().openModal('cleanup')}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Paste mode dropdown — tracker view only */}
      <PixiSelect
        options={PASTE_MODE_OPTIONS}
        value={pasteMode}
        onChange={(val) => setPasteMode(val as PasteMode)}
        width={88}
        height={24}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Paste mask toggles — tracker view only */}
      <pixiContainer layout={{ display: viewMode === 'tracker' ? 'flex' : 'none', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <PixiButton
          label="N"
          variant={(pasteMask & MASK_NOTE) ? 'primary' : 'ghost'}
          size="sm"
          active={!!(pasteMask & MASK_NOTE)}
          onClick={() => toggleMaskBit('paste', MASK_NOTE)}
        />
        <PixiButton
          label="I"
          variant={(pasteMask & MASK_INSTRUMENT) ? 'primary' : 'ghost'}
          size="sm"
          active={!!(pasteMask & MASK_INSTRUMENT)}
          onClick={() => toggleMaskBit('paste', MASK_INSTRUMENT)}
        />
        <PixiButton
          label="V"
          variant={(pasteMask & MASK_VOLUME) ? 'primary' : 'ghost'}
          size="sm"
          active={!!(pasteMask & MASK_VOLUME)}
          onClick={() => toggleMaskBit('paste', MASK_VOLUME)}
        />
        <PixiButton
          label="E"
          variant={(pasteMask & MASK_EFFECT) ? 'primary' : 'ghost'}
          size="sm"
          active={!!(pasteMask & MASK_EFFECT)}
          onClick={() => toggleMaskBit('paste', MASK_EFFECT)}
        />
        <PixiButton
          label="E2"
          variant={(pasteMask & MASK_EFFECT2) ? 'primary' : 'ghost'}
          size="sm"
          active={!!(pasteMask & MASK_EFFECT2)}
          onClick={() => toggleMaskBit('paste', MASK_EFFECT2)}
        />
      </pixiContainer>

      {/* Auto — opens automation editor (tracker view only) */}
      <PixiButton
        label="Automation"
        variant="ghost"
        size="sm"
        onClick={c.handleShowAutoEditor}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Pads */}
      <PixiButton
        label="Pads"
        variant="ghost"
        size="sm"
        onClick={c.handleShowDrumpads}
      />

      {/* REC button with dot indicator (matches DOM) */}
      <PixiButton
        label={'\u25CF REC'}
        variant={c.recordMode ? 'ft2' : 'ghost'}
        color={c.recordMode ? 'red' : undefined}
        size="sm"
        active={c.recordMode}
        onClick={c.handleToggleRecord}
      />

      {/* Recording Settings (matches DOM slider icon next to REC) */}
      <PixiButton
        icon="preset-a"
        label=""
        variant="ghost"
        size="sm"
        onClick={c.handleRecSettings}
      />

      {/* Live / Edit mode indicator */}
      <PixiLiveModeIndicator />

      <Sep />

      {/* Master Mute */}
      <PixiButton
        label={c.masterMuted ? 'Unmute' : 'Mute'}
        variant={c.masterMuted ? 'ft2' : 'ghost'}
        color={c.masterMuted ? 'red' : undefined}
        size="sm"
        active={c.masterMuted}
        onClick={c.handleToggleMute}
      />

      {/* Smooth / Stepped scrolling */}
      <PixiButton
        label={c.smoothScrolling ? 'Smooth' : 'Stepped'}
        variant={c.smoothScrolling ? 'ft2' : 'ghost'}
        color={c.smoothScrolling ? 'blue' : undefined}
        size="sm"
        active={c.smoothScrolling}
        onClick={c.handleToggleSmooth}
      />

      {/* Groove — single button matching DOM EditorControlsBar */}
      <PixiButton
        label="Groove"
        variant={c.grooveActive ? 'ft2' : 'ghost'}
        color={c.grooveActive ? 'blue' : undefined}
        size="sm"
        active={c.grooveActive}
        onClick={c.handleGrooveSettings}
      />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Genre Analysis Badge */}
      <PixiGenreAnalysisBadge />

      {/* Visual Background mode cycle */}
      <PixiVisualBgCycler />

      {/* Status message */}
      <pixiBitmapText
        text={c.statusMessage?.toUpperCase() ?? ''}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ display: c.statusMessage ? 'flex' : 'none', marginRight: 8 }}
      />

      {/* IT Mask Indicator (persistent when itMaskVariables behavior is active) */}
      {c.maskDisplay && (
        <>
          <Sep />
          <pixiBitmapText
            text={`[MASK: ${c.maskDisplay}]`}
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
            tint={theme.accentHighlight.color}
            layout={{}}
          />
        </>
      )}

      {/* FPS pill */}
      <pixiBitmapText
        text={`${c.fps.averageFps} FPS`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={fpsTint}
        layout={{}}
      />
    </PixiViewHeader>
  );
};

/** Compact < MODE > cycler for tracker visual background (GL version) */
const PixiVisualBgCycler: React.FC = () => {
  const enabled = useSettingsStore(s => s.trackerVisualBg);
  const modeIndex = useSettingsStore(s => s.trackerVisualMode);
  const setMode = useSettingsStore(s => s.setTrackerVisualMode);

  if (!enabled) return null;

  const total = BG_MODES.length;
  const current = BG_MODES[modeIndex % total];
  const label = current ? getBgModeLabel(current) : '?';

  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 2, alignItems: 'center', marginLeft: 4 }}>
      <PixiButton icon="caret-left" label="" variant="ghost" width={18} height={18} onClick={() => setMode((modeIndex - 1 + total) % total)} />
      <PixiLabel text={label} size="xs" color="textMuted" />
      <PixiButton icon="caret-right" label="" variant="ghost" width={18} height={18} onClick={() => setMode((modeIndex + 1) % total)} />
    </pixiContainer>
  );
};
