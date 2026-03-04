/**
 * SIDFilterTab — WebSID filter emulation parameter controls.
 *
 * Nine filter curve parameters (matching DeepSID), SID revision presets,
 * and a small filter curve preview drawn via Pixi Graphics.
 */

import React, { useState, useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiSlider, PixiSelect, PixiButton } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDFilterTabProps {
  width: number;
  height: number;
}

interface FilterParams {
  minimum: number;
  maximum: number;
  steepness: number;
  xOffset: number;
  kink: number;
  distortion: number;
  distOffset: number;
  distScale: number;
  distThreshold: number;
}

const DEFAULT_PARAMS: FilterParams = {
  minimum: 0.2,
  maximum: 0.8,
  steepness: 0.5,
  xOffset: 0.5,
  kink: 0.5,
  distortion: 0.0,
  distOffset: 0.5,
  distScale: 0.5,
  distThreshold: 0.5,
};

const R2_PARAMS: FilterParams = {
  minimum: 0.22, maximum: 0.82, steepness: 0.55,
  xOffset: 0.48, kink: 0.45, distortion: 0.15,
  distOffset: 0.50, distScale: 0.45, distThreshold: 0.50,
};

const R3_PARAMS: FilterParams = {
  minimum: 0.18, maximum: 0.78, steepness: 0.50,
  xOffset: 0.52, kink: 0.50, distortion: 0.0,
  distOffset: 0.50, distScale: 0.50, distThreshold: 0.50,
};

const R4_PARAMS: FilterParams = {
  minimum: 0.15, maximum: 0.75, steepness: 0.48,
  xOffset: 0.54, kink: 0.52, distortion: 0.0,
  distOffset: 0.50, distScale: 0.52, distThreshold: 0.48,
};

const REVISION_OPTIONS: SelectOption[] = [
  { value: 'r2', label: 'R2 (6581)' },
  { value: 'r3', label: 'R3 (8580)' },
  { value: 'r4', label: 'R4 (8580D)' },
];

const REVISION_MAP: Record<string, FilterParams> = {
  r2: R2_PARAMS,
  r3: R3_PARAMS,
  r4: R4_PARAMS,
};

type ParamKey = keyof FilterParams;
const PARAM_DEFS: { key: ParamKey; label: string }[] = [
  { key: 'minimum', label: 'Minimum' },
  { key: 'maximum', label: 'Maximum' },
  { key: 'steepness', label: 'Steepness' },
  { key: 'xOffset', label: 'X-Offset' },
  { key: 'kink', label: 'Kink' },
  { key: 'distortion', label: 'Distortion' },
  { key: 'distOffset', label: 'Dist. Offset' },
  { key: 'distScale', label: 'Dist. Scale' },
  { key: 'distThreshold', label: 'Dist. Thresh' },
];

const CURVE_H = 80;
const CURVE_PAD = 4;

export const SIDFilterTab: React.FC<SIDFilterTabProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const [params, setParams] = useState<FilterParams>({ ...DEFAULT_PARAMS });
  const [revision, setRevision] = useState('r2');

  const updateParam = useCallback((key: ParamKey, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleRevisionChange = useCallback((value: string) => {
    setRevision(value);
    const preset = REVISION_MAP[value];
    if (preset) setParams({ ...preset });
  }, []);

  const handleReset = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
  }, []);

  const curveW = width - 24;

  const drawCurve = useCallback((g: GraphicsType) => {
    g.clear();
    const w = curveW;
    const h = CURVE_H;

    // Background
    g.rect(0, 0, w, h);
    g.fill({ color: theme.bgTertiary.color, alpha: 0.6 });
    g.rect(0, 0, w, h);
    g.stroke({ color: theme.border.color, width: 1 });

    // Grid lines
    for (let i = 1; i < 4; i++) {
      const x = (w / 4) * i;
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
    }
    for (let i = 1; i < 3; i++) {
      const y = (h / 3) * i;
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
    }

    // Filter response curve based on params
    const { minimum, maximum, steepness, xOffset, kink } = params;
    const pad = CURVE_PAD;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const yMin = pad + plotH * (1 - minimum);
    const yMax = pad + plotH * (1 - maximum);
    const xCenter = pad + plotW * xOffset;
    const curveWidth = plotW * steepness * 0.8;
    const kinkOffset = (kink - 0.5) * plotH * 0.3;

    // Draw the filter curve as a simple shape
    g.moveTo(pad, yMin);
    g.bezierCurveTo(
      xCenter - curveWidth, yMin + kinkOffset,
      xCenter - curveWidth * 0.3, yMax - kinkOffset,
      xCenter, yMax,
    );
    g.bezierCurveTo(
      xCenter + curveWidth * 0.3, yMax - kinkOffset,
      xCenter + curveWidth, yMin + kinkOffset,
      w - pad, yMin,
    );
    g.stroke({ color: theme.accent.color, width: 2, alpha: 0.9 });

    // Fill under curve
    g.moveTo(pad, yMin);
    g.bezierCurveTo(
      xCenter - curveWidth, yMin + kinkOffset,
      xCenter - curveWidth * 0.3, yMax - kinkOffset,
      xCenter, yMax,
    );
    g.bezierCurveTo(
      xCenter + curveWidth * 0.3, yMax - kinkOffset,
      xCenter + curveWidth, yMin + kinkOffset,
      w - pad, yMin,
    );
    g.lineTo(w - pad, h - pad);
    g.lineTo(pad, h - pad);
    g.closePath();
    g.fill({ color: theme.accent.color, alpha: 0.1 });
  }, [curveW, params, theme]);

  const sliderLength = Math.max(100, width - 200);

  return (
    <layoutContainer layout={{ flexDirection: 'column', width, height, gap: 6, padding: 12 }}>
      {/* Top row: Revision select + Reset */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 28 }}>
        <pixiBitmapText
          text="SID Revision:"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <PixiSelect
          options={REVISION_OPTIONS}
          value={revision}
          onChange={handleRevisionChange}
          width={120}
          height={22}
          layout={{}}
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          label="Reset"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          layout={{}}
        />
      </layoutContainer>

      {/* Filter curve preview */}
      <pixiGraphics
        draw={drawCurve}
        layout={{ width: curveW, height: CURVE_H, marginTop: 4, marginBottom: 4 }}
      />

      {/* Parameter sliders */}
      <layoutContainer
        layout={{
          flexDirection: 'column',
          gap: 4,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {PARAM_DEFS.map(({ key, label }) => (
          <layoutContainer
            key={key}
            layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 24 }}
          >
            <pixiBitmapText
              text={label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ width: 80 }}
            />
            <PixiSlider
              value={params[key]}
              min={0}
              max={1}
              step={0.01}
              defaultValue={DEFAULT_PARAMS[key]}
              onChange={(v) => updateParam(key, v)}
              orientation="horizontal"
              length={sliderLength}
              thickness={5}
              handleWidth={12}
              handleHeight={12}
              color={theme.accent.color}
              layout={{}}
            />
            <pixiBitmapText
              text={params[key].toFixed(2)}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
              tint={theme.accent.color}
              layout={{ width: 36 }}
            />
          </layoutContainer>
        ))}
      </layoutContainer>
    </layoutContainer>
  );
};
