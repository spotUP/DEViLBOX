/**
 * PixiGTUltraView — Top-level GoatTracker Ultra editor in WebGL/Pixi.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────┐
 * │ Toolbar (song info, transport, SID config)       │
 * ├────────────────────────────┬─────────────────────┤
 * │                            │ Order List          │
 * │  Pattern Editor (MegaText) ├─────────────────────┤
 * │  3 or 6 channels           │ Instrument panel    │
 * │                            ├─────────────────────┤
 * │                            │ Table editor        │
 * └────────────────────────────┴─────────────────────┘
 */

import React, { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { PixiButton } from '@/pixi/components/PixiButton';
import { PixiGTPatternGrid } from './PixiGTPatternGrid';
import { PixiGTOrderList } from './PixiGTOrderList';
import { PixiGTInstrumentPanel } from './PixiGTInstrumentPanel';
import { PixiGTTableEditor } from './PixiGTTableEditor';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

const TOOLBAR_H = 32;
const SIDEBAR_W = 280;

// GoatTracker color palette
const GT_BG        = 0x1a1a2e;
const GT_TOOLBAR   = 0x0f3460;
const GT_ACCENT    = 0xe94560;
const GT_GREEN     = 0x2a9d8f;
const GT_SEP       = 0x333355;
const GT_TEXT_DIM  = 0x666688;

interface Props {
  width: number;
  height: number;
}

export const PixiGTUltraView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const playing = useGTUltraStore((s) => s.playing);
  const songName = useGTUltraStore((s) => s.songName);
  const songAuthor = useGTUltraStore((s) => s.songAuthor);
  const tempo = useGTUltraStore((s) => s.tempo);
  const sidModel = useGTUltraStore((s) => s.sidModel);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const engine = useGTUltraStore((s) => s.engine);

  const editorWidth = width - SIDEBAR_W;
  const editorHeight = height - TOOLBAR_H;
  const orderH = Math.floor(editorHeight * 0.25);
  const instrH = Math.floor(editorHeight * 0.35);
  const tableH = editorHeight - orderH - instrH;

  // Toolbar info
  const infoText = useMemo(() => {
    const pos = playbackPos.position.toString(16).toUpperCase().padStart(2, '0');
    const row = playbackPos.row.toString(16).toUpperCase().padStart(2, '0');
    const sid = sidModel === 0 ? '6581' : '8580';
    const ch = sidCount * 3;
    return `Pos:${pos} Row:${row}  |  ${sid} ${ch}ch  |  Tempo:${tempo}`;
  }, [playbackPos, sidModel, sidCount, tempo]);

  const togglePlay = useCallback(() => {
    if (!engine) return;
    if (playing) {
      engine.stop();
      useGTUltraStore.getState().setPlaying(false);
    } else {
      engine.play();
      useGTUltraStore.getState().setPlaying(true);
    }
  }, [engine, playing]);

  const toggleFollow = useCallback(() => {
    useGTUltraStore.getState().setFollowPlay(!followPlay);
  }, [followPlay]);

  // Draw callbacks
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: GT_BG });
  }, [width, height]);

  const drawToolbar = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H).fill({ color: GT_TOOLBAR });
    g.rect(0, TOOLBAR_H - 1, width, 1).fill({ color: GT_SEP });
  }, [width]);

  const drawSidebarSep = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(editorWidth - 1, 0, 1, editorHeight).fill({ color: GT_SEP });
  }, [editorWidth, editorHeight]);

  // No engine loaded state
  if (!engine) {
    return (
      <pixiContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
        <pixiBitmapText
          text="GoatTracker Ultra — initializing..."
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* ─── Toolbar ─── */}
      <pixiContainer
        layout={{
          width,
          height: TOOLBAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawToolbar} layout={{ position: 'absolute', width, height: TOOLBAR_H }} />

        {/* Play/Stop */}
        <PixiButton
          label={playing ? '■' : '▶'}
          variant="ft2"
          size="sm"
          color={playing ? 'red' : 'green'}
          onClick={togglePlay}
        />

        {/* Song name */}
        <pixiBitmapText
          text={songName || 'Untitled'}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={GT_ACCENT}
        />

        {songAuthor ? (
          <pixiBitmapText
            text={`by ${songAuthor}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={GT_TEXT_DIM}
          />
        ) : null}

        <pixiContainer layout={{ flex: 1 }} />

        {/* Follow */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleFollow}>
          <pixiBitmapText
            text={followPlay ? '[FOLLOW]' : '[follow]'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={followPlay ? GT_GREEN : GT_TEXT_DIM}
          />
        </pixiContainer>

        {/* Info */}
        <pixiBitmapText
          text={infoText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />
      </pixiContainer>

      {/* ─── Main area ─── */}
      <pixiContainer layout={{ flexDirection: 'row', flex: 1, width, height: editorHeight }}>
        {/* Pattern editor */}
        <PixiGTPatternGrid
          width={Math.max(100, editorWidth)}
          height={Math.max(100, editorHeight)}
        />

        {/* Sidebar separator */}
        <pixiGraphics draw={drawSidebarSep} layout={{ position: 'absolute', left: editorWidth, width: 1, height: editorHeight }} />

        {/* Sidebar */}
        <pixiContainer layout={{ width: SIDEBAR_W, flexDirection: 'column' }}>
          <PixiGTOrderList
            width={SIDEBAR_W}
            height={orderH}
          />
          <PixiGTInstrumentPanel
            width={SIDEBAR_W}
            height={instrH}
          />
          <PixiGTTableEditor
            width={SIDEBAR_W}
            height={tableH}
          />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};
