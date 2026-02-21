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

import { useCallback, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiButton, PixiNumericInput } from '../components';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { FT2Toolbar } from '@/components/tracker/FT2Toolbar';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { InstrumentList } from '@/components/instruments/InstrumentList';
import { GridSequencer } from '@/components/grid/GridSequencer';
import { TB303View } from '@/components/demo/TB303View';
import { PianoRoll } from '@/components/pianoroll';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@/hooks/tracker/BlockOperations';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useAudioStore } from '@stores/useAudioStore';
import { useFPSMonitor } from '@/hooks/useFPSMonitor';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { SYSTEM_PRESETS, getGroupedPresets } from '@/constants/systemPresets';
import { notify } from '@stores/useNotificationStore';
import { PatternManagement } from '@/components/pattern/PatternManagement';

type ViewMode = 'tracker' | 'grid' | 'pianoroll' | 'tb303';

const PATTERN_PANEL_HEIGHT = 180;

const FT2_TOOLBAR_HEIGHT = 140;

export const PixiTrackerView: React.FC = () => {
  // Enable FT2-style keyboard input (window event listeners — no DOM needed)
  useTrackerInput();
  useBlockOperations();

  const [viewMode, setViewMode] = useState<ViewMode>('tracker');
  const [gridChannelIndex, setGridChannelIndex] = useState(0);
  const showPatterns = useUIStore(s => s.showPatterns);
  const modalOpen = useUIStore(s => s.modalOpen);

  const handleShowExport = useCallback(() => useUIStore.getState().openModal('export'), []);
  const handleShowHelp = useCallback((tab?: string) => useUIStore.getState().openModal('help', { initialTab: tab || 'shortcuts' }), []);
  const handleShowMasterFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);
  const handleShowInstrumentFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
  }, []);
  const handleShowInstruments = useCallback(() => useUIStore.getState().openModal('instruments'), []);
  const handleShowPatternOrder = useCallback(() => useUIStore.getState().openModal('patternOrder'), []);
  const handleShowDrumpads = useCallback(() => useUIStore.getState().openModal('drumpads'), []);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* FT2 Toolbar + Menu bar — DOM overlay so it's visible through modal backdrops */}
      <PixiDOMOverlay
        layout={{ width: '100%', height: FT2_TOOLBAR_HEIGHT }}
        style={{ overflow: 'visible', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <FT2Toolbar
          onShowExport={handleShowExport}
          onShowHelp={handleShowHelp}
          onShowMasterFX={handleShowMasterFX}
          onShowInstrumentFX={handleShowInstrumentFX}
          onShowInstruments={handleShowInstruments}
          onShowPatternOrder={handleShowPatternOrder}
          onShowDrumpads={handleShowDrumpads}
          showMasterFX={modalOpen === 'masterFx'}
          showInstrumentFX={modalOpen === 'instrumentFx'}
        />
      </PixiDOMOverlay>

      {/* Editor controls bar */}
      <PixiEditorControlsBar viewMode={viewMode} onViewModeChange={setViewMode} gridChannelIndex={gridChannelIndex} onGridChannelChange={setGridChannelIndex} />

      {/* Pattern management panel (collapsible) */}
      {showPatterns && (
        <PixiDOMOverlay
          layout={{ width: '100%', height: PATTERN_PANEL_HEIGHT }}
          style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <PatternManagement />
        </PixiDOMOverlay>
      )}

      {/* Main content: editor + instrument panel */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        {/* Editor area — switches based on viewMode */}
        {viewMode === 'tracker' ? (
          <PixiDOMOverlay
            layout={{ flex: 1, height: '100%' }}
            style={{ overflow: 'hidden' }}
          >
            <PatternEditorCanvas />
          </PixiDOMOverlay>
        ) : viewMode === 'grid' ? (
          <PixiDOMOverlay
            layout={{ flex: 1, height: '100%' }}
            style={{ overflow: 'hidden' }}
          >
            <GridSequencer channelIndex={gridChannelIndex} />
          </PixiDOMOverlay>
        ) : viewMode === 'pianoroll' ? (
          <PixiDOMOverlay
            layout={{ flex: 1, height: '100%' }}
            style={{ overflow: 'hidden' }}
          >
            <PianoRoll channelIndex={gridChannelIndex} />
          </PixiDOMOverlay>
        ) : (
          <PixiDOMOverlay
            layout={{ flex: 1, height: '100%' }}
            style={{ overflow: 'hidden', overflowY: 'auto' }}
          >
            <TB303View channelIndex={gridChannelIndex} />
          </PixiDOMOverlay>
        )}

        {/* Instrument list — DOM overlay for the side panel */}
        {viewMode !== 'tb303' && (
          <PixiDOMOverlay
            layout={{ width: 200, height: '100%' }}
            style={{ overflow: 'hidden', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
          >
            <InstrumentList
              variant="ft2"
              showPreviewOnClick={true}
              showPresetButton={true}
              showSamplePackButton={true}
              showEditButton={true}
            />
          </PixiDOMOverlay>
        )}
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Editor Controls Bar ────────────────────────────────────────────────────

interface EditorControlsBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridChannelIndex: number;
  onGridChannelChange: (index: number) => void;
}

const PixiEditorControlsBar: React.FC<EditorControlsBarProps> = ({ viewMode, onViewModeChange, gridChannelIndex, onGridChannelChange }) => {
  const theme = usePixiTheme();
  const fps = useFPSMonitor();

  // Store subscriptions
  const songLength = useTrackerStore(s => s.patternOrder.length);
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
          onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
          style={{
            width: '100%',
            height: '100%',
            padding: '0 4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            background: '#1e1e2e',
            color: '#cdd6f4',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '3px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="tracker">Tracker</option>
          <option value="grid">Grid</option>
          <option value="pianoroll">Piano Roll</option>
          <option value="tb303">TB-303</option>
        </select>
      </PixiDOMOverlay>

      {/* Channel selector (for grid/pianoroll/tb303 modes) */}
      {viewMode !== 'tracker' && (
        <PixiDOMOverlay
          layout={{ height: 24, width: 56 }}
          style={{ overflow: 'visible' }}
        >
          <select
            value={gridChannelIndex}
            onChange={(e) => onGridChannelChange(Number(e.target.value))}
            style={{
              width: '100%',
              height: '100%',
              padding: '0 4px',
              fontSize: '11px',
              fontFamily: 'monospace',
              background: '#1e1e2e',
              color: '#a6e3a1',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '3px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i} value={i}>Ch {i + 1}</option>
            ))}
          </select>
        </PixiDOMOverlay>
      )}

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

      {/* REC button */}
      <PixiButton
        label="REC"
        variant={recordMode ? 'ft2' : 'ghost'}
        color={recordMode ? 'red' : undefined}
        size="sm"
        active={recordMode}
        onClick={handleToggleRecord}
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
        style={{
          width: '100%',
          height: '100%',
          padding: '0 4px',
          fontSize: '11px',
          fontFamily: 'monospace',
          background: '#1e1e2e',
          color: '#cdd6f4',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '3px',
          cursor: 'pointer',
          outline: 'none',
        }}
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
          style={{
            width: '100%',
            height: '100%',
            padding: '0 4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            background: '#1e1e2e',
            color: '#a6e3a1',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '3px',
            cursor: 'pointer',
            outline: 'none',
          }}
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
