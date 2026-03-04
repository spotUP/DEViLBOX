/**
 * SIDStereoTab — Per-voice stereo panning controls for multi-SID tunes.
 *
 * Provides L/R balance sliders for each SID voice (3 voices × up to 3 chips),
 * stereo enhance mode, headphones toggle, reverb amount, and quick presets.
 */

import React, { useState, useCallback } from 'react';
import { PixiSlider, PixiSelect, PixiButton, PixiToggle } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDStereoTabProps {
  width: number;
  height: number;
}

interface VoicePan {
  label: string;
  pan: number;       // -1.0 (L) to +1.0 (R)
  color: number;
}

const STEREO_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const VOICE_COLORS = [0x44bb44, 0x4488ee, 0xee4444]; // V1=green, V2=blue, V3=red

function makeVoices(sidCount: number): VoicePan[] {
  const voices: VoicePan[] = [];
  for (let s = 0; s < sidCount; s++) {
    for (let v = 0; v < 3; v++) {
      const label = sidCount > 1 ? `SID${s + 1} V${v + 1}` : `V${v + 1}`;
      voices.push({ label, pan: 0, color: VOICE_COLORS[v] });
    }
  }
  return voices;
}

function formatPan(value: number): string {
  if (Math.abs(value) < 0.01) return 'C  0.00';
  const dir = value < 0 ? 'L' : 'R';
  return `${dir}  ${Math.abs(value).toFixed(2)}`;
}

const MONO_PRESET: number[] = Array(9).fill(0);
const WIDE_PRESET: number[] = [-0.8, 0, 0.8, -0.6, 0.2, 0.4, -0.4, -0.2, 0.6];
const CROSSFEED_PRESET: number[] = [-0.3, 0.3, 0, 0.3, -0.3, 0, -0.15, 0.15, 0];

export const SIDStereoTab: React.FC<SIDStereoTabProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const [sidCount] = useState(1);
  const [voices, setVoices] = useState<VoicePan[]>(() => makeVoices(1));
  const [stereoMode, setStereoMode] = useState('none');
  const [headphones, setHeadphones] = useState(false);
  const [reverb, setReverb] = useState(25);

  const updateVoicePan = useCallback((index: number, pan: number) => {
    setVoices(prev => prev.map((v, i) => i === index ? { ...v, pan } : v));
  }, []);

  const applyPreset = useCallback((preset: number[]) => {
    setVoices(prev => prev.map((v, i) => ({ ...v, pan: preset[i] ?? 0 })));
  }, []);

  const sliderLength = Math.max(120, width - 200);
  const voiceCount = sidCount * 3;

  return (
    <layoutContainer layout={{ flexDirection: 'column', width, height, gap: 8, padding: 12 }}>
      {/* Top row: Stereo mode + Headphones */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 16, height: 32 }}>
        <pixiBitmapText
          text="Stereo Mode:"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <PixiSelect
          options={STEREO_OPTIONS}
          value={stereoMode}
          onChange={setStereoMode}
          width={100}
          height={22}
          layout={{}}
        />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiToggle
          label="Headphones"
          value={headphones}
          onChange={setHeadphones}
          size="sm"
          layout={{}}
        />
      </layoutContainer>

      {/* Section header */}
      <pixiBitmapText
        text="Per-Voice Panning"
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 12, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ marginTop: 4 }}
      />

      {/* Voice sliders */}
      <layoutContainer
        layout={{
          flexDirection: 'column',
          gap: 6,
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {voices.slice(0, voiceCount).map((voice, i) => (
          <layoutContainer
            key={voice.label}
            layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 28 }}
          >
            <pixiBitmapText
              text={voice.label}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
              tint={voice.color}
              layout={{ width: 64 }}
            />
            <PixiSlider
              value={voice.pan}
              min={-1}
              max={1}
              step={0.01}
              detent={0}
              detentRange={0.03}
              defaultValue={0}
              onChange={(v) => updateVoicePan(i, v)}
              orientation="horizontal"
              length={sliderLength}
              thickness={5}
              handleWidth={14}
              handleHeight={14}
              color={voice.color}
              layout={{}}
            />
            <pixiBitmapText
              text={formatPan(voice.pan)}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ width: 60 }}
            />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* Reverb slider */}
      <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 32 }}>
        <pixiBitmapText
          text="Reverb:"
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{ width: 64 }}
        />
        <PixiSlider
          value={reverb}
          min={0}
          max={100}
          step={1}
          defaultValue={25}
          onChange={setReverb}
          orientation="horizontal"
          length={sliderLength}
          thickness={5}
          handleWidth={14}
          handleHeight={14}
          color={theme.accent.color}
          layout={{}}
        />
        <pixiBitmapText
          text={`${Math.round(reverb)}%`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ width: 40 }}
        />
      </layoutContainer>

      {/* Preset buttons */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 8, height: 32, marginTop: 4 }}>
        <PixiButton
          label="Mono"
          variant="ghost"
          size="sm"
          onClick={() => applyPreset(MONO_PRESET)}
          layout={{}}
        />
        <PixiButton
          label="Wide"
          variant="ghost"
          size="sm"
          onClick={() => applyPreset(WIDE_PRESET)}
          layout={{}}
        />
        <PixiButton
          label="Crossfeed"
          variant="ghost"
          size="sm"
          onClick={() => applyPreset(CROSSFEED_PRESET)}
          layout={{}}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
