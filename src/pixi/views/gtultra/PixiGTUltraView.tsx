/**
 * PixiGTUltraView — GoatTracker Ultra editor in WebGL/Pixi.
 *
 * AHX-style layout (matching DOM GTUltraView):
 * ┌──────────────────────────────────────────────┐
 * │ Toolbar (song info, octave, step, REC/JAM)   │  32px
 * ├──────────────────────────────────────────────┤
 * │ PixiGTOrderList (per-channel order lists)     │  ORDER_H
 * ├──────────────────────────────────────────────┤
 * │ PixiGTPatternGrid (fills remaining)           │  flex
 * └──────────────────────────────────────────────┘
 *
 * Instruments are in the standard DEViLBOX instrument panel (right sidebar)
 * via GTUltraControls in the SynthTypeDispatcher. No custom sidebar needed.
 */

import React, { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { usePixiTheme } from '@/pixi/theme';
import { PixiGTPatternGrid } from './PixiGTPatternGrid';
import { PixiGTOrderList } from './PixiGTOrderList';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { useGTKeyboardHandler } from '@/components/gtultra/GTKeyboardHandler';
import { useGTUltraEngineInit } from '@/engine/gtultra/useGTUltraEngineInit';

const TOOLBAR_H = 32;
const ORDER_H = 160;

const GT_BG        = 0x0d0d0d;
const GT_TOOLBAR   = 0x1a1a1a;
const GT_ACCENT    = 0xe94560;
const GT_GREEN     = 0x2a9d8f;
const GT_SEP       = 0x222222;
const GT_TEXT_DIM  = 0x555555;

interface Props {
  width: number;
  height: number;
}

export const PixiGTUltraView: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();

  useGTKeyboardHandler(true);
  useGTUltraEngineInit();

  const songName = useGTUltraStore((s) => s.songName);
  const songAuthor = useGTUltraStore((s) => s.songAuthor);
  const tempo = useGTUltraStore((s) => s.tempo);
  const sidModel = useGTUltraStore((s) => s.sidModel);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const engine = useGTUltraStore((s) => s.engine);
  const currentOctave = useGTUltraStore((s) => s.currentOctave);
  const editStep = useGTUltraStore((s) => s.editStep);
  const recordMode = useGTUltraStore((s) => s.recordMode);
  const jamMode = useGTUltraStore((s) => s.jamMode);

  const patternHeight = height - TOOLBAR_H - ORDER_H;

  const infoText = useMemo(() => {
    const pos = playbackPos.position.toString(16).toUpperCase().padStart(2, '0');
    const row = playbackPos.row.toString(16).toUpperCase().padStart(2, '0');
    const sid = sidModel === 0 ? '6581' : '8580';
    const ch = sidCount * 3;
    return `Pos:${pos} Row:${row} | ${sid} ${ch}ch | Tempo:${tempo}`;
  }, [playbackPos, sidModel, sidCount, tempo]);

  const toggleFollow = useCallback(() => {
    useGTUltraStore.getState().setFollowPlay(!followPlay);
  }, [followPlay]);

  const toggleRecord = useCallback(() => {
    useGTUltraStore.getState().setRecordMode(!recordMode);
  }, [recordMode]);

  const toggleJam = useCallback(() => {
    useGTUltraStore.getState().setJamMode(!jamMode);
  }, [jamMode]);

  const cycleOctave = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(7, currentOctave + delta));
    useGTUltraStore.getState().setCurrentOctave(next);
  }, [currentOctave]);

  const cycleStep = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(16, editStep + delta));
    useGTUltraStore.getState().setEditStep(next);
  }, [editStep]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: GT_BG });
  }, [width, height]);

  const drawToolbar = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, TOOLBAR_H).fill({ color: GT_TOOLBAR });
    g.rect(0, TOOLBAR_H - 1, width, 1).fill({ color: GT_SEP });
  }, [width]);

  const ready = !!engine;

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />

      {/* Initializing overlay */}
      <pixiContainer
        alpha={ready ? 0 : 1}
        renderable={!ready}
        layout={{ position: 'absolute', width, height, alignItems: 'center', justifyContent: 'center' }}
      >
        <pixiBitmapText
          text="GoatTracker Ultra — initializing..."
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />
      </pixiContainer>

      {/* ─── Toolbar ─── */}
      <pixiContainer
        alpha={ready ? 1 : 0}
        renderable={ready}
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

        <pixiBitmapText
          text={songName || 'Untitled'}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={GT_ACCENT}
        />

        <pixiBitmapText
          text={songAuthor ? `by ${songAuthor}` : ''}
          alpha={songAuthor ? 1 : 0}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={GT_TEXT_DIM}
        />

        {/* Octave +/- */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => cycleOctave(-1)}>
          <pixiBitmapText eventMode="none" text="-" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={GT_TEXT_DIM} />
        </pixiContainer>
        <pixiBitmapText text={`Oct:${currentOctave}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.textSecondary.color} />
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => cycleOctave(1)}>
          <pixiBitmapText eventMode="none" text="+" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={GT_TEXT_DIM} />
        </pixiContainer>

        {/* Edit step +/- */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => cycleStep(-1)}>
          <pixiBitmapText eventMode="none" text="-" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={GT_TEXT_DIM} />
        </pixiContainer>
        <pixiBitmapText text={`Stp:${editStep}`} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={theme.textSecondary.color} />
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={() => cycleStep(1)}>
          <pixiBitmapText eventMode="none" text="+" style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={GT_TEXT_DIM} />
        </pixiContainer>

        {/* Record / Jam */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleRecord}>
          <pixiBitmapText eventMode="none" text={recordMode ? '[REC]' : '[rec]'} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={recordMode ? 0xef4444 : GT_TEXT_DIM} />
        </pixiContainer>
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleJam}>
          <pixiBitmapText eventMode="none" text={jamMode ? '[JAM]' : '[jam]'} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={jamMode ? GT_GREEN : GT_TEXT_DIM} />
        </pixiContainer>

        <pixiContainer layout={{ flex: 1 }} />

        {/* Follow */}
        <pixiContainer eventMode="static" cursor="pointer" onPointerUp={toggleFollow}>
          <pixiBitmapText
            eventMode="none"
            text={followPlay ? '[FOLLOW]' : '[follow]'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={followPlay ? GT_GREEN : GT_TEXT_DIM}
          />
        </pixiContainer>

        <pixiBitmapText text={infoText} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }} tint={GT_TEXT_DIM} />
      </pixiContainer>

      {/* ─── Order List (AHX-style position editor) ─── */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ width, height: ORDER_H }}>
        <PixiGTOrderList width={width} height={ORDER_H} />
      </pixiContainer>

      {/* ─── Pattern Grid (fills remaining space) ─── */}
      <pixiContainer alpha={ready ? 1 : 0} renderable={ready} layout={{ width, flex: 1 }}>
        <PixiGTPatternGrid
          width={Math.max(100, width)}
          height={Math.max(100, patternHeight)}
        />
      </pixiContainer>
    </pixiContainer>
  );
};
