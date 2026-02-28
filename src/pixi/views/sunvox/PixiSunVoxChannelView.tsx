/**
 * PixiSunVoxChannelView — Pixi channel view for SunVox channels.
 *
 * Displays a standard tracker pattern editor (note / velocity / effect columns)
 * for a single SunVox-typed channel.  The visual layout is identical to the
 * classic PixiPatternEditor but scoped to a single channel index and annotated
 * with SunVox-specific chrome (header label, module-ID badge).
 *
 * Channel type: 'sunvox' (channelMeta.channelType)
 *
 * Rendering approach follows PixiTB303View:
 *  - pixiGraphics for row backgrounds, separators, cursor, selection
 *  - pixiBitmapText for cell text (note, instrument/velocity, effect)
 *  - PixiLabel/PixiButton for the transport/header bar chrome
 */

import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiLabel, PixiButton } from '../../components';
import { useTrackerStore, useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

// ─── Note formatting ─────────────────────────────────────────────────────────

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const n = note - 1;
  const semitone = n % 12;
  const octave = Math.floor(n / 12);
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function hexByte(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

function formatEffect(typ: number, val: number): string {
  if (typ === 0 && val === 0) return '...';
  const t = typ < 10 ? String(typ) : String.fromCharCode(55 + typ);
  return `${t}${hexByte(val)}`;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const ROW_HEIGHT = 18;
const FONT_SIZE = 11;
const CHAR_WIDTH = 10;
const TRANSPORT_H = 32;
const HEADER_H = 24;
const LINE_NUM_W = 32;

// Column widths
const NOTE_W = CHAR_WIDTH * 3 + 4;   // "C-4" or "---"
const INS_W  = CHAR_WIDTH * 2 + 4;   // "1A" hex byte
const VOL_W  = CHAR_WIDTH * 2 + 4;   // "40" hex byte
const EFF_W  = CHAR_WIDTH * 3 + 4;   // "A0F" effect+param

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PixiSunVoxChannelViewProps {
  /** Channel index within the current pattern (0-based). */
  channelIndex?: number;
  width: number;
  height: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiSunVoxChannelView: React.FC<PixiSunVoxChannelViewProps> = ({
  channelIndex = 0,
  width,
  height,
}) => {
  const theme = usePixiTheme();

  const { patterns, currentPatternIndex, setCell } = useTrackerStore(
    useShallow((s) => ({
      patterns: s.patterns,
      currentPatternIndex: s.currentPatternIndex,
      setCell: s.setCell,
    }))
  );

  const isPlaying    = useTransportStore((s) => s.isPlaying);
  const currentRow   = useTransportStore((s) => s.currentRow);
  const bpm          = useTransportStore((s) => s.bpm);

  const currentPattern = patterns[currentPatternIndex];
  const channel        = currentPattern?.channels[channelIndex];
  const patternLength  = currentPattern?.length ?? 64;

  // Module ID badge (from channelMeta)
  const moduleId = channel?.channelMeta?.sunvoxModuleId;

  // ── Scroll state ────────────────────────────────────────────────────────────

  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);

  // Keep scrollTop centred on the current row (playback or cursor)
  const cursorRow = useTrackerStore((s) => s.cursor.rowIndex);
  const displayRow = isPlaying ? (currentRow % patternLength) : cursorRow;

  const gridHeight = height - TRANSPORT_H - HEADER_H;
  const visibleRows = Math.ceil(gridHeight / ROW_HEIGHT) + 2;
  const topRows     = Math.floor(visibleRows / 2);
  const centerLineY = Math.floor(gridHeight / 2) - ROW_HEIGHT / 2;

  // Derive scroll so the display row is centred
  useEffect(() => {
    const target = displayRow - topRows;
    if (target !== scrollTopRef.current) {
      scrollTopRef.current = target;
      setScrollTop(target);
    }
  }, [displayRow, topRows]);

  const vStart = scrollTop;
  const baseY  = centerLineY - topRows * ROW_HEIGHT;

  // ── Clear channel ───────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    if (!currentPattern) return;
    for (let row = 0; row < patternLength; row++) {
      setCell(channelIndex, row, {
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0,
      });
    }
  }, [channelIndex, setCell, currentPattern, patternLength]);

  // ── Draw background / grid ───────────────────────────────────────────────────

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    // Full background
    g.rect(0, 0, width, gridHeight);
    g.fill({ color: theme.bg.color });

    for (let i = 0; i < visibleRows; i++) {
      const rowNum = vStart + i;
      const y      = baseY + i * ROW_HEIGHT;
      if (y + ROW_HEIGHT < 0 || y > gridHeight) continue;
      if (rowNum < 0 || rowNum >= patternLength) continue;

      const isHighlight = rowNum % 4 === 0;
      g.rect(LINE_NUM_W, y, width - LINE_NUM_W, ROW_HEIGHT);
      g.fill({
        color: isHighlight ? theme.trackerRowHighlight.color : theme.trackerRowOdd.color,
        alpha: isHighlight ? theme.trackerRowHighlight.alpha : theme.trackerRowOdd.alpha,
      });

      // Active (centre) row highlight
      if (rowNum === displayRow) {
        g.rect(0, y, width, ROW_HEIGHT);
        g.fill({ color: theme.accentGlow.color, alpha: theme.accentGlow.alpha });
      }
    }

    // Line-number gutter background
    g.rect(0, 0, LINE_NUM_W, gridHeight);
    g.fill({ color: theme.bg.color, alpha: 0.85 });

    // Right edge of gutter
    g.rect(LINE_NUM_W - 1, 0, 1, gridHeight);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, gridHeight, theme, visibleRows, vStart, baseY, patternLength, displayRow]);

  // ── Draw header columns ───────────────────────────────────────────────────────

  const drawHeader = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, HEADER_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  // ── Cell labels ───────────────────────────────────────────────────────────────

  const cellLabels = useMemo(() => {
    if (!channel) return [];
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    for (let i = 0; i < visibleRows; i++) {
      const rowNum = vStart + i;
      const y      = baseY + i * ROW_HEIGHT + ROW_HEIGHT / 2 - FONT_SIZE / 2;
      if (y + ROW_HEIGHT < -ROW_HEIGHT || y > gridHeight + ROW_HEIGHT) continue;
      if (rowNum < 0 || rowNum >= patternLength) continue;

      const isHighRow = rowNum % 4 === 0;
      const lineText  = rowNum.toString(16).toUpperCase().padStart(2, '0');
      labels.push({
        x: 4, y,
        text: lineText,
        color: isHighRow ? theme.accentSecondary.color : theme.textMuted.color,
      });

      const cell = channel.rows[rowNum];
      if (!cell) continue;

      const isActiveRow = rowNum === displayRow;
      let px = LINE_NUM_W + 8;

      // Note
      const noteStr   = noteToString(cell.note ?? 0);
      const noteColor = cell.note === 97
        ? theme.cellEffect.color
        : (cell.note > 0 && cell.note < 97)
          ? (isActiveRow ? 0xffffff : theme.cellNote.color)
          : theme.cellEmpty.color;
      labels.push({ x: px, y, text: noteStr, color: noteColor });
      px += NOTE_W;

      // Instrument (velocity in SunVox context)
      const insText  = cell.instrument > 0 ? hexByte(cell.instrument) : '..';
      const insColor = cell.instrument > 0 ? theme.cellInstrument.color : theme.cellEmpty.color;
      labels.push({ x: px, y, text: insText, color: insColor });
      px += INS_W;

      // Volume
      const volValid = cell.volume >= 0x10 && cell.volume <= 0x50;
      const volText  = volValid ? hexByte(cell.volume) : '..';
      const volColor = volValid ? theme.cellVolume.color : theme.cellEmpty.color;
      labels.push({ x: px, y, text: volText, color: volColor });
      px += VOL_W;

      // Effect 1
      const eff1Text  = formatEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const eff1Color = (cell.effTyp ?? 0) > 0 || (cell.eff ?? 0) > 0
        ? theme.cellEffect.color : theme.cellEmpty.color;
      labels.push({ x: px, y, text: eff1Text, color: eff1Color });
      px += EFF_W;

      // Effect 2
      const eff2Text  = formatEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
      const eff2Color = (cell.effTyp2 ?? 0) > 0 || (cell.eff2 ?? 0) > 0
        ? theme.cellEffect.color : theme.cellEmpty.color;
      labels.push({ x: px, y, text: eff2Text, color: eff2Color });
    }

    return labels;
  }, [channel, visibleRows, vStart, baseY, gridHeight, patternLength, displayRow, theme]);

  // ── Header column labels (drawn once) ────────────────────────────────────────

  const headerLabels = useMemo(() => {
    const hy = HEADER_H / 2 - FONT_SIZE / 2;
    let px = LINE_NUM_W + 8;
    const items: { x: number; text: string; color: number }[] = [
      { x: 4,  text: 'ROW', color: theme.textMuted.color },
      { x: px, text: 'NOTE', color: theme.textMuted.color },
    ];
    px += NOTE_W;
    items.push({ x: px, text: 'INS',  color: theme.textMuted.color }); px += INS_W;
    items.push({ x: px, text: 'VOL',  color: theme.textMuted.color }); px += VOL_W;
    items.push({ x: px, text: 'EFF1', color: theme.textMuted.color }); px += EFF_W;
    items.push({ x: px, text: 'EFF2', color: theme.textMuted.color });
    return items.map(it => ({ ...it, y: hy }));
  }, [theme]);

  // ── Transport bar draw ──────────────────────────────────────────────────────

  const drawTransport = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TRANSPORT_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TRANSPORT_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  // ── Render ─────────────────────────────────────────────────────────────────
  // Use visible prop instead of early return to avoid @pixi/layout BindingError.
  // Conditional mount/unmount of Pixi children triggers Yoga node swap errors;
  // always render the same tree structure and control visibility instead.
  const hasChannel = !!channel;

  return (
    <pixiContainer layout={{ width, height }}>
      {/* Error overlay — always mounted; shown only when no channel.
          position: 'absolute' keeps it out of the flex layout flow. */}
      <pixiBitmapText
        alpha={!hasChannel ? 1 : 0}
        renderable={!hasChannel}
        text={hasChannel ? '' : `No channel at index ${channelIndex}`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
        tint={theme.error.color}
        layout={{ position: 'absolute', marginTop: 40, marginLeft: 20 }}
      />

      {/* Main content — always mounted; hidden when no channel */}
      <pixiContainer alpha={hasChannel ? 1 : 0} renderable={hasChannel} eventMode={hasChannel ? 'static' : 'none'} layout={{ width, height, flexDirection: 'column' }}>

        {/* ── Transport / title bar ─────────────────────────────────────── */}
        <pixiContainer layout={{ width, height: TRANSPORT_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, gap: 8 }}>
          <pixiGraphics draw={drawTransport} layout={{ position: 'absolute', width, height: TRANSPORT_H }} />

          <PixiLabel text="SUNVOX" size="sm" weight="bold" color="accent" />

          {moduleId !== undefined && (
            <PixiLabel text={`MOD:${moduleId}`} size="xs" color="textMuted" />
          )}

          <PixiLabel text={`CH ${(channelIndex + 1).toString().padStart(2, '0')}`} size="xs" color="textSecondary" />

          {isPlaying && (
            <PixiLabel
              text={`ROW ${(displayRow).toString(16).toUpperCase().padStart(2, '0')} / ${patternLength.toString(16).toUpperCase().padStart(2, '0')} @ ${bpm} BPM`}
              size="xs"
              color="textMuted"
            />
          )}

          <pixiContainer layout={{ flex: 1 }} />

          <PixiButton label="CLEAR" variant="ghost" size="sm" color="red" onClick={handleClear} />
        </pixiContainer>

        {/* ── Column header bar ─────────────────────────────────────────── */}
        <pixiContainer layout={{ width, height: HEADER_H }}>
          <pixiGraphics draw={drawHeader} layout={{ position: 'absolute', width, height: HEADER_H }} />
          {headerLabels.map((hl, i) => (
            <pixiBitmapText
              key={`hdr-${i}`}
              text={hl.text}
              style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
              tint={hl.color}
              x={hl.x}
              y={hl.y}
            />
          ))}
        </pixiContainer>

        {/* ── Pattern grid ──────────────────────────────────────────────── */}
        <pixiContainer layout={{ width, height: gridHeight }}>
          <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height: gridHeight }} />

          {cellLabels.map((label, i) => (
            <pixiBitmapText
              key={`cell-${i}`}
              text={label.text}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
              tint={label.color}
              x={label.x}
              y={label.y}
            />
          ))}
        </pixiContainer>

      </pixiContainer>
    </pixiContainer>
  );
};
