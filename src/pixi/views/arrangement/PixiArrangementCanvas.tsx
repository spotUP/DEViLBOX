/**
 * PixiArrangementCanvas — Main arrangement grid with timeline, clips, and automation.
 * Renders grid lines, clip rectangles, playhead, and selection region.
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';

interface PixiArrangementCanvasProps {
  width: number;
  height: number;
  /** Beats per bar */
  beatsPerBar?: number;
  /** Pixels per beat (zoom level) */
  pixelsPerBeat?: number;
  /** Scroll offset in beats */
  scrollBeat?: number;
  /** Total beats in the arrangement */
  totalBeats?: number;
  /** Current playback beat position */
  playbackBeat?: number;
}

export const PixiArrangementCanvas: React.FC<PixiArrangementCanvasProps> = ({
  width,
  height,
  beatsPerBar = 4,
  pixelsPerBeat = 20,
  scrollBeat = 0,
  totalBeats = 128,
  playbackBeat,
}) => {
  const theme = usePixiTheme();

  const RULER_HEIGHT = 24;
  const gridHeight = height - RULER_HEIGHT;

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    // Ruler background
    g.rect(0, 0, width, RULER_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, RULER_HEIGHT - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });

    // Grid lines
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);

    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      const x = (beat - scrollBeat) * pixelsPerBeat;
      if (x < 0 || x > width) continue;

      const isBar = beat % beatsPerBar === 0;

      // Vertical grid line
      g.rect(x, RULER_HEIGHT, 1, gridHeight);
      g.fill({ color: theme.border.color, alpha: isBar ? 0.3 : 0.1 });

      // Ruler tick + label
      if (isBar) {
        g.rect(x, RULER_HEIGHT - 8, 1, 8);
        g.fill({ color: theme.textMuted.color, alpha: 0.5 });
      }
    }

    // Playhead
    if (playbackBeat != null) {
      const px = (playbackBeat - scrollBeat) * pixelsPerBeat;
      if (px >= 0 && px <= width) {
        g.rect(px, 0, 2, height);
        g.fill({ color: theme.accent.color, alpha: 0.8 });
      }
    }
  }, [width, height, scrollBeat, pixelsPerBeat, totalBeats, beatsPerBar, playbackBeat, theme, RULER_HEIGHT, gridHeight]);

  // Ruler bar numbers
  const barLabels = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    const startBeat = Math.floor(scrollBeat);
    const endBeat = Math.ceil(scrollBeat + width / pixelsPerBeat);
    for (let beat = startBeat; beat <= Math.min(endBeat, totalBeats); beat++) {
      if (beat % beatsPerBar === 0) {
        const x = (beat - scrollBeat) * pixelsPerBeat;
        if (x >= 0 && x <= width) {
          labels.push({ x, text: String(Math.floor(beat / beatsPerBar) + 1) });
        }
      }
    }
    return labels;
  }, [scrollBeat, width, pixelsPerBeat, totalBeats, beatsPerBar]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height }} />

      {/* Bar number labels */}
      {barLabels.map(({ x, text }) => (
        <pixiBitmapText
          key={text}
          text={text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: x + 3, top: 3 }}
        />
      ))}
    </pixiContainer>
  );
};
