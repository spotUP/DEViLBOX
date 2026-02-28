/**
 * PixiFrequencyBars — Full-width spectrum analyzer bars with peak holds.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

const PEAK_DECAY = 0.02;
const BAR_COUNT = 64;

interface PixiFrequencyBarsProps {
  width: number;
  height: number;
}

export const PixiFrequencyBars: React.FC<PixiFrequencyBarsProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const graphicsRef = useRef<GraphicsType | null>(null);
  const peakHoldsRef = useRef(new Float32Array(BAR_COUNT));

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;
    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    let rafId: number;
    const peaks = peakHoldsRef.current;

    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      // Background
      g.rect(0, 0, width, height);
      g.fill({ color: theme.bg.color });

      let fft: Float32Array;
      try { fft = getToneEngine().getFFT(); } catch { rafId = requestAnimationFrame(draw); return; }

      const padX = 4, padY = 4;
      const drawW = width - padX * 2;
      const drawH = height - padY * 2;
      const barWidth = drawW / BAR_COUNT;
      const step = Math.floor(fft.length / BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += fft[i * step + j] ?? -100;
        const db = sum / step;
        const normalized = Math.max(0, Math.min(1, (db + 100) / 100));
        const barH = normalized * drawH;

        if (normalized > peaks[i]) peaks[i] = normalized;
        else peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY);

        if (barH > 0.5) {
          const x = padX + i * barWidth;
          const y = height - padY - barH;
          const alpha = 0.4 + normalized * 0.6;
          const color = normalized > 0.8 ? theme.warning.color : theme.accent.color;
          g.rect(x, y, barWidth - 1, barH);
          g.fill({ color, alpha });
        }

        // Peak hold
        const peakY = height - padY - peaks[i] * drawH;
        if (peaks[i] > 0.02) {
          g.rect(padX + i * barWidth, peakY, barWidth - 1, 1);
          g.fill({ color: theme.accentSecondary.color, alpha: 0.8 });
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, width, height, theme]);

  const drawStatic = (g: GraphicsType) => {
    g.clear(); g.rect(0, 0, width, height); g.fill({ color: theme.bg.color });
  };

  return (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics ref={graphicsRef} draw={isPlaying ? () => {} : drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText text="SPECTRUM" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} visible={!isPlaying} />
    </pixiContainer>
  );
};
