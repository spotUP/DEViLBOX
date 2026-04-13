/**
 * PixiChannelOscilloscope — Per-channel waveform display in grid layout.
 * Each channel gets a small panel showing its individual waveform.
 */

import { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { useTransportStore, useTrackerStore } from '@stores';
import { useOscilloscopeStore } from '@stores/useOscilloscopeStore';
import { getToneEngine } from '@engine/ToneEngine';

interface PixiChannelOscilloscopeProps {
  width: number;
  height: number;
}

export const PixiChannelOscilloscope: React.FC<PixiChannelOscilloscopeProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);
  const numChannels = useTrackerStore(s => {
    const pat = s.patterns[s.currentPatternIndex];
    return pat?.channels.length || 4;
  });
  const graphicsRef = useRef<GraphicsType | null>(null);

  useEffect(() => {
    if (!isPlaying || !graphicsRef.current) return;

    try { getToneEngine().enableAnalysers(); } catch { /* not ready */ }

    let rafId: number;
    const draw = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      const cols = Math.ceil(Math.sqrt(numChannels));
      const rows = Math.ceil(numChannels / cols);
      const cellW = width / cols;
      const cellH = height / rows;

      // Prefer per-channel WASM oscilloscope data from store
      const oscState = useOscilloscopeStore.getState();
      const oscData = oscState.isActive ? oscState.channelData : null;

      // Fallback: master waveform from Tone.js analyser
      let masterWaveform: Float32Array | null = null;
      if (!oscData) {
        try { masterWaveform = getToneEngine().getWaveform(); } catch { /* not ready */ }
      }

      for (let ch = 0; ch < numChannels; ch++) {
        const col = ch % cols;
        const row = Math.floor(ch / cols);
        const x0 = col * cellW;
        const y0 = row * cellH;

        // Cell background
        g.rect(x0 + 1, y0 + 1, cellW - 2, cellH - 2);
        g.fill({ color: theme.bg.color, alpha: 0.8 });
        g.rect(x0 + 1, y0 + 1, cellW - 2, cellH - 2);
        g.stroke({ color: theme.border.color, alpha: 0.2, width: 1 });

        // Center line
        const midY = y0 + cellH / 2;
        g.moveTo(x0 + 4, midY);
        g.lineTo(x0 + cellW - 4, midY);
        g.stroke({ color: theme.border.color, alpha: 0.15, width: 1 });

        const drawW = cellW - 8;
        const amplitude = (cellH / 2) - 4;

        // Per-channel WASM oscilloscope data (Int16 → float)
        const chData = oscData?.[ch];
        if (chData && chData.length > 0) {
          const step = chData.length / drawW;
          g.moveTo(x0 + 4, midY - (chData[0] / 32768.0) * amplitude);
          for (let i = 1; i < drawW; i++) {
            const sIdx = Math.floor(i * step);
            const val = chData[sIdx] / 32768.0;
            g.lineTo(x0 + 4 + i, midY - val * amplitude);
          }
          g.stroke({ color: theme.accent.color, alpha: 0.8, width: 1 });
        }
        // Fallback: slice of master waveform
        else if (masterWaveform && masterWaveform.length > 0) {
          const samplesPerCh = Math.floor(masterWaveform.length / numChannels);
          const startSample = ch * samplesPerCh;
          if (samplesPerCh > 0) {
            const step = samplesPerCh / drawW;
            g.moveTo(x0 + 4, midY + (masterWaveform[startSample] || 0) * amplitude);
            for (let i = 1; i < drawW; i++) {
              const sIdx = startSample + Math.floor(i * step);
              const val = masterWaveform[sIdx] || 0;
              g.lineTo(x0 + 4 + i, midY + val * amplitude);
            }
            g.stroke({ color: theme.accent.color, alpha: 0.8, width: 1 });
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, numChannels, width, height, theme]);

  const drawStatic = (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
  };

  return (
    <pixiContainer layout={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <pixiGraphics ref={graphicsRef} draw={isPlaying ? () => {} : drawStatic} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text="CH SCOPE"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
        alpha={!isPlaying ? 1 : 0}
      />
    </pixiContainer>
  );
};
