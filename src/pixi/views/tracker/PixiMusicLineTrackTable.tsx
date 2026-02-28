/**
 * PixiMusicLineTrackTable — Pixel-perfect Pixi port of MusicLineTrackTableEditor.
 *
 * Per-channel track table matrix view for MusicLine / per-channel independent
 * track table formats. Shows VISIBLE_ROWS rows centered on the current position.
 *
 * Layout (Hively-style):
 *   Rows    = song positions (0..N) — VISIBLE_ROWS centered on currentPos
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel × position
 *
 * Reads from useTrackerStore and useTransportStore — same as the DOM version.
 * Clicking a row calls onSeek(position).
 */

import React, { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

// Layout constants — matches DOM MusicLineTrackTableEditor
const ROW_HEIGHT = 18;
const POS_COL_WIDTH = 36;
const CHAN_COL_WIDTH = 52;
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS = 7;
const FONT_SIZE = 11;

// HivelyTracker palette (hex)
const HVL_BG       = 0x000000;
const HVL_HIGHLIGHT = 0x780000;
const HVL_TEXT     = 0xffffff;
const HVL_CURSOR   = 0xffff88;
const HVL_DIM      = 0x808080;
const HVL_BORDER   = 0x333333;
const HVL_SEP      = 0x222222;
const HVL_SPEED    = 0xfbbf24;

interface Props {
  width: number;
  height: number;
  onSeek?: (position: number) => void;
}

export const PixiMusicLineTrackTable: React.FC<Props> = ({ width, height, onSeek }) => {
  usePixiTheme(); // subscribe to theme updates

  const channelTrackTables = useTrackerStore((s) => s.channelTrackTables);
  const channelSpeeds = useTrackerStore((s) => s.channelSpeeds);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const initialSpeed = useTransportStore((s) => s.speed);

  // Derived layout values
  const numChannels = channelTrackTables?.length ?? 0;
  const maxPositions = channelTrackTables
    ? Math.max(0, ...channelTrackTables.map((t) => t.length))
    : 0;

  // Center VISIBLE_ROWS around currentPos (same logic as DOM version)
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, Math.min(currentPos - halfVisible, maxPositions - VISIBLE_ROWS));
  const endPos = Math.min(maxPositions, startPos + VISIBLE_ROWS);
  const visiblePositions = useMemo(
    () => Array.from({ length: endPos - startPos }, (_, i) => startPos + i),
    [startPos, endPos],
  );

  const totalWidth = POS_COL_WIDTH + numChannels * CHAN_COL_WIDTH;

  // ── Draw background (header + row backgrounds + borders) ─────────────────
  const drawBg = useCallback(
    (g: GraphicsType) => {
      g.clear();

      // Full background
      g.rect(0, 0, totalWidth, HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT);
      g.fill({ color: HVL_BG });

      // Header bottom border
      g.rect(0, HEADER_HEIGHT - 1, totalWidth, 1);
      g.fill({ color: HVL_BORDER });

      // Row backgrounds
      for (let i = 0; i < visiblePositions.length; i++) {
        const pos = visiblePositions[i];
        const isCurrent = pos === currentPos;
        const y = HEADER_HEIGHT + i * ROW_HEIGHT;

        if (isCurrent) {
          g.rect(0, y, totalWidth, ROW_HEIGHT);
          g.fill({ color: HVL_HIGHLIGHT });
        }

        // Channel column separators
        for (let ch = 0; ch < numChannels; ch++) {
          const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
          g.rect(x, y, 1, ROW_HEIGHT);
          g.fill({ color: isCurrent ? HVL_BG : HVL_SEP });
        }
      }

      // Header channel borders
      for (let ch = 0; ch < numChannels; ch++) {
        const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        g.rect(x, 0, 1, HEADER_HEIGHT);
        g.fill({ color: HVL_BORDER });
      }

      // Invisible anchor rect to establish correct Yoga content bounds
      g.rect(0, 0, width, height);
      g.fill({ color: 0x000000, alpha: 0 });
    },
    [totalWidth, visiblePositions, currentPos, numChannels, width, height],
  );

  // ── Text labels ───────────────────────────────────────────────────────────
  const labels = useMemo(() => {
    if (!channelTrackTables || numChannels === 0) return [];

    const out: {
      x: number;
      y: number;
      text: string;
      color: number;
    }[] = [];

    // Header: "Pos"
    out.push({
      x: 4,
      y: (HEADER_HEIGHT - FONT_SIZE) / 2,
      text: 'Pos',
      color: HVL_DIM,
    });

    // Header: channel labels + optional speed
    for (let ch = 0; ch < numChannels; ch++) {
      const chSpeed = channelSpeeds?.[ch];
      const showSpeed = chSpeed !== undefined && chSpeed !== initialSpeed;
      const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH + CHAN_COL_WIDTH / 2;
      // Center the "CHn" label; y nudged up slightly when speed row is shown
      const baseY = showSpeed
        ? (HEADER_HEIGHT - FONT_SIZE * 2 - 2) / 2
        : (HEADER_HEIGHT - FONT_SIZE) / 2;

      out.push({ x: x - 12, y: baseY, text: `CH${ch + 1}`, color: HVL_DIM });

      if (showSpeed) {
        out.push({
          x: x - 16,
          y: baseY + FONT_SIZE + 1,
          text: `S:${chSpeed}`,
          color: HVL_SPEED,
        });
      }
    }

    // Position rows
    for (let i = 0; i < visiblePositions.length; i++) {
      const pos = visiblePositions[i];
      const isCurrent = pos === currentPos;
      const rowY = HEADER_HEIGHT + i * ROW_HEIGHT + (ROW_HEIGHT - FONT_SIZE) / 2;

      // Position number + ">" indicator
      const posText = `${isCurrent ? '>' : '\u00a0'}${pos.toString().padStart(2, '0')}`;
      out.push({
        x: 2,
        y: rowY,
        text: posText,
        color: isCurrent ? HVL_CURSOR : HVL_DIM,
      });

      // Pattern index per channel
      for (let ch = 0; ch < numChannels; ch++) {
        const patIdx = channelTrackTables[ch]?.[pos];
        const isEmpty = patIdx === undefined;
        const cellX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH + 4;
        out.push({
          x: cellX,
          y: rowY,
          text: isEmpty ? '\u00b7\u00b7\u00b7' : patIdx.toString().padStart(3, '0'),
          color: isEmpty ? HVL_DIM : HVL_TEXT,
        });
      }
    }

    return out;
  }, [channelTrackTables, channelSpeeds, numChannels, initialSpeed, visiblePositions, currentPos]);

  // ── Pointer interaction: click row to seek ────────────────────────────────
  const handlePointerUp = useCallback(
    (e: FederatedPointerEvent) => {
      if (!onSeek) return;
      const local = e.getLocalPosition(e.currentTarget);
      const rowY = local.y - HEADER_HEIGHT;
      if (rowY < 0) return;
      const rowIdx = Math.floor(rowY / ROW_HEIGHT);
      if (rowIdx >= 0 && rowIdx < visiblePositions.length) {
        const pos = visiblePositions[rowIdx];
        if (pos !== undefined) onSeek(pos);
      }
    },
    [onSeek, visiblePositions],
  );

  // Nothing to render if no channel data
  if (!channelTrackTables || numChannels === 0) return null;

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={handlePointerUp}
    >
      {/* Backgrounds + borders */}
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width, height }}
      />

      {/* Text labels — positioned with absolute x/y to avoid Yoga variable-count issues */}
      {labels.map((label, i) => (
        <pixiBitmapText
          key={`ttl-${i}`}
          text={label.text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={label.color}
          x={label.x}
          y={label.y}
        />
      ))}
    </pixiContainer>
  );
};
