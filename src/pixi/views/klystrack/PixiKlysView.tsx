/**
 * PixiKlysView — Klystrack editor view (pure Pixi).
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (format, speed, channels, position info) │
 * ├──────────────────────────────────────────────────┤
 * │ Sequence Overview (~120px)                       │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Grid (fills remaining space)             │
 * └──────────────────────────────────────────────────┘
 */

import React, { useCallback, useState, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { exportAsKlystrack } from '@lib/export/KlysExporter';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';

const TOOLBAR_H = 32;
const SEQ_H = 120;
const ROW_H = 16;
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const KT_ACCENT = 0x88ffaa;
const KT_SEP = 0x555555;

function noteStr(note: number): string {
  if (note === 0 || note === 0xff) return '---';
  if (note === 97 || note === 0xfe) return '===';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + Math.floor(n / 12);
}

function hexByte(val: number, empty = 0xff): string {
  return val === empty ? '--' : val.toString(16).toUpperCase().padStart(2, '0');
}

function hexWord(val: number): string {
  return val === 0 ? '----' : val.toString(16).toUpperCase().padStart(4, '0');
}

function ctrlStr(ctrl: number): string {
  if (!ctrl) return '-';
  let s = '';
  if (ctrl & 1) s += 'L';
  if (ctrl & 2) s += 'S';
  if (ctrl & 4) s += 'V';
  return s || '-';
}

interface Props {
  width: number;
  height: number;
}

export const PixiKlysView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const nativeData = useFormatStore(s => s.klysNative);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const recordMode = useEditorStore(s => s.recordMode);

  const [scrollOffset, setScrollOffset] = useState(0);

  const activePosition = isPlaying ? currentPositionIndex : 0;

  const handleExport = useCallback(async () => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const result = await exportAsKlystrack(song);
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Resolve current pattern per channel from sequence
  const channelPatterns = useMemo(() => {
    if (!nativeData) return [];
    return nativeData.sequences.map(seq => {
      // Find last entry whose position <= activePosition
      let patIdx = -1;
      for (const entry of seq.entries) {
        if (entry.position <= activePosition) patIdx = entry.pattern;
      }
      return patIdx;
    });
  }, [nativeData, activePosition]);

  // Get pattern data for visible channels
  const patternHeight = height - TOOLBAR_H - SEQ_H;
  const visibleRows = Math.floor(patternHeight / ROW_H);

  // Auto-scroll during playback
  React.useEffect(() => {
    if (!isPlaying) return;
    const target = Math.max(0, currentRow - Math.floor(visibleRows / 2));
    setScrollOffset(target);
  }, [currentRow, isPlaying, visibleRows]);

  // Draw callbacks
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x000000 });
  }, [width, height]);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H);
    g.fill({ color: 0x111111 });
    g.rect(0, TOOLBAR_H - 1, width, 1);
    g.fill({ color: 0x333333 });
  }, [width]);

  const drawSeqBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, SEQ_H);
    g.fill({ color: 0x0a0a0a });
    g.rect(0, SEQ_H - 1, width, 1);
    g.fill({ color: 0x333333 });
  }, [width]);

  const drawPatternBg = useCallback((g: GraphicsType) => {
    g.clear();
    const maxSteps = nativeData?.patterns[channelPatterns[0]]?.numSteps ?? 0;
    for (let vi = 0; vi < visibleRows && (scrollOffset + vi) < maxSteps; vi++) {
      const rowIdx = scrollOffset + vi;
      if (rowIdx % 8 === 0) {
        g.rect(0, vi * ROW_H, width, ROW_H);
        g.fill({ color: 0x0c180c });
      }
      if (isPlaying && rowIdx === currentRow) {
        g.rect(0, vi * ROW_H, width, ROW_H);
        g.fill({ color: 0x224422 });
      }
      if (!isPlaying && recordMode && rowIdx === scrollOffset + Math.floor(visibleRows / 2)) {
        g.rect(0, vi * ROW_H, width, ROW_H);
        g.fill({ color: 0x331111 });
      }
    }
  }, [width, nativeData, channelPatterns, scrollOffset, visibleRows, currentRow, isPlaying, recordMode]);

  // No data
  if (!nativeData) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text="No Klystrack module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const numChannels = nativeData.channels;
  const maxSteps = nativeData.patterns[channelPatterns[0]]?.numSteps ?? 0;

  const toolbarInfo = [
    `Speed: ${nativeData.songSpeed}/${nativeData.songSpeed2}`,
    `Rate: ${nativeData.songRate}`,
    `CH: ${numChannels}`,
    `Len: ${nativeData.songLength}`,
    `Pat: ${nativeData.patterns.length}`,
    `Inst: ${nativeData.instruments.length}`,
    `Pos: ${activePosition}`,
  ].join('  |  ');

  // Build sequence overview text (per-channel: pattern assignments)
  const seqLines: string[] = [];
  for (let ch = 0; ch < Math.min(numChannels, 8); ch++) {
    const seq = nativeData.sequences[ch];
    if (!seq) continue;
    const entries = seq.entries.slice(0, 16).map((e) =>
      e.position === activePosition ? `[${e.pattern.toString(16).toUpperCase().padStart(2, '0')}]` :
      ` ${e.pattern.toString(16).toUpperCase().padStart(2, '0')} `
    ).join('');
    seqLines.push(`CH${ch}: ${entries}`);
  }

  // Build pattern lines
  const patternLines: string[] = [];
  const lineColors: number[] = [];
  for (let vi = 0; vi < visibleRows && (scrollOffset + vi) < maxSteps; vi++) {
    const rowIdx = scrollOffset + vi;
    const rowNum = rowIdx.toString(16).toUpperCase().padStart(2, '0');
    let line = `${rowNum} `;
    for (let ch = 0; ch < Math.min(numChannels, 4); ch++) {
      const pat = nativeData.patterns[channelPatterns[ch]];
      const step = pat?.steps[rowIdx];
      if (step) {
        line += `${noteStr(step.note)} ${hexByte(step.instrument)} ${ctrlStr(step.ctrl)} ${hexByte(step.volume, 0)} ${hexWord(step.command)}`;
      } else {
        line += '--- -- - -- ----';
      }
      if (ch < numChannels - 1 && ch < 3) line += ' | ';
    }
    patternLines.push(line);
    lineColors.push(
      isPlaying && rowIdx === currentRow ? 0xffffff :
      rowIdx % 8 === 0 ? 0xaaccaa : 0x888888
    );
  }

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Toolbar */}
      <pixiContainer
        layout={{ width, height: TOOLBAR_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 8, gap: 6 }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_H }} />
        <pixiBitmapText text="KT" style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }} tint={KT_ACCENT} />
        <pixiBitmapText text="|" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }} tint={KT_SEP} />
        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />
        <pixiContainer layout={{ flex: 1, height: TOOLBAR_H }} />
        <PixiButton label="KT↓" variant="ft2" size="sm" color="green" onClick={handleExport} />
      </pixiContainer>

      {/* Sequence Overview */}
      <pixiContainer layout={{ width, height: SEQ_H, paddingLeft: 8, paddingTop: 4, flexDirection: 'column' }}>
        <pixiGraphics draw={drawSeqBg} layout={{ position: 'absolute', width, height: SEQ_H }} />
        <pixiBitmapText
          text="Sequences:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={KT_ACCENT}
        />
        {seqLines.map((line, i) => (
          <pixiBitmapText
            key={i}
            text={line}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={theme.textSecondary.color}
          />
        ))}
      </pixiContainer>

      {/* Pattern Grid */}
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
