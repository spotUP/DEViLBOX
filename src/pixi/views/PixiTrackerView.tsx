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

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { PixiButton, PixiNumericInput } from '../components';
import { PixiFT2Toolbar } from './tracker/PixiFT2Toolbar';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { InstrumentList } from '@/components/instruments/InstrumentList';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useBlockOperations } from '@/hooks/tracker/BlockOperations';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useAudioStore } from '@stores/useAudioStore';
import { GROOVE_TEMPLATES } from '@typedefs/audio';

export const PixiTrackerView: React.FC = () => {
  // Enable FT2-style keyboard input (window event listeners — no DOM needed)
  useTrackerInput();
  useBlockOperations();

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

      {/* Editor controls bar */}
      <PixiEditorControlsBar />

      {/* Main content: pattern editor + instrument panel */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        {/* Pattern editor — DOM overlay for OffscreenCanvas worker */}
        <PixiDOMOverlay
          layout={{ flex: 1, height: '100%' }}
          style={{ overflow: 'hidden' }}
        >
          <PatternEditorCanvas />
        </PixiDOMOverlay>

        {/* Instrument list — DOM overlay for the side panel */}
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
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Editor Controls Bar ────────────────────────────────────────────────────

const PixiEditorControlsBar: React.FC = () => {
  const theme = usePixiTheme();

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

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Status message */}
      {statusMessage && (
        <pixiBitmapText
          text={statusMessage.toUpperCase()}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
      )}
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
