/**
 * PixiTFMXView — Top-level TFMX Editor View (pure Pixi/GL).
 *
 * Two-pane layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (TFMX, song name, tempo, pattern info)   │
 * ├──────────────────────────────────────────────────┤
 * │ Trackstep Matrix (~160px)                        │
 * ├──────────────────────────────────────────────────┤
 * │ Pattern Editor (selected pattern from pool)      │
 * └──────────────────────────────────────────────────┘
 *
 * All data from useFormatStore.tfmxNative via tfmxAdapter (shared with DOM view).
 * No DOM overlays — pure Pixi rendering.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { PixiFormatPatternEditor } from '@/pixi/views/shared/PixiFormatPatternEditor';
import {
  tfmxPatternToChannels,
  tfmxTrackstepToChannels,
  TFMX_PATTERN_COLUMNS,
  TFMX_TRACKSTEP_COLUMNS,
} from '@/components/tfmx/tfmxAdapter';

const TOOLBAR_HEIGHT = 32;
const MATRIX_HEIGHT  = 160;

// TFMX Amiga palette
const TFMX_ACCENT = 0xe0a050;
const TFMX_SEP    = 0x555555;

interface Props {
  width: number;
  height: number;
}

export const PixiTFMXView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const native = useFormatStore(s => s.tfmxNative);
  const selectedPattern = useFormatStore(s => s.tfmxSelectedPattern);
  const setSelectedPattern = useFormatStore(s => s.setTFMXSelectedPattern);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);

  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // Build mapping: flattened pattern index → native trackstep index
  const flatToTrackstep = useMemo(() => {
    if (!native) return [];
    return native.tracksteps
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => !step.isEFFE);
  }, [native]);

  // Auto-follow playback
  useEffect(() => {
    if (!isPlaying || !native) return;
    const mapping = flatToTrackstep[currentPositionIndex];
    if (!mapping) return;

    setActiveStepIdx(mapping.idx);

    const step = mapping.step;
    if (!step.isEFFE) {
      for (const voice of step.voices) {
        if (voice.patternNum >= 0 && !voice.isHold && !voice.isStop) {
          setSelectedPattern(voice.patternNum);
          break;
        }
      }
    }
  }, [isPlaying, currentPositionIndex, native, flatToTrackstep, setSelectedPattern]);

  // Convert native data to FormatChannel[] via adapter
  const trackstepChannels = useMemo(() => {
    if (!native) return [];
    return tfmxTrackstepToChannels(native);
  }, [native]);

  const patternChannels = useMemo(() => {
    if (!native) return [];
    return tfmxPatternToChannels(native, selectedPattern);
  }, [native, selectedPattern]);

  const patternEditorHeight = height - TOOLBAR_HEIGHT - MATRIX_HEIGHT;

  const handleExport = useCallback(async () => {
    const song = getTrackerReplayer().getSong();
    if (!song) return;
    const { exportTFMX } = await import('@lib/export/TFMXExporter');
    const result = await exportTFMX(song);
    const url = URL.createObjectURL(result.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // ─── Draw callbacks ──────────────────────────────────────────────────────

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: theme.bg.color });
  }, [width, height]);

  const drawToolbarBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_HEIGHT).fill({ color: theme.bgSecondary.color });
    g.rect(0, TOOLBAR_HEIGHT - 1, width, 1).fill({ color: theme.border.color });
  }, [width]);

  const drawMatrixBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, MATRIX_HEIGHT - 1, width, 1).fill({ color: TFMX_SEP });
  }, [width]);

  // ── No module ────────────────────────────────────────────────────────────

  if (!native) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text="No TFMX module loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
        />
      </pixiContainer>
    );
  }

  const toolbarInfo = [
    native.songName,
    `Tempo: ${native.songTempos[native.activeSubsong]}`,
    `Pats: ${native.patterns.filter(p => p.length > 0).length}`,
    `Steps: ${native.tracksteps.length}`,
    `Pat: ${selectedPattern.toString().padStart(3, '0')}`,
  ].join('  |  ');

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Toolbar */}
      <pixiContainer
        layout={{
          width,
          height: TOOLBAR_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbarBg} layout={{ position: 'absolute', width, height: TOOLBAR_HEIGHT }} />

        <pixiBitmapText
          text="TFMX"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={TFMX_ACCENT}
        />

        <pixiBitmapText
          text="|"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={TFMX_SEP}
        />

        <pixiBitmapText
          text={toolbarInfo}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textSecondary.color}
        />

        <pixiContainer layout={{ flex: 1, height: TOOLBAR_HEIGHT }} />

        <PixiButton
          label="Export MDAT"
          variant="ft2"
          size="sm"
          color="green"
          onClick={handleExport}
        />
      </pixiContainer>

      {/* Trackstep Matrix */}
      <pixiContainer layout={{ width, height: MATRIX_HEIGHT }}>
        <PixiFormatPatternEditor
          width={width}
          height={MATRIX_HEIGHT}
          columns={TFMX_TRACKSTEP_COLUMNS}
          channels={trackstepChannels}
          currentRow={activeStepIdx}
          isPlaying={isPlaying}
        />
        <pixiGraphics draw={drawMatrixBorder} layout={{ position: 'absolute', width, height: MATRIX_HEIGHT }} />
      </pixiContainer>

      {/* Pattern Editor */}
      <pixiContainer layout={{ flex: 1, width, height: Math.max(100, patternEditorHeight) }}>
        <PixiFormatPatternEditor
          width={width}
          height={Math.max(100, patternEditorHeight)}
          columns={TFMX_PATTERN_COLUMNS}
          channels={patternChannels}
          currentRow={isPlaying ? currentRow : 0}
          isPlaying={isPlaying}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
