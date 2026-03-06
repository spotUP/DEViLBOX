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
import { useTrackerStore, useTransportStore, useAudioStore, useUIStore, useEditorStore , useFormatStore } from '@stores';
import type { TrackerViewMode } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { useFPSMonitor } from '@/hooks/useFPSMonitor';
import { SYSTEM_PRESETS, getGroupedPresets } from '@/constants/systemPresets';
import { notify } from '@stores/useNotificationStore';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiButton } from '../../components/PixiButton';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { PixiViewHeader } from '../../components/PixiViewHeader';

const BAR_H = 36;

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
  const applySystemPreset = useTrackerStore(s => s.applySystemPreset);

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

  const handleChange = useCallback((presetId: string) => {
    if (presetId === '__group__') return;
    applySystemPreset(presetId);
    const preset = SYSTEM_PRESETS.find(p => p.id === presetId);
    notify.success(`Hardware System: ${preset?.name.toUpperCase() ?? presetId}`);
  }, [applySystemPreset]);

  return (
    <PixiSelect
      options={options}
      value="__none__"
      onChange={handleChange}
      width={150}
      height={24}
      placeholder="HW SYSTEM..."
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

// ─── Main component ──────────────────────────────────────────────────────────

export const PixiEditorControlsBar: React.FC<PixiEditorControlsBarProps> = ({
  viewMode,
  onViewModeChange,
  gridChannelIndex,
  onGridChannelChange,
}) => {
  const theme = usePixiTheme();
  const fps = useFPSMonitor();

  // ── Tracker store ─────────────────────────────────────────────────────────
  const {
    recordMode,
    showGhostPatterns,
  } = useEditorStore(useShallow(s => ({
    recordMode: s.recordMode,
    showGhostPatterns: s.showGhostPatterns,
  })));
  const channelCount = useTrackerStore(useShallow(s =>
    s.patterns[s.currentPatternIndex]?.channels?.length || 4
  ));

  // ── Transport store ───────────────────────────────────────────────────────
  const {
    grooveTemplateId,
    swing,
    jitter,
    smoothScrolling,
  } = useTransportStore(useShallow(s => ({
    grooveTemplateId: s.grooveTemplateId,
    swing: s.swing,
    jitter: s.jitter,
    smoothScrolling: s.smoothScrolling,
  })));

  // ── Audio store ───────────────────────────────────────────────────────────
  const masterMuted = useAudioStore(s => s.masterMuted);

  // ── UI store ──────────────────────────────────────────────────────────────
  const statusMessage = useUIStore(s => s.statusMessage);

  // ── Groove ────────────────────────────────────────────────────────────────
  const grooveActive = (grooveTemplateId !== 'straight' && swing > 0) || jitter > 0;

  // ── Channel selector options ──────────────────────────────────────────────
  const channelOptions = useMemo<SelectOption[]>(
    () => Array.from({ length: channelCount }, (_, i) => ({ value: String(i), label: `Ch ${i + 1}` })),
    [channelCount],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleViewModeChange = useCallback((val: string) => {
    // Local sub-modes stay in tracker view; global views switch activeView
    if (val === 'tracker' || val === 'grid' || val === 'tb303' || val === 'sunvox') {
      setTimeout(() => onViewModeChange(val as TrackerViewMode), 0);
    } else {
      setTimeout(() => useUIStore.getState().setActiveView(val as any), 0);
    }
  }, [onViewModeChange]);

  const handleChannelChange = useCallback((val: string) => {
    setTimeout(() => onGridChannelChange(Number(val)), 0);
  }, [onGridChannelChange]);

  const handleToggleRecord = useCallback(() => {
    useEditorStore.getState().toggleRecordMode();
  }, []);

  const handleToggleGhosts = useCallback(() => {
    const s = useEditorStore.getState();
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

  const handleShowAutoEditor = useCallback(() => {
    useUIStore.getState().openModal('automation');
  }, []);

  const handleShowDrumpads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  const handleRecSettings = useCallback(() => {
    useUIStore.getState().openModal('settings');
  }, []);

  // ── FPS tint ──────────────────────────────────────────────────────────────
  const fpsTint = fps.quality === 'high'
    ? theme.success.color
    : fps.quality === 'medium'
    ? theme.warning.color
    : theme.error.color;

  // Title for the header — based on current local view mode
  const viewTitle = viewMode === 'tracker' ? 'TRACKER'
    : viewMode === 'grid' ? 'GRID'
    : viewMode === 'tb303' ? 'TB-303'
    : viewMode === 'sunvox' ? 'SUNVOX'
    : 'TRACKER';

  return (
    <PixiViewHeader activeView={viewMode} title={viewTitle} onViewChange={handleViewModeChange}>

      {/* Channel selector — only in non-tracker modes */}
      <PixiSelect
        options={channelOptions}
        value={String(gridChannelIndex)}
        onChange={handleChannelChange}
        width={64}
        height={24}
        layout={{ display: viewMode !== 'tracker' ? 'flex' : 'none' }}
      />

      <Sep />

      {/* Hardware Preset Selector */}
      <HardwarePresetSelector />

      {/* Subsong selector — only shows for furnace multi-subsong modules */}
      <SubsongSelector />

      {/* SID subsong selector + info button */}
      <SIDSubsongAndInfo />

      {/* Module info button (non-SID) */}
      <ModuleInfoButton />

      <Sep />

      {/* Ghost Patterns — only in tracker view */}
      <PixiButton
        label="Ghosts"
        variant={showGhostPatterns ? 'ft2' : 'ghost'}
        color={showGhostPatterns ? 'blue' : undefined}
        size="sm"
        active={showGhostPatterns}
        onClick={handleToggleGhosts}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Auto — opens automation editor (tracker view only) */}
      <PixiButton
        label="Auto"
        variant="ghost"
        size="sm"
        onClick={handleShowAutoEditor}
        layout={{ display: viewMode === 'tracker' ? 'flex' : 'none' }}
      />

      {/* Pads */}
      <PixiButton
        label="Pads"
        variant="ghost"
        size="sm"
        onClick={handleShowDrumpads}
      />

      {/* REC button */}
      <PixiButton
        label="REC"
        variant={recordMode ? 'ft2' : 'ghost'}
        color={recordMode ? 'red' : undefined}
        size="sm"
        active={recordMode}
        onClick={handleToggleRecord}
      />

      {/* REC settings */}
      <PixiButton
        label="..."
        variant="ghost"
        size="sm"
        onClick={handleRecSettings}
      />

      <Sep />

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

      {/* Groove — single button matching DOM EditorControlsBar */}
      <PixiButton
        label="GROOVE"
        variant={grooveActive ? 'ft2' : 'ghost'}
        color={grooveActive ? 'blue' : undefined}
        size="sm"
        active={grooveActive}
        onClick={handleGrooveSettings}
      />

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Status message */}
      <pixiBitmapText
        text={statusMessage?.toUpperCase() ?? ''}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ display: statusMessage ? 'flex' : 'none', marginRight: 8 }}
      />

      {/* FPS pill */}
      <pixiBitmapText
        text={`${fps.averageFps}FPS`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={fpsTint}
        layout={{}}
      />
    </PixiViewHeader>
  );
};
