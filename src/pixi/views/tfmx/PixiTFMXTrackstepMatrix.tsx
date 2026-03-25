/**
 * PixiTFMXTrackstepMatrix — Pixi/GL rendering of the TFMX trackstep matrix.
 *
 * Pure Pixi rendering (no DOM overlays). Consumes TFMXNativeData from the store.
 * Clicking a voice cell selects that pattern in the pattern editor pane.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { TFMXNativeData } from '@/types/tfmxNative';
import { effeCommandToString } from '@/components/tfmx/tfmxAdapter';

const ROW_HEIGHT    = 18;
const STEP_COL_W    = 32;
const VOICE_COL_W   = 72;
const HEADER_HEIGHT = 20;
const FONT_SIZE     = 11;
const TEXT_Y        = 3;

// TFMX Amiga copper-bar palette
const TFMX_BG          = 0x0a0a12;
const TFMX_HEADER_BG   = 0x111118;
const TFMX_HIGHLIGHT   = 0x442200;
const TFMX_BORDER      = 0x333333;
const TFMX_DIM         = 0x606060;
const TFMX_TEXT         = 0xe0a050;
const TFMX_SELECTED    = 0xffd060;
const TFMX_HOLD        = 0x707050;
const TFMX_STOP        = 0x505050;
const TFMX_EFFE        = 0xe08040;
const TFMX_EFFE_BG     = 0x301808;
const TFMX_STEP_NUM    = 0x808080;

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

interface Props {
  width: number;
  height: number;
  native: TFMXNativeData;
  activeStep: number;
  selectedPattern: number;
  onSelectPattern: (patIdx: number) => void;
  onStepChange?: (stepIdx: number) => void;
}

export const PixiTFMXTrackstepMatrix: React.FC<Props> = ({
  width, height, native, activeStep, selectedPattern,
  onSelectPattern, onStepChange,
}) => {
  const steps = native.tracksteps;
  const numVoices = native.numVoices;
  const visibleRows = Math.max(1, Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT));
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<ContainerType>(null);

  // Auto-scroll to keep active step visible
  useEffect(() => {
    setScrollOffset(prev => {
      if (activeStep < prev) return activeStep;
      if (activeStep >= prev + visibleRows) return activeStep - visibleRows + 1;
      return prev;
    });
  }, [activeStep, visibleRows]);

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
      if (dataIdx >= steps.length) break;

      const step = steps[dataIdx];
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      const isActive = dataIdx === activeStep;

      // Row background
      if (isActive) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: TFMX_HIGHLIGHT });
      }

      if (step.isEFFE) {
        g.rect(STEP_COL_W, y + 1, width - STEP_COL_W, ROW_HEIGHT - 2).fill({ color: TFMX_EFFE_BG });
      }

      // Column separators
      for (let v = 0; v <= numVoices; v++) {
        const x = STEP_COL_W + v * VOICE_COL_W;
        g.rect(x, y, 1, ROW_HEIGHT).fill({ color: 0x1a1a22 });
      }
    }
  }, [scrollOffset, visibleRows, steps, activeStep, numVoices, width]);

  // Render text as bitmap text children
  const textElements = useMemo(() => {
    const elements: React.ReactElement[] = [];
    for (let i = 0; i < visibleRows; i++) {
      const dataIdx = scrollOffset + i;
      if (dataIdx >= steps.length) break;
      const step = steps[dataIdx];
      const y = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;

      // Step number
      elements.push(
        <pixiBitmapText
          key={`step-${dataIdx}`}
          x={4} y={y}
          text={hex2(step.stepIndex)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={TFMX_STEP_NUM}
        />
      );

      if (step.isEFFE) {
        elements.push(
          <pixiBitmapText
            key={`effe-${dataIdx}`}
            x={STEP_COL_W + 4} y={y}
            text={`EFFE: ${effeCommandToString(step.effeCommand ?? 0, step.effeParam ?? 0)}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
            tint={TFMX_EFFE}
          />
        );
      } else {
        for (let v = 0; v < step.voices.length; v++) {
          const voice = step.voices[v];
          const vx = STEP_COL_W + v * VOICE_COL_W + 4;
          let text: string;
          let tint: number;

          if (voice.isStop) {
            text = '  ---  '; tint = TFMX_STOP;
          } else if (voice.isHold) {
            text = ' HOLD  '; tint = TFMX_HOLD;
          } else {
            const trans = voice.transpose;
            const sign = trans >= 0 ? '+' : '-';
            text = `P${voice.patternNum.toString().padStart(2, '0')}:${sign}${hex2(Math.abs(trans))}`;
            tint = voice.patternNum === selectedPattern ? TFMX_SELECTED : TFMX_TEXT;
          }

          elements.push(
            <pixiBitmapText
              key={`v-${dataIdx}-${v}`}
              x={vx} y={y}
              text={text}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
              tint={tint}
            />
          );
        }
      }
    }
    return elements;
  }, [scrollOffset, visibleRows, steps, selectedPattern, numVoices]);

  // Header text
  const headerTexts = useMemo(() => {
    const els: React.ReactElement[] = [
      <pixiBitmapText key="hdr-step" x={4} y={TEXT_Y} text="Step"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_DIM} />,
    ];
    for (let v = 0; v < numVoices; v++) {
      els.push(
        <pixiBitmapText key={`hdr-v${v}`} x={STEP_COL_W + v * VOICE_COL_W + 4} y={TEXT_Y}
          text={`Voice ${v}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={TFMX_DIM} />
      );
    }
    return els;
  }, [numVoices]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(containerRef.current!);
    const row = Math.floor((local.y - HEADER_HEIGHT) / ROW_HEIGHT);
    const dataIdx = scrollOffset + row;
    if (dataIdx < 0 || dataIdx >= steps.length) return;

    const step = steps[dataIdx];
    onStepChange?.(dataIdx);

    if (step.isEFFE) return;

    const vx = local.x - STEP_COL_W;
    if (vx < 0) return;
    const voiceIdx = Math.floor(vx / VOICE_COL_W);
    if (voiceIdx >= 0 && voiceIdx < step.voices.length) {
      const voice = step.voices[voiceIdx];
      if (voice.patternNum >= 0) {
        onSelectPattern(voice.patternNum);
      }
    }
  }, [scrollOffset, steps, onSelectPattern, onStepChange]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiGraphics draw={drawHeader} />
      <pixiGraphics draw={drawRows} />
      {headerTexts}
      {textElements}
    </pixiContainer>
  );
};
