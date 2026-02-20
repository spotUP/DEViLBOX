/**
 * PixiPianoRollView — Piano roll view for WebGL mode.
 * Layout: Toolbar (top) | [Piano keyboard | Note grid] (flex row) | Velocity lane
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PixiButton, PixiLabel } from '../components';
import { PixiPianoKeyboard } from './pianoroll/PixiPianoKeyboard';
import { PixiPianoRollGrid } from './pianoroll/PixiPianoRollGrid';
import { PixiVelocityLane } from './pianoroll/PixiVelocityLane';

// Placeholder notes for demo
const PLACEHOLDER_NOTES = [
  { note: 60, start: 0, duration: 1, velocity: 100 },
  { note: 64, start: 1, duration: 0.5, velocity: 80 },
  { note: 67, start: 1.5, duration: 0.5, velocity: 90 },
  { note: 72, start: 2, duration: 2, velocity: 110 },
  { note: 60, start: 4, duration: 1, velocity: 70 },
];

const VELOCITY_HEIGHT = 80;
const TOOLBAR_HEIGHT = 36;
const KEYBOARD_WIDTH = 60;

export const PixiPianoRollView: React.FC = () => {
  const theme = usePixiTheme();

  const drawToolbarBg = useCallback((g: GraphicsType) => {
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
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <pixiContainer
        layout={{
          width: '100%',
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width: '100%', height: TOOLBAR_HEIGHT }} />

        <PixiLabel text="PIANO ROLL" size="sm" weight="bold" color="accent" />

        <PixiButton label="Select" variant="ghost" size="sm" onClick={() => {}} />
        <PixiButton label="Draw" variant="ghost" size="sm" onClick={() => {}} />
        <PixiButton label="Erase" variant="ghost" size="sm" onClick={() => {}} />

        <pixiContainer layout={{ flex: 1 }} />

        <PixiLabel text="Grid: 1/16 | Snap: On" size="xs" color="textMuted" layout={{ marginRight: 8 }} />
      </pixiContainer>

      {/* Main area: Keyboard | Grid */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
          flexDirection: 'row',
        }}
      >
        <PixiPianoKeyboard width={KEYBOARD_WIDTH} height={4000} />
        <PixiPianoRollGrid
          width={4000}
          height={4000}
          notes={PLACEHOLDER_NOTES}
        />
      </pixiContainer>

      {/* Velocity lane */}
      <PixiVelocityLane
        width={4000}
        height={VELOCITY_HEIGHT}
        notes={PLACEHOLDER_NOTES.map(n => ({ start: n.start, velocity: n.velocity }))}
      />
    </pixiContainer>
  );
};
