/**
 * PixiStereoField — Lissajous/vectorscope stereo field visualization.
 * Circle outline, cross guides, dot trail using RAF loop.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useTransportStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface PixiStereoFieldProps {
  width: number;
  height: number;
}

export const PixiStereoField: React.FC<PixiStereoFieldProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const graphicsRef = useRef<GraphicsType | null>(null);

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;
    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 8;

      // Background
      g.rect(0, 0, width, height);
      g.fill({ color: theme.bg.color });

      // Circle guide
      g.circle(cx, cy, radius);
      g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

      // Crosshairs
      g.moveTo(cx, cy - radius);
      g.lineTo(cx, cy + radius);
      g.stroke({ color: theme.border.color, alpha: 0.1, width: 1 });
      g.moveTo(cx - radius, cy);
      g.lineTo(cx + radius, cy);
      g.stroke({ color: theme.border.color, alpha: 0.1, width: 1 });

      let waveform: Float32Array;
      try { waveform = getToneEngine().getWaveform(); } catch { rafId = requestAnimationFrame(draw); return; }

      // Lissajous dots
      const sampleCount = Math.min(512, Math.floor(waveform.length / 2));
      const step = Math.max(1, Math.floor(waveform.length / sampleCount / 2));

      for (let i = 0; i < sampleCount - 1; i++) {
        const idx = i * step * 2;
        const l = waveform[idx] || 0;
        const r = waveform[idx + 1] || 0;

        const x = cx + (l - r) * radius * 0.7;
        const y = cy - (l + r) * radius * 0.35;

        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / radius;
        const alpha = 0.3 + dist * 0.7;

        g.circle(x, y, 1.2);
        g.fill({ color: theme.accent.color, alpha: Math.min(1, alpha) });
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, width, height, theme]);

  const drawStatic = (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
    const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 8;
    g.circle(cx, cy, r);
    g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });
  };

  return (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics ref={graphicsRef} draw={isPlaying ? () => {} : drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText text="STEREO" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }} tint={theme.textMuted.color} layout={{}} visible={!isPlaying} />
    </pixiContainer>
  );
};
