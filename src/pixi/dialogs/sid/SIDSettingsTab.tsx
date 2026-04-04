/**
 * SIDSettingsTab — SID engine settings and configuration.
 * Engine selection, chip model, clock speed, ASID, buffer size, voice masks.
 */

import React, { useCallback, useMemo } from 'react';
import { useSettingsStore } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import { notify } from '@stores/useNotificationStore';
import { PixiLabel, PixiSelect, PixiToggle, PixiScrollView } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { tintBg } from '../../colors';

interface SIDSettingsTabProps {
  width: number;
  height: number;
}

const PAD = 16;

/** Labelled row for settings controls */
const SettingRow: React.FC<{
  label: string;
  children: React.ReactNode;
  labelW?: number;
  width: number;
}> = ({ label, children, labelW = 90, width }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12, width }}>
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
        tint={theme.accentHighlight.color}
        layout={{ width: labelW }}
      />
      {children}
    </layoutContainer>
  );
};

// ── Option definitions ──────────────────────────────────────────────────────

const CHIP_MODEL_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto (from SID header)' },
  { value: '6581', label: 'MOS 6581' },
  { value: '8580', label: 'MOS 8580' },
];

const CLOCK_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto (from SID header)' },
  { value: 'pal', label: 'PAL (50 Hz)' },
  { value: 'ntsc', label: 'NTSC (60 Hz)' },
];

const BUFFER_OPTIONS: SelectOption[] = [
  { value: '512', label: '512 (low latency)' },
  { value: '1024', label: '1024 (default)' },
  { value: '2048', label: '2048 (stable)' },
  { value: '4096', label: '4096 (high latency)' },
];

const QUALITY_OPTIONS: SelectOption[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High Quality' },
];

export const SIDSettingsTab: React.FC<SIDSettingsTabProps> = ({ width, height }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;
  const selectW = contentW - 110;

  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const asidEnabled = useSettingsStore((s) => s.asidEnabled);
  const setAsidEnabled = useSettingsStore((s) => s.setAsidEnabled);
  const sidHwMode = useSettingsStore((s) => s.sidHardwareMode);

  // Local settings state (not yet persisted in store — extend when ready)
  const [chipModel, setChipModel] = React.useState('auto');
  const [clock, setClock] = React.useState('auto');
  const [bufferSize, setBufferSize] = React.useState('1024');
  const [quality, setQuality] = React.useState('standard');
  const [voice1, setVoice1] = React.useState(true);
  const [voice2, setVoice2] = React.useState(true);
  const [voice3, setVoice3] = React.useState(true);

  const engineOptions: SelectOption[] = useMemo(
    () =>
      Object.values(SID_ENGINES).map((eng) => ({
        value: eng.id,
        label: `${eng.name} — ${eng.accuracy}, ${eng.speed}${eng.features.asidHardware ? ' ★ HW' : ''}`,
      })),
    []
  );

  const currentEngine = SID_ENGINES[sidEngine];

  const handleEngineChange = useCallback(
    (value: string) => {
      setSidEngine(value as SIDEngineType);
      notify.success(`SID engine: ${SID_ENGINES[value as SIDEngineType].name}`);
    },
    [setSidEngine]
  );

  const handleAsidToggle = useCallback(
    (value: boolean) => {
      setAsidEnabled(value);
      notify.success(value ? 'ASID hardware enabled' : 'ASID hardware disabled');
    },
    [setAsidEnabled]
  );

  const contentH = 500;

  return (
    <PixiScrollView width={width} height={height} contentHeight={contentH}>
      <layoutContainer layout={{ flexDirection: 'column', gap: 16, padding: PAD, width: contentW }}>
        {/* Engine selection */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: tintBg(theme.accent.color),
            borderColor: theme.accent.color,
          }}
        >
          <SettingRow label="Engine" width={contentW - 28}>
            <PixiSelect
              options={engineOptions}
              value={sidEngine}
              onChange={handleEngineChange}
              width={selectW}
            />
          </SettingRow>
          <pixiBitmapText
            text={currentEngine.description}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ width: contentW - 40, marginLeft: 102 }}
          />
          <pixiBitmapText
            text={`Size: ${currentEngine.size}  |  WASM: ${currentEngine.requiresWASM ? 'Yes' : 'No'}`}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={theme.textMuted.color}
            alpha={0.7}
            layout={{ marginLeft: 102 }}
          />
          {sidHwMode !== 'off' && !currentEngine.features.asidHardware && (
            <pixiBitmapText
              text="This engine does not support hardware SID output. Switch to jsSID."
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={theme.warning.color}
              layout={{ width: contentW - 40, marginLeft: 102 }}
            />
          )}
        </layoutContainer>

        {/* Audio settings */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 10,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.bg.color,
            borderColor: theme.border.color,
          }}
        >
          <PixiLabel text="Audio Settings" size="xs" weight="semibold" color="textSecondary" />

          <SettingRow label="Chip Model" width={contentW - 28}>
            <PixiSelect options={CHIP_MODEL_OPTIONS} value={chipModel} onChange={setChipModel} width={selectW} />
          </SettingRow>

          <SettingRow label="Clock" width={contentW - 28}>
            <PixiSelect options={CLOCK_OPTIONS} value={clock} onChange={setClock} width={selectW} />
          </SettingRow>

          <SettingRow label="Quality" width={contentW - 28}>
            <PixiSelect options={QUALITY_OPTIONS} value={quality} onChange={setQuality} width={selectW} />
          </SettingRow>

          <SettingRow label="Buffer Size" width={contentW - 28}>
            <PixiSelect options={BUFFER_OPTIONS} value={bufferSize} onChange={setBufferSize} width={selectW} />
          </SettingRow>
        </layoutContainer>

        {/* ASID Hardware */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.bg.color,
            borderColor: theme.border.color,
          }}
        >
          <PixiLabel text="Hardware Output" size="xs" weight="semibold" color="textSecondary" />
          <PixiToggle
            label="ASID Output"
            value={asidEnabled}
            onChange={handleAsidToggle}
            disabled={sidEngine !== 'jssid'}
            layout={{}}
          />
          {sidEngine !== 'jssid' && (
            <pixiBitmapText
              text="ASID hardware requires jsSID engine"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              alpha={0.6}
              layout={{ marginLeft: 4 }}
            />
          )}
        </layoutContainer>

        {/* Voice control */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.bg.color,
            borderColor: theme.border.color,
          }}
        >
          <PixiLabel text="Voice Control" size="xs" weight="semibold" color="textSecondary" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <PixiToggle label="Voice 1" value={voice1} onChange={setVoice1} size="sm" layout={{}} />
            <PixiToggle label="Voice 2" value={voice2} onChange={setVoice2} size="sm" layout={{}} />
            <PixiToggle label="Voice 3" value={voice3} onChange={setVoice3} size="sm" layout={{}} />
          </layoutContainer>
        </layoutContainer>
      </layoutContainer>
    </PixiScrollView>
  );
};
