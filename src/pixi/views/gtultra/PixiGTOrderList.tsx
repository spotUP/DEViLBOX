/**
 * PixiGTOrderList — Order list panel for GoatTracker Ultra (Pixi/GL).
 * Shows pattern sequence per channel using MegaText.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { usePixiTheme } from '../../theme';

const ROW_H = 14;
const HEADER_H = 18;
const FONT_SIZE = 10;

const C_BG       = 0x0d0d0d;
const C_HEADER   = 0x1a1a1a;
const C_ACCENT   = 0x888888;
const C_ORDER    = 0x60e060;
const C_END      = 0xe94560;
const C_REPEAT   = 0xffcc00;
const C_TRANS    = 0xff8866;
const C_DIM      = 0x555555;
const C_CURSOR   = 0xffffff;
const C_SEP      = 0x222222;

interface Props { width: number; height: number }

export const PixiGTOrderList: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const gridRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const containerRef = useRef<any>(null);

  const orderData = useGTUltraStore((s) => s.orderData);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const orderChannelCol = useGTUltraStore((s) => s.orderChannelCol);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;

  const contentH = height - HEADER_H;
  const visibleRows = Math.floor(contentH / ROW_H);
  const totalLen = orderData[0]?.length ?? 0;

  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) containerRef.current.addChild(mega);
    return () => { mega.destroy(); megaRef.current = null; };
  }, []);

  const redraw = useCallback(() => {
    const g = gridRef.current;
    const mega = megaRef.current;
    if (!g || !mega) return;

    g.clear();
    g.rect(0, 0, width, height).fill({ color: C_BG });
    g.rect(0, height - 1, width, 1).fill({ color: C_SEP });

    // Header
    g.rect(0, 0, width, HEADER_H).fill({ color: C_HEADER });

    const labels: GlyphLabel[] = [];
    const ff = PIXI_FONTS.MONO;

    labels.push({ x: 4, y: 3, text: 'ORDER LIST', color: C_ACCENT, fontFamily: ff });

    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));

    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollTop + vi;
      if (idx >= totalLen) break;
      const y = HEADER_H + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      if (isPlay) g.rect(0, y, width, ROW_H).fill({ color: theme.error.color });
      if (isCursor) {
        g.rect(0, y, width, 1).fill({ color: C_CURSOR });
        g.rect(0, y + ROW_H - 1, width, 1).fill({ color: C_CURSOR });
      }

      // Index
      labels.push({ x: 4, y: y + 1, text: idx.toString(16).toUpperCase().padStart(2, '0'), color: C_DIM, fontFamily: ff });

      // Pattern per channel
      const colW = Math.floor((width - 28) / channelCount);
      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        const x = 28 + ch * colW;
        let text: string;
        let color: number;

        if (val === 0xFF) {
          text = 'EN'; color = C_END;
        } else if (val >= 0xF0 && val <= 0xFE) {
          text = `+${(val & 0x0F).toString(16).toUpperCase()}`; color = C_TRANS;
        } else if (val >= 0xE0 && val <= 0xEF) {
          text = `-${(val & 0x0F).toString(16).toUpperCase()}`; color = C_TRANS;
        } else if (val >= 0xD0 && val <= 0xDF) {
          text = `R${(val & 0x0F).toString(16).toUpperCase()}`; color = C_REPEAT;
        } else {
          text = val.toString(16).toUpperCase().padStart(2, '0'); color = C_ORDER;
        }

        // Channel column highlight
        if (isCursor && ch === orderChannelCol) {
          g.rect(x - 2, y, colW, ROW_H).fill({ color: theme.success.color });
        }

        labels.push({ x, y: y + 1, text, color, fontFamily: ff });
      }
    }

    mega.updateLabels(labels, FONT_SIZE);
  }, [width, height, orderData, orderCursor, orderChannelCol, playbackPos.position, channelCount, visibleRows, totalLen]);

  useEffect(() => { redraw(); }, [redraw]);

  const handlePointerUp = useCallback((e: { global: { x: number; y: number } }) => {
    const cont = containerRef.current;
    if (!cont) return;
    const local = cont.toLocal(e.global);
    if (local.y < HEADER_H) return;
    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((local.y - HEADER_H) / ROW_H);
    const colW = Math.floor((width - 28) / channelCount);
    const ch = Math.max(0, Math.min(channelCount - 1, Math.floor((local.x - 28) / colW)));
    if (idx < totalLen) {
      useGTUltraStore.getState().setOrderCursor(idx);
      if (local.x >= 28) useGTUltraStore.getState().setOrderChannelCol(ch);
    }
  }, [orderCursor, visibleRows, totalLen, width, channelCount]);

  return (
    <pixiContainer ref={containerRef} eventMode="static" cursor="default" onPointerUp={handlePointerUp} layout={{ width, height }}>
      <pixiGraphics eventMode="none" ref={gridRef} draw={() => {}} />
    </pixiContainer>
  );
};
