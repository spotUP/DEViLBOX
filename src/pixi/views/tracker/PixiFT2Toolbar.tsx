/**
 * PixiFT2Toolbar — FT2-style toolbar for the tracker view.
 * Row 1: Transport | BPM/Speed | Pattern selector | Play buttons
 * Row 2: Menu bar buttons (Load, Save, Export, etc.)
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiNumericInput } from '../../components';
import { useTrackerStore, useTransportStore } from '@stores';
import { useProjectStore } from '@stores/useProjectStore';

const TOOLBAR_HEIGHT = 80;
const MENUBAR_HEIGHT = 28;

export const PixiFT2Toolbar: React.FC = () => {
  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: TOOLBAR_HEIGHT + MENUBAR_HEIGHT,
        flexDirection: 'column',
      }}
    >
      <PixiFT2MainRow />
      <PixiFT2MenuBar />
    </pixiContainer>
  );
};

// ─── Main toolbar row ───────────────────────────────────────────────────────

const PixiFT2MainRow: React.FC = () => {
  const theme = usePixiTheme();

  // Transport store
  const bpm = useTransportStore(s => s.bpm);
  const setBPM = useTransportStore(s => s.setBPM);
  const speed = useTransportStore(s => s.speed);
  const setSpeed = useTransportStore(s => s.setSpeed);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const isLooping = useTransportStore(s => s.isLooping);

  // Tracker store
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);
  const numPatterns = useTrackerStore(s => s.patterns.length);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const patternOrderLength = useTrackerStore(s => s.patternOrder.length);
  const editStep = useTrackerStore(s => s.editStep);
  const setEditStep = useTrackerStore(s => s.setEditStep);
  const patternLength = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.length || 64;
  });

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, TOOLBAR_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: TOOLBAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_HEIGHT }} />

      {/* Position */}
      <PixiToolbarSection label="POS">
        <PixiNumericInput
          value={currentPositionIndex}
          min={0}
          max={Math.max(0, patternOrderLength - 1)}
          onChange={setCurrentPosition}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* BPM */}
      <PixiToolbarSection label="BPM">
        <PixiNumericInput
          value={bpm}
          min={32}
          max={255}
          onChange={setBPM}
          width={44}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Pattern */}
      <PixiToolbarSection label="PAT">
        <PixiNumericInput
          value={currentPatternIndex}
          min={0}
          max={Math.max(0, numPatterns - 1)}
          onChange={setCurrentPattern}
          width={36}
          formatValue={(v) => String(v).padStart(2, '0')}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Edit Step */}
      <PixiToolbarSection label="STEP">
        <PixiNumericInput
          value={editStep}
          min={0}
          max={16}
          onChange={setEditStep}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Speed */}
      <PixiToolbarSection label="SPD">
        <PixiNumericInput
          value={speed}
          min={1}
          max={31}
          onChange={setSpeed}
          width={36}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Pattern Length */}
      <PixiToolbarSection label="LEN">
        <PixiNumericInput
          value={patternLength}
          min={1}
          max={256}
          onChange={() => {}} // Placeholder — resizePattern needs wiring in Phase 4 detail
          width={44}
        />
      </PixiToolbarSection>

      <PixiToolbarSep />

      {/* Transport buttons */}
      <pixiContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <PixiButton
          label={isPlaying && !isLooping ? 'STOP' : 'PLAY'}
          variant={isPlaying && !isLooping ? 'ft2' : 'ft2'}
          size="sm"
          onClick={() => {}} // Placeholder — engine play/stop in Phase 4 detail
        />
        <PixiButton
          label={isPlaying && isLooping ? 'STOP' : 'PAT'}
          variant="ft2"
          size="sm"
          onClick={() => {}} // Placeholder
        />
      </pixiContainer>

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Visualizer region placeholder */}
      <pixiContainer
        layout={{
          width: 120,
          height: 64,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.roundRect(0, 0, 120, 64, 4);
            g.fill({ color: theme.bg.color });
            g.roundRect(0, 0, 120, 64, 4);
            g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
          }}
          layout={{ position: 'absolute', width: 120, height: 64 }}
        />
        <pixiBitmapText
          text="VIZ"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Menu bar ───────────────────────────────────────────────────────────────

const PixiFT2MenuBar: React.FC = () => {
  const theme = usePixiTheme();
  const isDirty = useProjectStore(s => s.isDirty);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, MENUBAR_HEIGHT);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, MENUBAR_HEIGHT - 1, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  const menuItems = [
    'Load', isDirty ? 'Save*' : 'Save', 'Export', 'New', 'Clear',
    'Order', 'Instruments', 'Pads', 'Master FX', 'Help', 'Settings',
  ];

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: MENUBAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 4,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: MENUBAR_HEIGHT }} />

      {menuItems.map(item => (
        <PixiButton
          key={item}
          label={item}
          variant="ghost"
          size="sm"
          onClick={() => {}} // Placeholder — wire to callbacks in Phase 4 detail
        />
      ))}
    </pixiContainer>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const PixiToolbarSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8 }}
        tint={theme.textMuted.color}
      />
      {children}
    </pixiContainer>
  );
};

const PixiToolbarSep: React.FC = () => {
  const theme = usePixiTheme();
  return (
    <pixiGraphics
      draw={(g: GraphicsType) => {
        g.clear();
        g.rect(0, 8, 1, TOOLBAR_HEIGHT - 16);
        g.fill({ color: theme.border.color, alpha: 0.25 });
      }}
      layout={{ width: 1, height: TOOLBAR_HEIGHT }}
    />
  );
};
