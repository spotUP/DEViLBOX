/**
 * PixiGTDAWArrangement — Horizontal timeline with colored pattern blocks.
 *
 * Shows the song structure as colored rectangles across channel tracks.
 * Click a block to select it for editing in the piano roll.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import {
  DAW_BG, DAW_PANEL_BG, DAW_PANEL_BORDER, DAW_ACCENT_WARM,
  DAW_TEXT, DAW_TEXT_SEC, DAW_CH_COLORS, DAW_CHANNEL_HEADER_W,
  DAW_RADIUS,
} from './dawTheme';

interface Props {
  width: number;
  height: number;
}

export const PixiGTDAWArrangement: React.FC<Props> = ({ width, height }) => {
  const containerRef = useRef<any>(null);
  const bgRef = useRef<GraphicsType>(null);
  const blocksRef = useRef<GraphicsType>(null);
  const overlayRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const scrollRef = useRef(0);

  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const dawSelectedChannel = useGTUltraStore((s) => s.dawSelectedChannel);
  const dawSelectedPattern = useGTUltraStore((s) => s.dawSelectedPattern);

  const channelCount = sidCount * 3;

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const bg = bgRef.current;
    const blocks = blocksRef.current;
    const overlay = overlayRef.current;
    const mega = megaRef.current;
    if (!bg || !blocks || !overlay || !mega) return;

    bg.clear();
    blocks.clear();
    overlay.clear();

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;

    const headerW = DAW_CHANNEL_HEADER_W;
    const gridW = width - headerW;
    const trackH = Math.max(20, Math.floor((height - 2) / channelCount));
    const scrollX = scrollRef.current;

    // Background
    bg.rect(0, 0, width, height).fill({ color: DAW_BG });
    bg.rect(0, 0, width, height).stroke({ color: DAW_PANEL_BORDER, width: 1 });

    // Channel headers + blocks
    for (let ch = 0; ch < channelCount; ch++) {
      const y = ch * trackH;
      const color = DAW_CH_COLORS[ch % DAW_CH_COLORS.length];

      // Header background
      bg.rect(0, y, headerW, trackH).fill({ color: DAW_PANEL_BG });
      bg.rect(headerW - 1, y, 1, trackH).fill({ color: DAW_PANEL_BORDER });

      // Color indicator
      bg.rect(0, y, 3, trackH).fill({ color });

      // Channel label
      labels.push({
        x: 8, y: y + Math.floor(trackH / 2) - 4,
        text: `CH${ch + 1}`,
        color: DAW_TEXT_SEC,
        fontFamily: ff,
      });

      // Track separator
      bg.rect(headerW, y + trackH - 1, gridW, 1).fill({ color: DAW_PANEL_BORDER, alpha: 0.3 });

      // Pattern blocks from order data
      const od = orderData[ch];
      if (!od) continue;

      let blockX = headerW - scrollX;
      for (let oi = 0; oi < od.length; oi++) {
        const patNum = od[oi];
        if (patNum === 0xFF) break; // end of order list
        if (patNum >= 0xD0) continue; // skip order commands

        const pd = patternData.get(patNum);
        const patLen = pd ? pd.length : 32;
        const blockW = Math.max(8, patLen * 2); // 2px per row

        if (blockX + blockW > headerW && blockX < width) {
          const isSelected = ch === dawSelectedChannel && patNum === dawSelectedPattern;

          // Block rectangle with rounded corners
          blocks.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, DAW_RADIUS)
            .fill({ color, alpha: isSelected ? 0.5 : 0.25 });
          blocks.roundRect(blockX + 1, y + 2, blockW - 2, trackH - 4, DAW_RADIUS)
            .stroke({ color, width: isSelected ? 2 : 1, alpha: isSelected ? 1 : 0.6 });

          // Pattern number inside block
          const patHex = patNum.toString(16).toUpperCase().padStart(2, '0');
          labels.push({
            x: blockX + 4, y: y + Math.floor(trackH / 2) - 4,
            text: patHex,
            color: isSelected ? DAW_TEXT : color,
            fontFamily: ff,
          });
        }

        blockX += blockW;
      }
    }

    // Playhead
    if (playing) {
      // Approximate playhead X from song position
      const phCh0 = orderData[0];
      if (phCh0) {
        let phX = headerW - scrollX;
        for (let oi = 0; oi < playbackPos.songPos && oi < phCh0.length; oi++) {
          const pn = phCh0[oi];
          if (pn === 0xFF) break;
          if (pn >= 0xD0) continue;
          const pd = patternData.get(pn);
          phX += Math.max(8, (pd ? pd.length : 32) * 2);
        }
        phX += playbackPos.row * 2;
        overlay.rect(phX, 0, 2, height).fill({ color: DAW_ACCENT_WARM });
      }
    }

    mega.updateLabels(labels, 8);
  }, [width, height, orderData, patternData, channelCount, playing, playbackPos, dawSelectedChannel, dawSelectedPattern]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Click handler — select block
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current);
    const headerW = DAW_CHANNEL_HEADER_W;
    if (local.x < headerW) return;

    const trackH = Math.max(20, Math.floor((height - 2) / channelCount));
    const ch = Math.floor(local.y / trackH);
    if (ch < 0 || ch >= channelCount) return;

    // Find which block was clicked
    const od = orderData[ch];
    if (!od) return;
    const scrollX = scrollRef.current;
    let blockX = headerW - scrollX;

    for (let oi = 0; oi < od.length; oi++) {
      const patNum = od[oi];
      if (patNum === 0xFF) break;
      if (patNum >= 0xD0) continue;

      const pd = patternData.get(patNum);
      const blockW = Math.max(8, (pd ? pd.length : 32) * 2);

      if (local.x >= blockX && local.x < blockX + blockW) {
        useGTUltraStore.getState().setDawSelectedChannel(ch);
        useGTUltraStore.getState().setDawSelectedPattern(patNum);
        return;
      }
      blockX += blockW;
    }
  }, [height, channelCount, orderData, patternData]);

  // Wheel scrolling can be added via Pixi event system if needed

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics ref={bgRef} draw={() => {}} />
      <pixiGraphics ref={blocksRef} draw={() => {}} />
      <pixiGraphics ref={overlayRef} draw={() => {}} />
    </pixiContainer>
  );
};
