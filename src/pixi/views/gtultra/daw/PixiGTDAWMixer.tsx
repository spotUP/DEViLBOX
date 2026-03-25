/**
 * PixiGTDAWMixer — Per-channel mixer strips with VU meters.
 *
 * Reads SID register data for voice activity visualization.
 * Uses channel mute/solo from the shared engine.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import {
  DAW_BG, DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_SURFACE,
  DAW_ACCENT, DAW_SUCCESS, DAW_ERROR, DAW_TEXT, DAW_TEXT_MUTED,
  DAW_CH_COLORS, DAW_RADIUS, DAW_PAD,
} from './dawTheme';

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWMixer: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const animRef = useRef(0);
  const vuLevels = useRef<number[]>([0, 0, 0, 0, 0, 0]);

  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const mega = megaRef.current;
    if (!bg || !mega) return;

    bg.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;
    const pad = DAW_PAD;
    const stripW = Math.min(100, Math.floor((width - pad * 2) / channelCount) - 4);
    const stripH = height - pad * 2;

    bg.rect(0, 0, width, height).fill({ color: DAW_BG });

    for (let ch = 0; ch < channelCount; ch++) {
      const x = pad + ch * (stripW + 4);
      const color = DAW_CH_COLORS[ch % DAW_CH_COLORS.length];

      // Strip background
      bg.roundRect(x, pad, stripW, stripH, DAW_RADIUS)
        .fill({ color: DAW_PANEL_BG });
      bg.roundRect(x, pad, stripW, stripH, DAW_RADIUS)
        .stroke({ color: DAW_PANEL_BORDER, width: 1 });

      // Color indicator bar at top
      bg.roundRect(x + 2, pad + 2, stripW - 4, 4, 2)
        .fill({ color });

      // Channel label
      labels.push({
        x: x + stripW / 2 - 10, y: pad + 10,
        text: `CH ${ch + 1}`,
        color: DAW_TEXT,
        fontFamily: ff,
      });

      // VU meter
      const vuY = pad + 26;
      const vuH = stripH - 90;
      const vuW = 12;
      const vuX = x + stripW / 2 - vuW / 2;

      bg.roundRect(vuX, vuY, vuW, vuH, 2).fill({ color: DAW_SURFACE });

      // Read SID register activity for VU
      const regs = useGTUltraStore.getState().sidRegisters;
      const sidIdx = ch >= 3 ? 1 : 0;
      const voiceIdx = ch % 3;
      const regBase = voiceIdx * 7;
      const regData = regs[sidIdx];
      const freqHi = regData ? regData[regBase + 1] : 0;
      const ctrl = regData ? regData[regBase + 4] : 0;
      const gate = ctrl & 0x01;

      // Simple VU: if gate on and frequency > 0, show level based on freq
      const rawLevel = gate && freqHi > 0 ? Math.min(1, freqHi / 200) : 0;
      // Smooth decay
      vuLevels.current[ch] = Math.max(rawLevel, vuLevels.current[ch] * 0.92);
      const level = vuLevels.current[ch];

      const fillH = level * vuH;
      if (fillH > 0) {
        const vuColor = level > 0.85 ? DAW_ERROR : level > 0.6 ? DAW_ACCENT : DAW_SUCCESS;
        bg.roundRect(vuX, vuY + vuH - fillH, vuW, fillH, 2).fill({ color: vuColor, alpha: 0.8 });
      }

      // Fader placeholder
      const faderY = vuY + vuH + 8;
      labels.push({
        x: x + stripW / 2 - 12, y: faderY,
        text: 'VOL',
        color: DAW_TEXT_MUTED,
        fontFamily: ff,
      });

      // Mute / Solo
      const btnY = faderY + 16;
      labels.push({ x: x + 8, y: btnY, text: 'M', color: DAW_TEXT_MUTED, fontFamily: ff });
      labels.push({ x: x + stripW - 18, y: btnY, text: 'S', color: DAW_TEXT_MUTED, fontFamily: ff });
    }

    mega.updateLabels(labels, 8);
  }, [width, height, channelCount]);

  // Animation loop for VU meters
  useEffect(() => {
    let frameCount = 0;
    const tick = () => {
      if (frameCount++ % 3 === 0) {
        useGTUltraStore.getState().refreshSidRegisters();
      }
      redraw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [redraw]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }}>
      <pixiGraphics ref={bgRef} draw={() => {}} />
    </pixiContainer>
  );
};
