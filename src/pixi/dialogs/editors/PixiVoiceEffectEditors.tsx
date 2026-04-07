/**
 * PixiVoiceEffectEditors — GL-native editors for the Voice effect group
 * (Vocoder + AutoTune). Mirrors src/components/effects/editors/VoiceEffectEditors.tsx
 * for the Pixi master/instrument effect modals.
 */

import React from 'react';
import { PixiButton, PixiKnob, PixiLabel, PixiSlider } from '../../components';
import { usePixiTheme } from '../../theme';
import { VOCODER_PRESETS, type CarrierType as StoreCarrierType } from '@/stores/useVocoderStore';
import type { EffectConfig } from '@typedefs/instrument';
import type { AutoTuneScale } from '@/engine/effects/AutoTuneEffect';

interface PixiVoiceEditorProps {
  effect: EffectConfig;
  onChange: (params: Record<string, number | string>) => void;
  onWetChange?: (wet: number) => void;
}

const CONTENT_W = 380;

const CARRIER_NAME_TO_INT: Record<StoreCarrierType, number> = {
  saw: 0, square: 1, noise: 2, chord: 3,
};
const CARRIER_LABELS = ['Saw', 'Sqr', 'Nse', 'Chd'];
const SOURCES = [
  { value: 'self', label: 'Chain' },
  { value: 'mic',  label: 'Mic' },
];

function getNum(effect: EffectConfig, key: string, def: number): number {
  const v = effect.parameters[key];
  return typeof v === 'number' ? v : def;
}
function getStr(effect: EffectConfig, key: string, def: string): string {
  const v = effect.parameters[key];
  return typeof v === 'string' ? v : def;
}

// ============================================================================
// VOCODER
// ============================================================================

export const PixiVocoderEditor: React.FC<PixiVoiceEditorProps> = ({
  effect, onChange, onWetChange,
}) => {
  const theme = usePixiTheme();
  const accent = 0xa855f7; // purple — matches DOM Vocoder enclosure

  const presetName = getStr(effect, 'preset', '');
  const source = getStr(effect, 'source', 'self');
  const bands = getNum(effect, 'bands', 32);
  const filtersPerBand = getNum(effect, 'filtersPerBand', 6);
  const carrierType = getNum(effect, 'carrierType', 3);
  const carrierFreq = getNum(effect, 'carrierFreq', 130.81);
  const formantShift = getNum(effect, 'formantShift', 1.0);
  const reactionTime = getNum(effect, 'reactionTime', 30);

  const applyPreset = (name: string) => {
    const preset = VOCODER_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const p = preset.params;
    onChange({
      preset: name,
      bands: p.bands,
      filtersPerBand: p.filtersPerBand,
      carrierType: CARRIER_NAME_TO_INT[p.carrierType],
      carrierFreq: p.carrierFreq,
      formantShift: p.formantShift,
      reactionTime: Math.round(p.reactionTime * 1000),
    });
  };

  /** Tweaking any individual param clears the preset name (custom). */
  const tweak = (key: string, value: number | string) => {
    const updates: Record<string, number | string> = { [key]: value };
    if (presetName) updates.preset = '';
    onChange(updates);
  };

  return (
    <layoutContainer
      layout={{
        width: CONTENT_W,
        flexDirection: 'column',
        gap: 8,
        padding: 8,
      }}
    >
      {/* Mix slider */}
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

      {/* Voice Preset */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="VOICE PRESET" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer
          layout={{
            width: CONTENT_W - 42,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
          }}
        >
          {VOCODER_PRESETS.map((p) => (
            <PixiButton
              key={p.name}
              label={p.name}
              variant={presetName === p.name ? 'ft2' : 'ghost'}
              color={presetName === p.name ? 'purple' : undefined}
              size="sm"
              active={presetName === p.name}
              onClick={() => applyPreset(p.name)}
            />
          ))}
        </layoutContainer>
        <PixiLabel text="MODULATOR" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          {SOURCES.map((s) => (
            <PixiButton
              key={s.value}
              label={s.label}
              variant={source === s.value ? 'ft2' : 'ghost'}
              color={source === s.value ? 'purple' : undefined}
              size="sm"
              active={source === s.value}
              onClick={() => onChange({ source: s.value })}
            />
          ))}
        </layoutContainer>
      </layoutContainer>

      {/* Carrier */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="CARRIER" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          {CARRIER_LABELS.map((label, i) => (
            <PixiButton
              key={label}
              label={label}
              variant={Math.round(carrierType) === i ? 'ft2' : 'ghost'}
              color={Math.round(carrierType) === i ? 'purple' : undefined}
              size="sm"
              active={Math.round(carrierType) === i}
              onClick={() => tweak('carrierType', i)}
            />
          ))}
        </layoutContainer>
        <layoutContainer layout={{ flexDirection: 'row', gap: 8, justifyContent: 'space-around' }}>
          <PixiKnob
            value={carrierFreq}
            min={20}
            max={2000}
            onChange={(v) => tweak('carrierFreq', v)}
            label="Freq"
            size="sm"
            color={accent}
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${v.toFixed(0)}Hz`}
          />
          <PixiKnob
            value={formantShift}
            min={0.25}
            max={4.0}
            onChange={(v) => tweak('formantShift', v)}
            label="Formant"
            size="sm"
            color={accent}
            formatValue={(v) => `${v.toFixed(2)}x`}
          />
        </layoutContainer>
      </layoutContainer>

      {/* Filterbank */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="FILTERBANK" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 8, justifyContent: 'space-around' }}>
          <PixiKnob
            value={bands}
            min={12}
            max={64}
            step={1}
            onChange={(v) => tweak('bands', Math.round(v))}
            label="Bands"
            size="sm"
            color={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <PixiKnob
            value={filtersPerBand}
            min={1}
            max={8}
            step={1}
            onChange={(v) => tweak('filtersPerBand', Math.round(v))}
            label="Order"
            size="sm"
            color={accent}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <PixiKnob
            value={reactionTime}
            min={2}
            max={500}
            step={1}
            onChange={(v) => tweak('reactionTime', Math.round(v))}
            label="React"
            size="sm"
            color={accent}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </layoutContainer>
      </layoutContainer>
    </layoutContainer>
  );
};

// ============================================================================
// AUTO-TUNE
// ============================================================================

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_OPTIONS: AutoTuneScale[] = ['major', 'minor', 'chromatic', 'pentatonic', 'blues'];

export const PixiAutoTuneEditor: React.FC<PixiVoiceEditorProps> = ({
  effect, onChange, onWetChange,
}) => {
  const theme = usePixiTheme();
  const accent = 0xec4899; // pink — matches DOM AutoTune enclosure

  const key = getNum(effect, 'key', 0);
  const scale = getStr(effect, 'scale', 'major');
  const strength = getNum(effect, 'strength', 100);
  const speed = getNum(effect, 'speed', 70);

  return (
    <layoutContainer
      layout={{
        width: CONTENT_W,
        flexDirection: 'column',
        gap: 8,
        padding: 8,
      }}
    >
      {/* Mix slider */}
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

      {/* Key */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="KEY" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {KEY_NAMES.map((name, i) => (
            <PixiButton
              key={name}
              label={name}
              variant={Math.round(key) === i ? 'ft2' : 'ghost'}
              color={Math.round(key) === i ? 'purple' : undefined}
              size="sm"
              active={Math.round(key) === i}
              onClick={() => onChange({ key: i })}
            />
          ))}
        </layoutContainer>
      </layoutContainer>

      {/* Scale */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="SCALE" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          {SCALE_OPTIONS.map((s) => (
            <PixiButton
              key={s}
              label={s.toUpperCase()}
              variant={scale === s ? 'ft2' : 'ghost'}
              color={scale === s ? 'purple' : undefined}
              size="sm"
              active={scale === s}
              onClick={() => onChange({ scale: s })}
            />
          ))}
        </layoutContainer>
      </layoutContainer>

      {/* Correction */}
      <layoutContainer
        layout={{
          width: CONTENT_W - 26,
          flexDirection: 'column',
          gap: 6,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          backgroundColor: theme.bgSecondary.color,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="CORRECTION" size="xs" weight="bold" color="custom" customColor={accent} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 8, justifyContent: 'space-around' }}>
          <PixiKnob
            value={strength}
            min={0}
            max={100}
            onChange={(v) => onChange({ strength: v })}
            label="Strength"
            size="sm"
            color={accent}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <PixiKnob
            value={speed}
            min={0}
            max={100}
            onChange={(v) => onChange({ speed: v })}
            label="Speed"
            size="sm"
            color={accent}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </layoutContainer>
      </layoutContainer>
    </layoutContainer>
  );
};
