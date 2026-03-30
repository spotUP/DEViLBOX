/**
 * PixiDeckTurntable — Vinyl platter visual for a DJ deck.
 * Draws a rotating disc with position indicator.
 * Uses useTick for smooth per-frame rotation independent of store update rate.
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTick } from '@pixi/react';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';

const BASE_BPM = 120;
const BASE_RPS = 33.33 / 60; // 33⅓ RPM in rotations per second

interface PixiDeckTurntableProps {
  deckId: 'A' | 'B' | 'C';
  size?: number;
}

export const PixiDeckTurntable: React.FC<PixiDeckTurntableProps> = ({ deckId, size = 100 }) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const { deckA, deckB, deckC } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const DECK_COLOR = deckId === 'A' ? deckA : deckId === 'B' ? deckB : deckC;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = size / 6;

  const graphicsRef = useRef<GraphicsType | null>(null);
  const angleRef = useRef(0);
  const wasPlayingRef = useRef(false);

  // Smooth per-frame rotation via Pixi ticker
  useTick((ticker) => {
    const state = useDJStore.getState().decks[deckId];
    const playing = state.isPlaying;
    const dt = ticker.deltaMS / 1000;

    if (playing) {
      const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || BASE_BPM;
      const rps = (bpm / BASE_BPM) * BASE_RPS;
      angleRef.current += rps * 2 * Math.PI * dt;
    }

    // Only redraw when playing or on play/stop transition
    if (!playing && !wasPlayingRef.current) return;
    wasPlayingRef.current = playing;

    const g = graphicsRef.current;
    if (!g) return;

    g.clear();

    // Outer disc
    g.circle(cx, cy, outerR);
    g.fill({ color: theme.bg.color });
    g.circle(cx, cy, outerR);
    g.stroke({ color: DECK_COLOR, alpha: playing ? 0.6 : 0.2, width: 2 });

    // Grooves
    for (let r = innerR + 6; r < outerR - 4; r += 4) {
      g.circle(cx, cy, r);
      g.stroke({ color: theme.border.color, alpha: 0.15, width: 0.5 });
    }

    // Inner label
    g.circle(cx, cy, innerR);
    g.fill({ color: DECK_COLOR, alpha: 0.15 });
    g.circle(cx, cy, innerR);
    g.stroke({ color: DECK_COLOR, alpha: 0.3, width: 1 });

    // Position indicator line (rotates)
    const a = angleRef.current;
    g.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
    g.lineTo(cx + Math.cos(a) * (outerR - 2), cy + Math.sin(a) * (outerR - 2));
    g.stroke({ color: DECK_COLOR, alpha: playing ? 0.8 : 0.3, width: 1 });

    // Center dot
    g.circle(cx, cy, 3);
    g.fill({ color: DECK_COLOR, alpha: 0.6 });
  });

  const captureRef = useCallback((g: GraphicsType) => {
    graphicsRef.current = g;
  }, []);

  // Initial draw callback (required by pixiGraphics); tick handles ongoing updates
  const initialDraw = useCallback((_g: GraphicsType) => {
    // Handled by useTick
  }, []);

  return (
    <pixiContainer
      layout={{
        width: size,
        height: size,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <pixiGraphics ref={captureRef} draw={initialDraw} layout={{ position: 'absolute', left: 0, top: 0 }} />
    </pixiContainer>
  );
};
