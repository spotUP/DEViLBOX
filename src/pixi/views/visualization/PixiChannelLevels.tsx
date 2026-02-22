/**
 * PixiChannelLevels — Compact per-channel horizontal level meters with peak hold.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useTransportStore, useTrackerStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

const PEAK_DECAY = 0.015;

interface PixiChannelLevelsProps {
  width: number;
  height: number;
}

export const PixiChannelLevels: React.FC<PixiChannelLevelsProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const numChannels = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels.length || 4;
  });
  const graphicsRef = useRef<GraphicsType | null>(null);
  const peaksRef = useRef(new Float32Array(32));

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;

    let rafId: number;
    const peaks = peaksRef.current;

    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      // Background
      g.rect(0, 0, width, height);
      g.fill({ color: theme.bg.color });

      let levels: Float32Array | number[];
      try { levels = getToneEngine().getChannelTriggerLevels(numChannels); } catch { rafId = requestAnimationFrame(draw); return; }

      const barHeight = Math.max(4, (height - 8) / numChannels - 2);
      const barMaxWidth = width - 40;

      for (let ch = 0; ch < numChannels; ch++) {
        const level = levels[ch] || 0;
        const y = 4 + ch * (barHeight + 2);
        const barW = level * barMaxWidth;

        if (level > peaks[ch]) peaks[ch] = level;
        else peaks[ch] = Math.max(0, peaks[ch] - PEAK_DECAY);

        // Level bar
        if (barW > 0.5) {
          const color = level > 0.85 ? theme.error.color : level > 0.6 ? theme.warning.color : theme.success.color;
          g.rect(30, y, barW, barHeight);
          g.fill({ color, alpha: 0.7 });
        }

        // Peak hold marker
        if (peaks[ch] > 0.02) {
          const peakX = 30 + peaks[ch] * barMaxWidth;
          g.rect(peakX, y, 2, barHeight);
          g.fill({ color: theme.accentSecondary.color, alpha: 0.9 });
        }

        // Channel label bg
        g.rect(2, y, 26, barHeight);
        g.fill({ color: theme.bgSecondary.color });
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, numChannels, width, height, theme]);

  const drawStatic = (g: GraphicsType) => {
    g.clear(); g.rect(0, 0, width, height); g.fill({ color: theme.bg.color });
  };

  return isPlaying ? (
    <pixiGraphics ref={graphicsRef} draw={() => {}} layout={{ width, height }} />
  ) : (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics draw={drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText text="LEVELS" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} />
    </pixiContainer>
  );
};
