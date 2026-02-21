/**
 * PixiDeckWaveform — Scrolling waveform display for a DJ deck.
 * Renders waveform peaks from the DJ store as Graphics bars.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme, usePixiThemeId, getDeckColors } from '../../theme';
import { useDJStore } from '@/stores/useDJStore';

interface PixiDeckWaveformProps {
  deckId: 'A' | 'B';
  width: number;
  height: number;
}

export const PixiDeckWaveform: React.FC<PixiDeckWaveformProps> = ({ deckId, width, height }) => {
  const theme = usePixiTheme();
  const peaks = useDJStore(s => s.decks[deckId].waveformPeaks);
  const position = useDJStore(s => s.decks[deckId].audioPosition);
  const duration = useDJStore(s => s.decks[deckId].durationMs);

  const themeId = usePixiThemeId();
  const { deckA, deckB } = getDeckColors(themeId, theme.accent, theme.accentSecondary);
  const DECK_COLOR = deckId === 'A' ? deckA : deckB;

  const drawWaveform = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.roundRect(0, 0, width, height, 4);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, width, height, 4);
    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });

    if (!peaks || peaks.length === 0) return;

    // Calculate visible range
    const totalPeaks = peaks.length;
    const progress = duration > 0 ? position / duration : 0;
    const centerPeak = Math.floor(progress * totalPeaks);
    const visiblePeaks = width;
    const startPeak = Math.max(0, centerPeak - Math.floor(visiblePeaks / 2));
    const endPeak = Math.min(totalPeaks, startPeak + visiblePeaks);

    const mid = height / 2;
    const maxH = (height - 8) / 2;

    for (let i = startPeak; i < endPeak; i++) {
      const x = i - startPeak;
      const peak = peaks[i] ?? 0;
      const h = peak * maxH;

      if (h > 0.5) {
        // Color based on position relative to playhead
        const isBeforePlayhead = i < centerPeak;
        const alpha = isBeforePlayhead ? 0.4 : 0.8;

        g.rect(x, mid - h, 1, h * 2);
        g.fill({ color: DECK_COLOR, alpha });
      }
    }

    // Playhead line
    const playheadX = Math.min(width - 1, Math.floor(visiblePeaks / 2));
    g.rect(playheadX, 0, 1, height);
    g.fill({ color: 0xffffff, alpha: 0.8 });
  }, [peaks, position, duration, width, height, theme, DECK_COLOR]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics draw={drawWaveform} layout={{ width, height }} />
      {(!peaks || peaks.length === 0) && (
        <pixiBitmapText
          text="No waveform data"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', top: height / 2 - 6, left: width / 2 - 40 }}
        />
      )}
    </pixiContainer>
  );
};
