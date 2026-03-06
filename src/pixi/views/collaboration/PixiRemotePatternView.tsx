/**
 * PixiRemotePatternView — Read-only pattern grid showing the peer's current pattern.
 * Matches the DOM RemotePatternView 1:1: FT2-style toolbar, channel headers,
 * playback position highlight, dynamic channel count, column visibility toggles,
 * and effect column support.
 *
 * Grid body uses MegaText batched rendering for performance (single draw call
 * instead of thousands of individual PixiLabel elements).
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedWheelEvent } from 'pixi.js';
import { PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTrackerStore, useEditorStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { MegaText, type GlyphLabel } from '../../utils/MegaText';
import { PIXI_FONTS } from '../../fonts';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatNote(note: number): string {
  if (note <= 0) return '---';
  if (note === 97 || note === 255) return '===';
  const octave = Math.floor((note - 1) / 12);
  const name = NOTE_NAMES[(note - 1) % 12];
  return `${name}${octave}`;
}

function formatHex(val: number, digits: number): string {
  if (val <= 0) return '.'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function formatEffect(effTyp: number, eff: number): string {
  if (effTyp <= 0 && eff <= 0) return '...';
  const t = effTyp > 0 ? effTyp.toString(16).toUpperCase() : '.';
  const p = eff > 0 ? eff.toString(16).toUpperCase().padStart(2, '0') : '..';
  return `${t}${p}`;
}

const ROW_HEIGHT = 16;
const CHAR_WIDTH = 7;
const ROW_NUM_WIDTH = 28;
const TOOLBAR_ROW_HEIGHT = 18;
const TOOLBAR_HEIGHT = TOOLBAR_ROW_HEIGHT * 2 + 28; // 2 rows + friend indicator
const CHANNEL_HEADER_HEIGHT = 24;
const COLUMN_TOGGLE_HEIGHT = 20;
const COLLAPSED_WIDTH = 28;

const CHANNEL_COLORS = [
  0x4488ff, 0xff4488, 0x44ff88, 0xffaa44,
  0x8844ff, 0xff8844, 0x44ffaa, 0xaa44ff,
];

interface ColumnVisibility {
  note: boolean;
  inst: boolean;
  vol: boolean;
  fx: boolean;
}

export const PixiRemotePatternView: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const theme = usePixiTheme();
  const peerPatternIndex = useCollaborationStore(s => s.peerPatternIndex);
  const peerCursorRow = useCollaborationStore(s => s.peerCursorRow);
  const patterns = useTrackerStore(s => s.patterns);
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const bpm = useTransportStore(s => s.bpm);
  const speed = useTransportStore(s => s.speed);

  const storeColVis = useEditorStore(s => s.columnVisibility);
  const showAcid = storeColVis.flag1 || storeColVis.flag2;

  const [showColumns, setShowColumns] = useState<ColumnVisibility>({
    note: true, inst: true, vol: true, fx: false,
  });
  const [scrollY, setScrollY] = useState(0);

  const toggleColumn = useCallback((col: keyof ColumnVisibility) => {
    setShowColumns(prev => ({ ...prev, [col]: !prev[col] }));
  }, []);

  const pattern = patterns[peerPatternIndex] ?? null;
  const channels = pattern ? pattern.channels : [];
  const channelCount = channels.length;
  const rowCount = pattern?.length ?? 0;
  const songLength = patternOrder.length;
  const contentHeight = rowCount * ROW_HEIGHT;

  // Compute per-channel cell width based on visible columns and collapsed state
  const channelWidths = useMemo(() => {
    return channels.map((ch) => {
      if (ch.collapsed) return COLLAPSED_WIDTH;
      let w = 4; // padding
      if (showColumns.note) w += CHAR_WIDTH * 3 + 4;
      if (showColumns.inst) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.vol) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.fx) w += CHAR_WIDTH * 3 + 4;
      if (showAcid) w += CHAR_WIDTH * 2 + 4;
      if (showColumns.fx) w += CHAR_WIDTH * 2 + 4; // probability when fx visible
      return Math.max(w, 24);
    });
  }, [channels, showColumns, showAcid]);

  const totalChannelsWidth = channelWidths.reduce((a, b) => a + b, 0);

  // ── MegaText refs ──
  const gridContainerRef = useRef<ContainerType>(null);
  const gridGraphicsRef = useRef<GraphicsType>(null);
  const scrollbarGraphicsRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);

  // Initialize MegaText instance
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (gridContainerRef.current) {
      gridContainerRef.current.addChild(mega);
    }
    return () => {
      mega.destroy();
      megaRef.current = null;
    };
  }, []);

  // Re-attach MegaText when container mounts
  useEffect(() => {
    const mega = megaRef.current;
    const container = gridContainerRef.current;
    if (mega && container && !mega.parent) {
      container.addChild(mega);
    }
  });

  const gridHeight = height - TOOLBAR_HEIGHT - CHANNEL_HEADER_HEIGHT - COLUMN_TOGGLE_HEIGHT;
  const maxScrollY = Math.max(0, contentHeight - gridHeight);
  const visibleRows = Math.ceil(gridHeight / ROW_HEIGHT) + 1;

  // Scroll handler
  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY(prev => Math.max(0, Math.min(maxScrollY, prev + e.deltaY)));
  }, [maxScrollY]);

  // Reset scroll when pattern changes
  useEffect(() => { setScrollY(0); }, [peerPatternIndex]);

  // ── Imperative grid redraw (backgrounds + MegaText labels) ──
  const imperativeRedraw = useCallback(() => {
    const grid = gridGraphicsRef.current;
    const mega = megaRef.current;
    if (!grid || !mega) return;

    grid.clear();
    const labels: GlyphLabel[] = [];
    const fontFamily = PIXI_FONTS.MONO;
    const FONT_SIZE = 11;

    const startRow = Math.floor(scrollY / ROW_HEIGHT);
    const endRow = Math.min(rowCount, startRow + visibleRows);
    const yOffset = -(scrollY % ROW_HEIGHT);

    const gridW = ROW_NUM_WIDTH + totalChannelsWidth + 4;

    for (let vi = 0; vi < endRow - startRow; vi++) {
      const row = startRow + vi;
      if (row >= rowCount) break;
      const y = vi * ROW_HEIGHT + yOffset;

      // Row background highlights
      const isPlaybackRow = isPlaying && row === currentRow;
      const isPeerCursor = row === peerCursorRow;
      const isHighlight = row % 16 === 0;
      const isBeat = row % 4 === 0;

      if (isPlaybackRow) {
        grid.rect(0, y, gridW, ROW_HEIGHT).fill({ color: theme.accent.color });
      } else if (isPeerCursor) {
        grid.rect(0, y, gridW, ROW_HEIGHT).fill({ color: 0x2a4060, alpha: 0.5 });
      } else if (isHighlight) {
        grid.rect(0, y, gridW, ROW_HEIGHT).fill({ color: theme.trackerRowHighlight.color, alpha: 0.3 });
      } else if (isBeat) {
        grid.rect(0, y, gridW, ROW_HEIGHT).fill({ color: theme.trackerRowEven.color, alpha: 0.2 });
      }

      // Channel column backgrounds (alternating tint)
      let colX = ROW_NUM_WIDTH;
      for (let chIdx = 0; chIdx < channelCount; chIdx++) {
        const w = channelWidths[chIdx];
        if (chIdx % 2 === 0) {
          const chColor = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
          const colBg = (chColor >> 3) & 0x1f1f1f;
          grid.rect(colX, y, w, ROW_HEIGHT).fill({ color: colBg, alpha: 0.3 });
        }
        colX += w;
      }

      const textY = y + 2;
      const textColor = isPlaybackRow ? 0x000000 : undefined;

      // Row number
      labels.push({
        x: 2,
        y: textY,
        text: row.toString(16).toUpperCase().padStart(2, '0'),
        color: textColor ?? theme.textMuted.color,
        fontFamily,
      });

      // Cell data per channel
      let xOffset = ROW_NUM_WIDTH;
      for (let chIdx = 0; chIdx < channelCount; chIdx++) {
        const ch = channels[chIdx];
        const w = channelWidths[chIdx];

        if (ch.collapsed) {
          xOffset += w;
          continue;
        }

        const cell = ch.rows[row];
        if (!cell) {
          xOffset += w;
          continue;
        }

        const parts: string[] = [];
        if (showColumns.note) parts.push(formatNote(cell.note));
        if (showColumns.inst) parts.push(formatHex(cell.instrument, 2));
        if (showColumns.vol) parts.push(formatHex(cell.volume, 2));
        if (showColumns.fx) parts.push(formatEffect(cell.effTyp, cell.eff));
        if (showAcid) {
          const f = cell.flag1 ?? 0;
          parts.push(f === 1 ? 'A' : f === 2 ? 'S' : '.');
        }
        if (showColumns.fx) {
          const p = cell.probability ?? 0;
          parts.push(p > 0 ? p.toString(16).toUpperCase().padStart(2, '0') : '..');
        }
        const text = parts.join(' ');

        const isEmpty = cell.note <= 0 && cell.instrument <= 0 && cell.volume <= 0
          && (!showColumns.fx || (cell.effTyp <= 0 && cell.eff <= 0));

        labels.push({
          x: xOffset + 2,
          y: textY,
          text,
          color: textColor ?? (isEmpty ? theme.textMuted.color : theme.text.color),
          fontFamily,
        });

        xOffset += w;
      }
    }

    mega.updateLabels(labels, FONT_SIZE);
  }, [scrollY, rowCount, visibleRows, channelCount, channels, channelWidths,
      totalChannelsWidth, showColumns, showAcid, isPlaying, currentRow,
      peerCursorRow, theme]);

  // Trigger redraw when dependencies change
  useEffect(() => { imperativeRedraw(); }, [imperativeRedraw]);

  // ── Scrollbar drawing ──
  const drawScrollbar = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScrollY <= 0) return;
    const SCROLLBAR_W = 6;
    const trackH = gridHeight - 4;
    const thumbH = Math.max(20, (gridHeight / contentHeight) * trackH);
    const thumbY = 2 + (scrollY / maxScrollY) * (trackH - thumbH);

    g.roundRect(width - SCROLLBAR_W - 2, 2, SCROLLBAR_W, trackH, 3);
    g.fill({ color: theme.bgActive.color, alpha: 0.3 });
    g.roundRect(width - SCROLLBAR_W - 2, thumbY, SCROLLBAR_W, thumbH, 3);
    g.fill({ color: theme.textMuted.color, alpha: 0.4 });
  }, [width, gridHeight, contentHeight, scrollY, maxScrollY, theme]);

  // ── Clipping mask for grid area ──
  const drawMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, gridHeight);
    g.fill({ color: 0xffffff });
  }, [width, gridHeight]);

  if (!pattern) {
    return (
      <layoutContainer
        layout={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.bg.color,
        }}
      >
        <PixiLabel text="Waiting for friend's view..." size="sm" font="sans" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer
      layout={{
        flexDirection: 'column',
        width,
        height,
        backgroundColor: theme.bg.color,
      }}
    >
      {/* ── Read-only FT2 Toolbar ── */}
      <layoutContainer
        layout={{
          flexDirection: 'column',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        {/* Friend indicator */}
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 16, marginBottom: 2 }}>
          <PixiLabel text="Friend's View" size="xs" weight="bold" color="accent" />
          <PixiLabel text="(read-only)" size="xs" color="textMuted" />
        </layoutContainer>

        {/* Row 1: Position, BPM, Pattern */}
        <layoutContainer layout={{ flexDirection: 'row', height: TOOLBAR_ROW_HEIGHT, gap: 16 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Pos:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(currentPositionIndex).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="BPM:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(bpm).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Pat:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(peerPatternIndex).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
        </layoutContainer>

        {/* Row 2: Song Length, Speed, Pattern Length */}
        <layoutContainer layout={{ flexDirection: 'row', height: TOOLBAR_ROW_HEIGHT, gap: 16 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Len:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(songLength).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Spd:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(speed).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            <PixiLabel text="Rows:" size="xs" font="mono" color="textSecondary" />
            <PixiLabel text={String(rowCount).padStart(3, '0')} size="xs" font="mono" color="text" />
          </layoutContainer>
          {isPlaying && (
            <PixiLabel text="PLAYING" size="xs" weight="bold" color="success" />
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Column visibility toggles ── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: COLUMN_TOGGLE_HEIGHT,
          alignItems: 'center',
          paddingLeft: 4,
          gap: 2,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="Show:" size="xs" font="sans" color="textMuted" layout={{ marginRight: 4 }} />
        <PixiButton
          label="Note"
          size="sm"
          variant={showColumns.note ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('note')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Inst"
          size="sm"
          variant={showColumns.inst ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('inst')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Vol"
          size="sm"
          variant={showColumns.vol ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('vol')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
        <PixiButton
          label="Fx"
          size="sm"
          variant={showColumns.fx ? 'primary' : 'ghost'}
          onClick={() => toggleColumn('fx')}
          height={16}
          layout={{ paddingLeft: 4, paddingRight: 4 }}
        />
      </layoutContainer>

      {/* ── Channel headers ── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          height: CHANNEL_HEADER_HEIGHT,
          alignItems: 'center',
          paddingLeft: 2,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <layoutContainer layout={{ width: ROW_NUM_WIDTH }}>
          <PixiLabel text="ROW" size="xs" font="mono" color="textMuted" />
        </layoutContainer>
        {channels.map((ch, idx) => {
          const chColor = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
          const tintBg = (chColor >> 2) & 0x3f3f3f;
          const w = channelWidths[idx];
          if (ch.collapsed) {
            return (
              <layoutContainer
                key={ch.id}
                layout={{
                  width: w,
                  height: CHANNEL_HEADER_HEIGHT,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: tintBg,
                }}
              >
                <PixiLabel
                  text={(idx + 1).toString().padStart(2, '0')}
                  size="xs"
                  font="mono"
                  color="textMuted"
                />
              </layoutContainer>
            );
          }
          return (
            <layoutContainer
              key={ch.id}
              layout={{
                width: w,
                height: CHANNEL_HEADER_HEIGHT,
                flexDirection: 'column',
                justifyContent: 'center',
                paddingLeft: 2,
                backgroundColor: tintBg,
              }}
            >
              <PixiLabel
                text={`${(idx + 1).toString().padStart(2, '0')} ${ch.shortName || ch.name || `CH${idx + 1}`}`}
                size="xs"
                font="mono"
                color={ch.muted ? 'textMuted' : 'textSecondary'}
              />
            </layoutContainer>
          );
        })}
      </layoutContainer>

      {/* ── Pattern grid (MegaText) ── */}
      {rowCount > 0 && (
        <pixiContainer
          eventMode="static"
          onWheel={handleWheel}
          layout={{ width, height: gridHeight, overflow: 'hidden' }}
        >
          {/* Clipping mask */}
          <pixiGraphics draw={drawMask} layout={{ position: 'absolute' }} />

          {/* Grid backgrounds + channel tints (drawn imperatively) */}
          <pixiGraphics ref={gridGraphicsRef} draw={() => {}} />

          {/* MegaText container (MegaText added imperatively as child) */}
          <pixiContainer ref={gridContainerRef} />

          {/* Scrollbar overlay */}
          <pixiGraphics
            ref={scrollbarGraphicsRef}
            draw={drawScrollbar}
            layout={{ position: 'absolute', width, height: gridHeight }}
          />
        </pixiContainer>
      )}
    </layoutContainer>
  );
};
