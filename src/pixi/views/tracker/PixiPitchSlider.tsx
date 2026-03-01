/**
 * PixiPitchSlider — Technics SL-1200 style vertical pitch fader rendered in Pixi.
 *
 * Pixel-perfect port of src/components/transport/DJPitchSlider.tsx.
 * - Thin 3px center groove
 * - Rectangular handle with three horizontal ribs
 * - Scale marks on left side (major + minor ticks, labels)
 * - Amber highlight for 0 mark and handle when dragging
 * - Range: -16 to +16 semitones
 * - Double-click or right-click resets to 0
 * - Shift held during drag: fine mode (10x slower)
 * - Syncs from useTransportStore when not dragging
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Container as ContainerType, FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { getPatternScheduler } from '@engine/PatternScheduler';
import { useTransportStore } from '@stores/useTransportStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_PITCH = -16;
const MAX_PITCH = 16;
const PITCH_RANGE = 32; // MAX_PITCH - MIN_PITCH
const HANDLE_H = 24;
const EDGE_PAD = 4;
const AMBER = 0xfbbf24;
const DOUBLE_CLICK_MS = 300;

// Scale marks — same order as DOM version (top = +16, bottom = -16)
const SCALE_MARKS: { label: string; pitch: number; major: boolean }[] = [
  { label: '+16', pitch: 16,  major: true  },
  { label: '',    pitch: 12,  major: false },
  { label: '+8',  pitch: 8,   major: true  },
  { label: '',    pitch: 6,   major: false },
  { label: '+4',  pitch: 4,   major: true  },
  { label: '',    pitch: 2,   major: false },
  { label: '0',   pitch: 0,   major: true  },
  { label: '',    pitch: -2,  major: false },
  { label: '-4',  pitch: -4,  major: true  },
  { label: '',    pitch: -6,  major: false },
  { label: '-8',  pitch: -8,  major: true  },
  { label: '',    pitch: -12, major: false },
  { label: '-16', pitch: -16, major: true  },
];

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Return the label area width (left column) and housing width (right column). */
function computeLayout(totalWidth: number) {
  const scaleW = 14;   // px for scale marks + labels
  const housingW = totalWidth - scaleW;
  return { scaleW, housingW };
}

/** Given current pitch and track usable height, compute handle top position. */
function pitchToHandleTop(pitch: number, trackH: number): number {
  const frac = (MAX_PITCH - pitch) / PITCH_RANGE;
  return EDGE_PAD + frac * (trackH - HANDLE_H - EDGE_PAD * 2);
}

/** Given a delta-Y from drag start and track usable height, compute new pitch. */
function deltaYToPitch(startPitch: number, dy: number, usable: number, fine: boolean): number {
  const scale = fine ? 0.1 : 1;
  return startPitch - (dy / usable) * PITCH_RANGE * scale;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PixiPitchSliderProps {
  width: number;   // total component width (e.g., 32)
  height: number;  // total component height
}

export const PixiPitchSlider: React.FC<PixiPitchSliderProps> = ({ width, height }) => {
  const theme = usePixiTheme();

  // Transport store
  const globalPitch = useTransportStore(s => s.globalPitch);
  const setGlobalPitch = useTransportStore(s => s.setGlobalPitch);

  // Local state
  const [pitch, setPitch] = useState(globalPitch);
  const [isDragging, setIsDragging] = useState(false);

  // Refs to avoid stale closures
  const pitchRef = useRef(pitch);
  const isDraggingRef = useRef(isDragging);
  useEffect(() => { pitchRef.current = pitch; }, [pitch]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);

  // Sync from global store when not dragging
  useEffect(() => {
    if (!isDragging) {
      setPitch(globalPitch);
    }
  }, [globalPitch, isDragging]);

  // Container ref for stage access (drag pattern from PixiSlider)
  const containerRef = useRef<ContainerType>(null);

  // Double-click detection
  const lastClickTime = useRef(0);

  // ─── Apply pitch ────────────────────────────────────────────────────────

  const applyPitch = useCallback((raw: number) => {
    const clamped = clamp(raw, MIN_PITCH, MAX_PITCH);
    setPitch(clamped);
    setGlobalPitch(clamped);
    getPatternScheduler().setGlobalPitchOffset(clamped);
  }, [setGlobalPitch]);

  const resetPitch = useCallback(() => {
    applyPitch(0);
  }, [applyPitch]);

  // ─── Layout values ──────────────────────────────────────────────────────

  const { scaleW, housingW } = computeLayout(width);

  // Reserve space for PITCH label + value readout at top
  const LABEL_H = 10;   // "PITCH" bitmap text
  const VALUE_H = 12;   // value readout
  const HEADER_H = LABEL_H + VALUE_H + 4; // gap between label, value, and fader

  // Fader track area height = remaining space
  const trackH = height - HEADER_H;

  // Handle vertical position
  const handleTop = HEADER_H + pitchToHandleTop(pitch, trackH);

  // Display helpers
  const atCenter = Math.abs(pitch) < 0.05;
  const displayValue = pitch > 0 ? `+${pitch.toFixed(1)}` : pitch.toFixed(1);

  // ─── Draw scale marks (left side) ─────────────────────────────────────

  const drawScale = useCallback((g: GraphicsType) => {
    g.clear();

    const trackUsable = trackH - HANDLE_H - EDGE_PAD * 2;

    for (const mark of SCALE_MARKS) {
      // y position of this tick within the track area (below header)
      const frac = (MAX_PITCH - mark.pitch) / PITCH_RANGE;
      const tickY = HEADER_H + EDGE_PAD + frac * trackUsable + HANDLE_H / 2;

      const isZero = mark.pitch === 0;
      const tickColor = isZero ? AMBER : theme.textMuted.color;
      const tickAlpha = isZero ? 0.5 : 0.3;
      const tickW = mark.major ? 6 : 4;

      // Tick line pointing right toward groove
      g.rect(scaleW - tickW, tickY - 0.5, tickW, 1);
      g.fill({ color: tickColor, alpha: tickAlpha });
    }
  }, [trackH, scaleW, theme]);

  // ─── Draw housing background + groove ─────────────────────────────────

  const drawHousing = useCallback((g: GraphicsType) => {
    g.clear();

    // Groove — 3px wide, centered in housing
    const grooveX = scaleW + housingW / 2 - 1.5;
    g.rect(grooveX, HEADER_H + EDGE_PAD, 3, trackH - EDGE_PAD * 2);
    g.fill({ color: 0x000000, alpha: 0.75 });
  }, [scaleW, housingW, trackH]);

  // ─── Draw handle ───────────────────────────────────────────────────────

  const drawHandle = useCallback((g: GraphicsType) => {
    g.clear();

    const handleX = scaleW + 2;
    const handleW = housingW - 4;
    const y = handleTop;

    // Handle body
    const bodyColor = isDragging
      ? 0x2a2010
      : 0x1e1b1b;
    const borderColor = isDragging ? AMBER : theme.border.color;
    const borderAlpha = isDragging ? 0.5 : 1;

    g.roundRect(handleX, y, handleW, HANDLE_H, 2);
    g.fill({ color: bodyColor });
    g.roundRect(handleX, y, handleW, HANDLE_H, 2);
    g.stroke({ color: borderColor, alpha: borderAlpha, width: 1 });

    // Top highlight inset line (simulate inset box-shadow)
    const highlightAlpha = isDragging ? 0.15 : 0.08;
    g.rect(handleX + 1, y + 1, handleW - 2, 1);
    g.fill({ color: isDragging ? AMBER : 0xffffff, alpha: highlightAlpha });

    // Ribs
    const ribColor = isDragging ? AMBER : 0xffffff;
    const topRibAlpha = isDragging ? 0.4 : 0.12;
    const midRibAlpha = isDragging ? 0.6 : 0.18;
    const botRibAlpha = isDragging ? 0.4 : 0.12;

    const ribInsetX = handleX + 4;
    const ribW = handleW - 8;

    // Top rib (5px from top of handle)
    g.rect(ribInsetX, y + 5, ribW, 1);
    g.fill({ color: ribColor, alpha: topRibAlpha });

    // Middle rib (center)
    g.rect(ribInsetX, y + HANDLE_H / 2 - 0.5, ribW, 1);
    g.fill({ color: ribColor, alpha: midRibAlpha });

    // Bottom rib (5px from bottom of handle)
    g.rect(ribInsetX, y + HANDLE_H - 5 - 1, ribW, 1);
    g.fill({ color: ribColor, alpha: botRibAlpha });
  }, [handleTop, isDragging, scaleW, housingW, theme]);

  // ─── Drag interaction ──────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();

    // Right-click resets
    if (e.button === 2) {
      resetPitch();
      return;
    }

    // Double-click resets
    const now = Date.now();
    if (now - lastClickTime.current < DOUBLE_CLICK_MS) {
      resetPitch();
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;

    setIsDragging(true);

    const startY = e.globalY;
    const startPitch = pitchRef.current;
    const usable = trackH - HANDLE_H - EDGE_PAD * 2;

    const stage = (containerRef.current as any)?.stage;
    if (!stage) return;

    const onMove = (ev: FederatedPointerEvent) => {
      const fine = ev.shiftKey;
      const dy = ev.globalY - startY;
      const newPitch = deltaYToPitch(startPitch, dy, usable, fine);
      applyPitch(newPitch);
    };

    const onUp = () => {
      setIsDragging(false);
      stage.off('pointermove', onMove);
      stage.off('pointerup', onUp);
      stage.off('pointerupoutside', onUp);
    };

    stage.on('pointermove', onMove);
    stage.on('pointerup', onUp);
    stage.on('pointerupoutside', onUp);
  }, [trackH, applyPitch, resetPitch]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <pixiContainer
      ref={containerRef}
      eventMode="static"
      cursor="ns-resize"
      onPointerDown={handlePointerDown}
      onRightClick={(e: FederatedPointerEvent) => { e.stopPropagation(); resetPitch(); }}
      layout={{ width, height, flexDirection: 'column', alignItems: 'center' }}
    >
      {/* PITCH label */}
      <pixiBitmapText
        text="PITCH"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ height: LABEL_H }}
      />

      {/* Value readout */}
      <pixiBitmapText
        text={displayValue}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={atCenter ? theme.textMuted.color : AMBER}
        layout={{ height: VALUE_H }}
      />

      {/* Scale marks */}
      <pixiGraphics
        draw={drawScale}
        layout={{ position: 'absolute', top: 0, left: 0, width, height }}
      />

      {/* Housing background + groove */}
      <pixiGraphics
        draw={drawHousing}
        layout={{ position: 'absolute', top: 0, left: 0, width, height }}
      />

      {/* Fader handle */}
      <pixiGraphics
        draw={drawHandle}
        layout={{ position: 'absolute', top: 0, left: 0, width, height }}
      />
    </pixiContainer>
  );
};
