/**
 * PixiTFMXPatternEditor — Pixi/GL rendering of a single TFMX pattern's command stream.
 *
 * Displays decoded TFMX commands: raw hex, note, macro, wait, detune, effect description.
 * Pure Pixi rendering, no DOM overlays.
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { TFMXNativeData } from '@/types/tfmxNative';
import { tfmxNoteToString, tfmxCommandEffectString } from '@/components/tfmx/tfmxAdapter';

const ROW_HEIGHT     = 18;
const HEADER_HEIGHT  = 22;
const ROW_NUM_WIDTH  = 28;
const FONT_SIZE      = 11;
const TEXT_Y         = 3;

// Column widths (in pixels)
const RAW_WIDTH    = 76;    // "90 01 0600"
const NOTE_WIDTH   = 28;    // "C-3"
const MACRO_WIDTH  = 20;    // "01"
const WAIT_WIDTH   = 20;    // "06"
const DETUNE_WIDTH = 20;    // "00"

// Palette
const TFMX_BG          = 0x080810;
const TFMX_HEADER_BG   = 0x101018;
const TFMX_ROW_EVEN    = 0x0c0c16;
const TFMX_ROW_ODD     = 0x0a0a12;
const TFMX_HIGHLIGHT   = 0x302010;
const TFMX_BORDER      = 0x2a2a33;
const TFMX_ROW_NUM     = 0x606060;
const TFMX_RAW         = 0x808080;
const TFMX_NOTE        = 0xe0c060;
const TFMX_MACRO       = 0x60e060;
const TFMX_WAIT        = 0x60c0e0;
const TFMX_DETUNE      = 0xc080e0;
const TFMX_EFFECT      = 0xa0a0a0;
const TFMX_DIM         = 0x404040;
const TFMX_HEADER_TEXT = 0x707070;

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

interface Props {
  width: number;
  height: number;
  native: TFMXNativeData;
  patternIndex: number;
  currentRow?: number;
  isPlaying?: boolean;
}

export const PixiTFMXPatternEditor: React.FC<Props> = ({
  width, height, native, patternIndex, currentRow, isPlaying,
}) => {
  const commands = useMemo(() => {
    if (patternIndex < 0 || patternIndex >= native.patterns.length) return [];
    return native.patterns[patternIndex];
  }, [native.patterns, patternIndex]);

  const visibleRows = Math.max(1, Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT));
  const [scrollOffset, setScrollOffset] = useState(0);

  // Auto-scroll during playback
  useEffect(() => {
    if (isPlaying && currentRow !== undefined) {
      setScrollOffset(prev => {
        if (currentRow < prev) return currentRow;
        if (currentRow >= prev + visibleRows) return currentRow - visibleRows + 1;
        return prev;
      });
    }
  }, [currentRow, isPlaying, visibleRows]);

  // Column X positions
  const colX = useMemo(() => {
    const x0 = ROW_NUM_WIDTH;
    return {
      raw:    x0,
      note:   x0 + RAW_WIDTH,
      macro:  x0 + RAW_WIDTH + NOTE_WIDTH,
      wait:   x0 + RAW_WIDTH + NOTE_WIDTH + MACRO_WIDTH,
      detune: x0 + RAW_WIDTH + NOTE_WIDTH + MACRO_WIDTH + WAIT_WIDTH,
      effect: x0 + RAW_WIDTH + NOTE_WIDTH + MACRO_WIDTH + WAIT_WIDTH + DETUNE_WIDTH,
    };
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: TFMX_BG });
  }, [width, height]);

  const drawHeader = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: TFMX_HEADER_BG });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: TFMX_BORDER });
  }, [width]);

  const drawRows = useCallback((g: GraphicsType) => {
    g.clear();
    for (let i = 0; i < visibleRows; i++) {
      const dataIdx = scrollOffset + i;
      if (dataIdx >= commands.length) break;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      const isActive = isPlaying && dataIdx === currentRow;

      g.rect(0, y, width, ROW_HEIGHT).fill({
        color: isActive ? TFMX_HIGHLIGHT : (i % 2 === 0 ? TFMX_ROW_EVEN : TFMX_ROW_ODD),
      });
    }
  }, [scrollOffset, visibleRows, commands.length, currentRow, isPlaying, width]);

  // Header labels
  const headerElements = useMemo(() => [
    <pixiBitmapText key="h-row" x={4} y={TEXT_Y} text="Row"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-raw" x={colX.raw + 4} y={TEXT_Y} text="Raw Bytes"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-note" x={colX.note + 2} y={TEXT_Y} text="Note"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-mac" x={colX.macro + 2} y={TEXT_Y} text="Mc"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-wt" x={colX.wait + 2} y={TEXT_Y} text="Wt"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-dt" x={colX.detune + 2} y={TEXT_Y} text="Dt"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
    <pixiBitmapText key="h-fx" x={colX.effect + 2} y={TEXT_Y} text="Effect"
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_HEADER_TEXT} />,
  ], [colX]);

  // Row text
  const rowTexts = useMemo(() => {
    const elements: React.ReactElement[] = [];
    for (let i = 0; i < visibleRows; i++) {
      const dataIdx = scrollOffset + i;
      if (dataIdx >= commands.length) break;
      const cmd = commands[dataIdx];
      const y = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;
      const key = `r${dataIdx}`;

      // Row number
      elements.push(
        <pixiBitmapText key={`${key}-n`} x={4} y={y}
          text={hex2(dataIdx)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_ROW_NUM} />
      );

      // Raw bytes
      const rawStr = `${hex2(cmd.byte0)} ${hex2(cmd.byte1)} ${hex2(cmd.byte2)}${hex2(cmd.byte3)}`;
      elements.push(
        <pixiBitmapText key={`${key}-raw`} x={colX.raw + 4} y={y}
          text={rawStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_RAW} />
      );

      // Note
      const noteStr = cmd.note !== undefined ? tfmxNoteToString(cmd.note) : '---';
      elements.push(
        <pixiBitmapText key={`${key}-note`} x={colX.note + 2} y={y}
          text={noteStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={cmd.note !== undefined ? TFMX_NOTE : TFMX_DIM} />
      );

      // Macro
      const macStr = cmd.macro !== undefined ? hex2(cmd.macro) : '--';
      elements.push(
        <pixiBitmapText key={`${key}-mac`} x={colX.macro + 2} y={y}
          text={macStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={cmd.macro !== undefined ? TFMX_MACRO : TFMX_DIM} />
      );

      // Wait
      const waitStr = cmd.wait !== undefined ? hex2(cmd.wait) : '--';
      elements.push(
        <pixiBitmapText key={`${key}-wt`} x={colX.wait + 2} y={y}
          text={waitStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={cmd.wait !== undefined ? TFMX_WAIT : TFMX_DIM} />
      );

      // Detune
      const dtStr = cmd.detune !== undefined ? hex2(cmd.detune) : '--';
      elements.push(
        <pixiBitmapText key={`${key}-dt`} x={colX.detune + 2} y={y}
          text={dtStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={cmd.detune !== undefined ? TFMX_DETUNE : TFMX_DIM} />
      );

      // Effect description
      const fxStr = tfmxCommandEffectString(cmd);
      elements.push(
        <pixiBitmapText key={`${key}-fx`} x={colX.effect + 2} y={y}
          text={fxStr}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_EFFECT} />
      );
    }
    return elements;
  }, [scrollOffset, visibleRows, commands, colX]);

  // Empty state
  if (commands.length === 0) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text={`Pattern ${patternIndex} is empty`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={TFMX_DIM}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics draw={drawHeader} />
      <pixiGraphics draw={drawRows} />
      {headerElements}
      {rowTexts}
    </pixiContainer>
  );
};
