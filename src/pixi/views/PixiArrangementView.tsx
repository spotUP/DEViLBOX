/**
 * PixiArrangementView — Arrangement view for WebGL mode.
 * Layout: Toolbar (top) | [Track headers | Arrangement canvas] (flex row)
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiLabel } from '../components';
import { PixiArrangementCanvas } from './arrangement/PixiArrangementCanvas';
import { PixiTrackHeaders } from './arrangement/PixiTrackHeaders';
import { useTransportStore } from '@stores';

// Placeholder tracks for the shell — will be wired to useArrangementStore in Phase 4 detail
const PLACEHOLDER_TRACKS = [
  { id: 'ch1', name: 'Ch 1 - Bass', muted: false, solo: false, color: 0x60a5fa },
  { id: 'ch2', name: 'Ch 2 - Lead', muted: false, solo: false, color: 0xf87171 },
  { id: 'ch3', name: 'Ch 3 - Pad', muted: true, solo: false, color: 0x4ade80 },
  { id: 'ch4', name: 'Ch 4 - Drums', muted: false, solo: true, color: 0xfbbf24 },
];

export const PixiArrangementView: React.FC = () => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 4000, 36);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 35, 4000, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <pixiContainer
        layout={{
          width: '100%',
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 8,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width: '100%', height: 36 }} />
        <PixiLabel text="ARRANGEMENT" size="sm" weight="bold" color="accent" />

        <PixiButton label="Select" variant="ghost" size="sm" onClick={() => {}} />
        <PixiButton label="Draw" variant="ghost" size="sm" onClick={() => {}} />
        <PixiButton label="Erase" variant="ghost" size="sm" onClick={() => {}} />

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel text="Zoom / Snap controls" size="xs" color="textMuted" layout={{ marginRight: 8 }} />
      </pixiContainer>

      {/* Main area: Track headers | Canvas */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiTrackHeaders tracks={PLACEHOLDER_TRACKS} width={160} />

        <PixiArrangementCanvas
          width={4000}
          height={4000}
          playbackBeat={isPlaying ? 0 : undefined}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
