/**
 * PixiJamCrackerView — JamCracker Pro pattern viewer (pure Pixi).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, position info)           │
 * ├──────────────────────────────────────────────────┤
 * │ Song Order List (~96px)                          │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Viewer (4 channels × 8 columns, fills)  │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useState, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { JamCrackerEngine } from '@engine/jamcracker/JamCrackerEngine';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';

const TOOLBAR_H = 32;
const ORDER_H = 96;
const ROW_H = 16;
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const JC_ACCENT = 0x88ccff;
const JC_SEP = 0x555555;

function noteStr(period: number): string {
  if (!period) return '---';
  if (period < 1 || period > 36) return '???';
  const n = period - 1;
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) + 1);
}

function hexByte(val: number): string {
  return val ? val.toString(16).toUpperCase().padStart(2, '0') : '--';
}

interface JCSongInfo {
  songLen: number;
  numPats: number;
  numInst: number;
  entries: number[];
}

interface JCPatternRow {
  period: number;
  instr: number;
  speed: number;
  arpeggio: number;
  vibrato: number;
  phase: number;
  volume: number;
  porta: number;
}

interface JCPatternData {
  numRows: number;
  rows: JCPatternRow[][];
}

interface Props {
  width: number;
  height: number;
}

export const PixiJamCrackerView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const jamCrackerFileData = useFormatStore(s => s.jamCrackerFileData);
  const currentPos = useTrackerStore(s => s.currentPositionIndex);
  const currentRow = useTransportStore(s => s.currentRow);
  const speed = useTransportStore(s => s.speed);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const recordMode = useEditorStore(s => s.recordMode);

  const [songInfo, setSongInfo] = useState<JCSongInfo | null>(null);
  const [patternData, setPatternData] = useState<JCPatternData | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const editPos = 0; // TODO: position selection UI
  const activePos = isPlaying ? currentPos : editPos;

  // Fetch song structure
  useEffect(() => {
    if (!jamCrackerFileData) { setSongInfo(null); return; }
    if (!JamCrackerEngine.hasInstance()) return;
    JamCrackerEngine.getInstance().getSongStructure().then(setSongInfo);
  }, [jamCrackerFileData]);

  // Fetch pattern data when position changes
  useEffect(() => {
    if (!songInfo || !JamCrackerEngine.hasInstance()) return;
    const patIdx = songInfo.entries[activePos];
    if (patIdx == null) return;
    JamCrackerEngine.getInstance().getPatternData(patIdx).then(setPatternData);
  }, [songInfo, activePos]);

  // Auto-scroll to current row during playback
  const patternHeight = height - TOOLBAR_H - ORDER_H;
  const visibleRows = Math.floor(patternHeight / ROW_H);
  useEffect(() => {
    if (!isPlaying) return;
    const target = Math.max(0, currentRow - Math.floor(visibleRows / 2));
    setScrollOffset(target);
  }, [currentRow, isPlaying, visibleRows]);

  const handleExport = useCallback(async () => {
    if (!JamCrackerEngine.hasInstance()) return;
    const engine = JamCrackerEngine.getInstance();
    const data = await engine.save();
    if (!data) return;
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'song.jam';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Draw callbacks
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
  }, [width, height]);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_H - 1, width, 1);
    g.fill({ color: theme.border.color });
  }, [width]);

  const drawOrderBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, ORDER_H);
    g.fill({ color: theme.bg.color });
    g.rect(0, ORDER_H - 1, width, 1);
    g.fill({ color: theme.border.color });
  }, [width]);

  const drawPatternBg = useCallback((g: GraphicsType) => {
    g.clear();
    const nr = patternData?.numRows ?? 0;

    for (let vi = 0; vi < visibleRows && (scrollOffset + vi) < nr; vi++) {
      const rowIdx = scrollOffset + vi;
      const y = vi * ROW_H;
      // Alternating row background
      if (rowIdx % 8 === 0) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.bg.color });
      }
      // Current row highlight
      if (isPlaying && rowIdx === currentRow) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.accentSecondary.color });
      }
      // Record mode cursor highlight (non-playing)
      if (!isPlaying && recordMode && rowIdx === scrollOffset + Math.floor(visibleRows / 2)) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.error.color });
      }
    }
  }, [width, height, patternData, scrollOffset, visibleRows, currentRow, isPlaying, recordMode]);

  // No module loaded
  if (!jamCrackerFileData) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text="No JamCracker module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const numRows = patternData?.numRows ?? 0;
  const rows = patternData?.rows ?? [];
  const patIdx = songInfo ? songInfo.entries[activePos] ?? -1 : -1;

  // Build pattern text lines
  const patternLines: string[] = [];
  const lineColors: number[] = [];
  for (let vi = 0; vi < visibleRows && (scrollOffset + vi) < numRows; vi++) {
    const rowIdx = scrollOffset + vi;
    const rowNum = rowIdx.toString(16).toUpperCase().padStart(2, '0');
    let line = `${rowNum} `;
    for (let ch = 0; ch < 4; ch++) {
      const cell = rows[ch]?.[rowIdx];
      if (cell) {
        line += `${noteStr(cell.period)} ${hexByte(cell.instr)} ${hexByte(cell.speed)} ${hexByte(cell.arpeggio)} ${hexByte(cell.vibrato)} ${hexByte(cell.phase)} ${hexByte(cell.volume)} ${hexByte(cell.porta)}`;
      } else {
        line += '--- -- -- -- -- -- -- --';
      }
      if (ch < 3) line += ' | ';
    }
    patternLines.push(line);
    lineColors.push(
      isPlaying && rowIdx === currentRow ? theme.currentRowText.color :
      rowIdx % 8 === 0 ? 0xaaaacc : 0x888888
    );
  }

  // Build order list text
  const orderEntries = songInfo?.entries ?? [];
  const orderText = orderEntries.map((e, i) =>
    i === activePos ? `[${e.toString(16).toUpperCase().padStart(2, '0')}]` :
    ` ${e.toString(16).toUpperCase().padStart(2, '0')} `
  ).join(' ');

  const toolbarInfo = [
    `Speed: ${speed}`,
    songInfo ? `Pat: ${songInfo.numPats}` : '',
    songInfo ? `Inst: ${songInfo.numInst}` : '',
    `Pos: ${activePos}/${orderEntries.length}`,
    patIdx >= 0 ? `#${patIdx.toString(16).toUpperCase().padStart(2, '0')}` : '',
    numRows > 0 ? `Rows: ${numRows}` : '',
  ].filter(Boolean).join('  |  ');

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Toolbar */}
      <pixiContainer
        layout={{ width, height: TOOLBAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 6 }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_H }} />
        <pixiBitmapText
          text="JAM"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={JC_ACCENT}
        />
        <pixiBitmapText text="|" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={JC_SEP} />
        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />
        <pixiContainer layout={{ flex: 1, height: TOOLBAR_H }} />
        <PixiButton label="JAM↓" variant="ft2" size="sm" color="green" onClick={handleExport} />
      </pixiContainer>

      {/* Order List */}
      <pixiContainer layout={{ width, height: ORDER_H, paddingLeft: 8, paddingTop: 4 }}>
        <pixiGraphics draw={drawOrderBg} layout={{ position: 'absolute', width, height: ORDER_H }} />
        <pixiBitmapText
          text="Song Order:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={JC_ACCENT}
        />
        <pixiBitmapText
          text={orderText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff, wordWrap: true, wordWrapWidth: width - 16 }}
          tint={theme.textSecondary.color}
          layout={{ marginTop: 16 }}
        />
      </pixiContainer>

      {/* Pattern Viewer */}
      <pixiContainer layout={{ flex: 1, width }}>
        <pixiGraphics draw={drawPatternBg} layout={{ position: 'absolute', width, height: patternHeight }} />
        {patternLines.map((line, i) => (
          <pixiBitmapText
            key={i}
            text={line}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={lineColors[i]}
            layout={{ marginLeft: 4, height: ROW_H }}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
