/**
 * PixiEffectParameterEditor — GL-native effect parameter editor component.
 *
 * Shared by MasterEffectsModal and InstrumentEffectsModal GL conversions.
 * Replaces DOM EffectParameterEditor with Pixi.js rendered controls.
 *
 * Renders:
 *   - Header with effect name and enabled status
 *   - Wet/dry slider (horizontal)
 *   - Parameter grid (4 knobs per row) inside a PixiScrollView
 *   - Neural effects: model name + dynamic parameters from NeuralParameterMapper
 *   - Standard effects: parameters from effect.parameters record
 */

import React, { useMemo, useCallback } from 'react';
import { PixiLabel, PixiKnob, PixiSlider, PixiScrollView } from '../components';
import { usePixiTheme } from '../theme';
import type { EffectConfig } from '@typedefs/instrument';
import { NeuralParameterMapper } from '@engine/effects/NeuralParameterMapper';
import { PixiVocoderEditor, PixiAutoTuneEditor } from './editors/PixiVoiceEffectEditors';
import {
  PixiParametricEQEditor, PixiEQ5BandEditor, PixiEQ8BandEditor,
  PixiEQ12BandEditor, PixiGEQ31Editor, PixiKuizaEditor,
  PixiZamEQ2Editor, PixiDynamicEQEditor,
} from './editors/PixiEQEditors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiEffectParameterEditorProps {
  effect: EffectConfig;
  onChange: (params: Record<string, number | string>) => void;
  onWetChange?: (wet: number) => void;
}

interface ParamDef {
  key: string;
  name: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  type: 'number' | 'boolean';
  implemented?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_W = 380;
const KNOBS_PER_ROW = 4;
const KNOB_H = 84;
const ROW_GAP = 8;
const SECTION_PAD = 10;

/** Accent colors per effect category (theme-derived) */
function getCategoryAccent(theme: ReturnType<typeof usePixiTheme>): Record<string, number> {
  return {
    tonejs: theme.accent.color,
    neural: theme.accentSecondary.color,
    buzzmachine: theme.warning.color,
    wasm: theme.success.color,
    wam: theme.accentHighlight.color,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Infer parameter definitions from an EffectConfig's parameters record */
function inferParamDefs(effect: EffectConfig): ParamDef[] {
  const defs: ParamDef[] = [];
  for (const [key, value] of Object.entries(effect.parameters)) {
    if (typeof value === 'number') {
      // Heuristic ranges: most effect params are 0-100 normalized or 0-1
      const isNormalized = value >= 0 && value <= 1;
      defs.push({
        key,
        name: formatParamName(key),
        min: 0,
        max: isNormalized ? 1 : 100,
        step: isNormalized ? 0.01 : 1,
        unit: isNormalized ? '' : '%',
        defaultValue: value,
        type: 'number',
      });
    } else if (typeof value === 'string') {
      // String params (e.g., filter type) are handled separately via PixiSelect
      // but we skip them here since we render only knobs/checkboxes
    }
  }
  return defs;
}

/** Convert camelCase key to a human-readable label */
function formatParamName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/** Get neural parameters from model registry */
function getNeuralParamDefs(effect: EffectConfig): ParamDef[] | null {
  if (effect.category !== 'neural' || effect.neuralModelIndex === undefined) {
    return null;
  }
  const mapper = new NeuralParameterMapper(effect.neuralModelIndex);
  const params = mapper.getAvailableParameters();
  return params.map((p) => ({
    key: p.key,
    name: p.name,
    min: 0,
    max: 100,
    step: 1,
    unit: p.unit || '%',
    defaultValue: p.default,
    type: 'number' as const,
    implemented: p.implemented,
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiEffectParameterEditor: React.FC<PixiEffectParameterEditorProps> = ({
  effect,
  onChange,
  onWetChange,
}) => {
  const theme = usePixiTheme();
  const categoryAccent = getCategoryAccent(theme);
  const accent = categoryAccent[effect.category] ?? theme.accent.color;

  // ── Specialized editors (button grids, custom layouts) ───────────
  // The generic param-grid editor below can't render preset/key/scale
  // pickers, so a few effect types ship dedicated editors that take
  // over the entire content area.
  if (effect.type === 'Vocoder') {
    return <PixiVocoderEditor effect={effect} onChange={onChange} onWetChange={onWetChange} />;
  }
  if (effect.type === 'AutoTune') {
    return <PixiAutoTuneEditor effect={effect} onChange={onChange} onWetChange={onWetChange} />;
  }

  // EQ editors with sliders + frequency response curves
  const EQ_EDITORS: Record<string, React.FC<{
    effect: EffectConfig;
    onChange: (params: Record<string, number | string>) => void;
    onWetChange?: (wet: number) => void;
  }>> = {
    ParametricEQ: PixiParametricEQEditor,
    EQ5Band: PixiEQ5BandEditor,
    EQ8Band: PixiEQ8BandEditor,
    EQ12Band: PixiEQ12BandEditor,
    GEQ31: PixiGEQ31Editor,
    Kuiza: PixiKuizaEditor,
    ZamEQ2: PixiZamEQ2Editor,
    DynamicEQ: PixiDynamicEQEditor,
  };
  const EQEditor = EQ_EDITORS[effect.type];
  if (EQEditor) {
    return <EQEditor effect={effect} onChange={onChange} onWetChange={onWetChange} />;
  }

  // Resolve parameter definitions
  const neuralParams = useMemo(() => getNeuralParamDefs(effect), [effect.category, effect.neuralModelIndex]);
  const standardParams = useMemo(() => inferParamDefs(effect), [effect.parameters]);
  const allParams = neuralParams ?? standardParams;

  const implementedParams = useMemo(
    () => allParams.filter((p) => p.implemented !== false),
    [allParams],
  );
  const unimplementedParams = useMemo(
    () => allParams.filter((p) => p.implemented === false),
    [allParams],
  );

  const handleParamChange = useCallback(
    (key: string, value: number) => {
      onChange({ ...effect.parameters, [key]: value });
    },
    [onChange, effect.parameters],
  );

  const getParamValue = useCallback(
    (param: ParamDef): number => {
      const v = effect.parameters[param.key];
      return typeof v === 'number' ? v : param.defaultValue;
    },
    [effect.parameters],
  );

  // Layout calculations
  const paramRows = Math.ceil(implementedParams.length / KNOBS_PER_ROW);
  const unimplRows = Math.ceil(unimplementedParams.length / KNOBS_PER_ROW);
  const gridH = paramRows * (KNOB_H + ROW_GAP);
  const unimplGridH = unimplRows * (KNOB_H + ROW_GAP);

  // Section heights: header(28) + wetSlider(40) + paramSection + unimplSection + info(24)
  const wetSectionH = onWetChange ? 50 : 0;
  const paramSectionH = implementedParams.length > 0 ? gridH + 32 + SECTION_PAD * 2 : 0;
  const unimplSectionH = unimplementedParams.length > 0 ? unimplGridH + 32 + SECTION_PAD * 2 : 0;
  const infoH = neuralParams ? 36 : 0;
  const totalContentH = wetSectionH + paramSectionH + unimplSectionH + infoH + 20;

  const scrollViewH = Math.min(totalContentH, 360);

  return (
    <layoutContainer
      layout={{
        width: CONTENT_W,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <layoutContainer
        layout={{
          width: CONTENT_W,
          height: 30,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 8,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          backgroundColor: theme.bgSecondary.color,
        }}
      >
        {/* LED indicator */}
        <layoutContainer
          layout={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: effect.enabled ? theme.success.color : theme.bgActive.color,
          }}
        />
        <PixiLabel
          text={effect.neuralModelName || effect.type}
          size="sm"
          weight="bold"
          color="text"
        />
        <PixiLabel
          text={effect.enabled ? 'Active' : 'Bypassed'}
          size="xs"
          color="textMuted"
        />
      </layoutContainer>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <PixiScrollView
        width={CONTENT_W}
        height={scrollViewH}
        contentHeight={totalContentH}
        direction="vertical"
      >
        <layoutContainer
          layout={{
            width: CONTENT_W - 10,
            flexDirection: 'column',
            gap: 8,
            padding: 8,
          }}
        >
          {/* ── Wet/Dry slider ────────────────────────────────────────── */}
          {onWetChange && (
            <layoutContainer
              layout={{
                width: CONTENT_W - 26,
                height: 42,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 6,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
              }}
            >
              <PixiLabel text="MIX" size="xs" weight="bold" color="textMuted" />
              <PixiSlider
                value={effect.wet}
                min={0}
                max={100}
                onChange={onWetChange}
                orientation="horizontal"
                length={CONTENT_W - 120}
                thickness={4}
                handleWidth={16}
                handleHeight={16}
                showValue
                formatValue={(v) => `${Math.round(v)}%`}
                color={accent}
              />
            </layoutContainer>
          )}

          {/* ── Implemented parameters ────────────────────────────────── */}
          {implementedParams.length > 0 && (
            <layoutContainer
              layout={{
                width: CONTENT_W - 26,
                flexDirection: 'column',
                gap: 6,
                padding: SECTION_PAD,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
              }}
            >
              <PixiLabel
                text={neuralParams ? 'PARAMETERS' : effect.type.toUpperCase()}
                size="xs"
                weight="bold"
                color="custom"
                customColor={accent}
              />
              <layoutContainer
                layout={{
                  width: CONTENT_W - 26 - SECTION_PAD * 2,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-start',
                  gap: ROW_GAP,
                }}
              >
                {implementedParams.map((param) => (
                  <PixiKnob
                    key={param.key}
                    value={getParamValue(param)}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    onChange={(v) => handleParamChange(param.key, v)}
                    label={param.name}
                    size="sm"
                    color={accent}
                    formatValue={(v) => {
                      if (param.max <= 1) return v.toFixed(2);
                      return `${Math.round(v)}${param.unit}`;
                    }}
                  />
                ))}
              </layoutContainer>
            </layoutContainer>
          )}

          {/* ── Unimplemented parameters (displayed as disabled knobs) ──── */}
          {unimplementedParams.length > 0 && (
            <layoutContainer
              layout={{
                width: CONTENT_W - 26,
                flexDirection: 'column',
                gap: 6,
                padding: SECTION_PAD,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
              }}
            >
              <layoutContainer
                layout={{
                  width: CONTENT_W - 26 - SECTION_PAD * 2,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-start',
                  gap: ROW_GAP,
                }}
              >
                {unimplementedParams.map((param) => (
                  <PixiKnob
                    key={param.key}
                    value={getParamValue(param)}
                    min={param.min}
                    max={param.max}
                    onChange={() => {}}
                    label={param.name}
                    size="sm"
                    color={theme.textMuted.color}
                    disabled
                    formatValue={(v) => `${Math.round(v)}${param.unit}`}
                  />
                ))}
              </layoutContainer>
            </layoutContainer>
          )}

          {/* ── Neural info note ──────────────────────────────────────── */}
          {neuralParams && (
            <layoutContainer
              layout={{
                width: CONTENT_W - 26,
                padding: 6,
                borderRadius: 4,
                borderWidth: 1,
                backgroundColor: theme.bgSecondary.color,
                borderColor: theme.border.color,
              }}
            >
              <PixiLabel
                text="Neural effects use ML models for authentic emulation."
                size="xs"
                color="textMuted"
              />
            </layoutContainer>
          )}
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
