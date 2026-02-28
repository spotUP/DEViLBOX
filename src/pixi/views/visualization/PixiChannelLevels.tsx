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

// Stable layout objects — inline object literals create new references every render,
// which causes Yoga WASM "Expected null or instance of Node" BindingErrors.
const LABEL_LAYOUT_VISIBLE: Record<string, unknown> = {};
const LABEL_LAYOUT_COLLAPSED: Record<string, unknown> = { width: 0, height: 0 };

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
  const lastGensRef = useRef<number[]>([]);
  const decayLevelsRef = useRef(new Float32Array(32));

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

      let levels: number[];
      let gens: number[];
      try {
        const engine = getToneEngine();
        levels = engine.getChannelTriggerLevels(numChannels);
        gens = engine.getChannelTriggerGenerations(numChannels);
      } catch { rafId = requestAnimationFrame(draw); return; }

      // Grow lastGens if needed
      if (lastGensRef.current.length < numChannels) {
        lastGensRef.current = new Array(numChannels).fill(0);
      }
      if (decayLevelsRef.current.length < numChannels) {
        decayLevelsRef.current = new Float32Array(numChannels);
      }

      const barHeight = Math.max(4, (height - 8) / numChannels - 2);
      const barMaxWidth = width - 40;

      for (let ch = 0; ch < numChannels; ch++) {
        const isNewTrigger = gens[ch] !== lastGensRef.current[ch];
        let level: number;
        if (isNewTrigger && levels[ch] > 0) {
          level = levels[ch];
          lastGensRef.current[ch] = gens[ch];
          decayLevelsRef.current[ch] = level;
        } else {
          decayLevelsRef.current[ch] *= 0.92;
          if (decayLevelsRef.current[ch] < 0.01) decayLevelsRef.current[ch] = 0;
          level = decayLevelsRef.current[ch];
        }
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

  // Always render the same element tree to avoid Yoga node swap BindingErrors.
  // Swapping between pixiGraphics and pixiContainer on isPlaying change causes
  // "Expected null or instance of Node" errors in @pixi/layout's Yoga WASM binding.
  return (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics ref={graphicsRef} draw={isPlaying ? () => {} : drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text="LEVELS"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={isPlaying ? LABEL_LAYOUT_COLLAPSED : LABEL_LAYOUT_VISIBLE}
        visible={!isPlaying}
      />
    </pixiContainer>
  );
};
