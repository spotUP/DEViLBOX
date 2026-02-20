/**
 * PixiDeckTurntable — Vinyl platter visual for a DJ deck.
 * Draws a rotating disc with position indicator.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';

interface PixiDeckTurntableProps {
  deckId: 'A' | 'B';
  size?: number;
}

export const PixiDeckTurntable: React.FC<PixiDeckTurntableProps> = ({ deckId, size = 100 }) => {
  const theme = usePixiTheme();
  const isPlaying = useDJStore(s => s.decks[deckId].isPlaying);
  const position = useDJStore(s => s.decks[deckId].audioPosition);

  const DECK_COLOR = deckId === 'A' ? 0x60a5fa : 0xf87171;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = size / 6;

  // Rotation based on position (simulate 33⅓ RPM)
  const rotation = (position / 1000) * Math.PI * 2 * (33.33 / 60);

  const drawPlatter = useCallback((g: GraphicsType) => {
    g.clear();

    // Outer disc
    g.circle(cx, cy, outerR);
    g.fill({ color: theme.bg.color });
    g.circle(cx, cy, outerR);
    g.stroke({ color: DECK_COLOR, alpha: isPlaying ? 0.6 : 0.2, width: 2 });

    // Grooves (concentric circles)
    for (let r = innerR + 6; r < outerR - 4; r += 4) {
      g.circle(cx, cy, r);
      g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });
    }

    // Inner label area
    g.circle(cx, cy, innerR);
    g.fill({ color: DECK_COLOR, alpha: 0.15 });
    g.circle(cx, cy, innerR);
    g.stroke({ color: DECK_COLOR, alpha: 0.3, width: 1 });

    // Position indicator line (rotates)
    const lineEndX = cx + Math.cos(rotation) * (outerR - 2);
    const lineEndY = cy + Math.sin(rotation) * (outerR - 2);
    const lineStartX = cx + Math.cos(rotation) * innerR;
    const lineStartY = cy + Math.sin(rotation) * innerR;

    g.moveTo(lineStartX, lineStartY);
    g.lineTo(lineEndX, lineEndY);
    g.stroke({ color: DECK_COLOR, alpha: isPlaying ? 0.8 : 0.3, width: 1 });

    // Center dot
    g.circle(cx, cy, 3);
    g.fill({ color: DECK_COLOR, alpha: 0.6 });
  }, [cx, cy, outerR, innerR, rotation, isPlaying, theme, DECK_COLOR]);

  return (
    <pixiContainer
      layout={{
        width: size,
        height: size,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiGraphics draw={drawPlatter} layout={{ width: size, height: size }} />
    </pixiContainer>
  );
};
