/**
 * PixiInStereo2Panel -- GL-native InStereo! 2.0 instrument editor.
 *
 * Mirrors src/components/instruments/controls/InStereo2Controls.tsx:
 *   - Synthesis: volume, waveformLength, waveform 1 & 2 displays
 *   - Envelope: ADSR table (bar chart), sustain, EG mode/params + EG table
 *   - Modulation: vibrato, portamento, LFO table bar chart
 *   - Arpeggio: 3 sub-tables with length/repeat + bar charts
 *
 * Mutations flow via onUpdate(id, { inStereo2: { ...prev, field: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiSelect, PixiNumericInput } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { InStereo2Config } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const DISPLAY_W = 320;
const DISPLAY_H = 56;
const WAVE_H = 72;

type IS20Tab = 'synthesis' | 'envelope' | 'modulation' | 'arpeggio';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const EG_MODES: SelectOption[] = [
  { value: '0', label: 'Disabled' },
  { value: '1', label: 'Calc' },
  { value: '2', label: 'Free' },
];

export const PixiInStereo2Panel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const is2 = instrument.inStereo2!;
  const [activeTab, setActiveTab] = useState<IS20Tab>('synthesis');

  const is2Ref = useRef(is2);
  useEffect(() => { is2Ref.current = is2; }, [is2]);
  const idRef = useRef(instrument.id);
  useEffect(() => { idRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof InStereo2Config>(key: K, value: InStereo2Config[K]) => {
      onUpdate(idRef.current, {
        inStereo2: { ...is2Ref.current, [key]: value },
      });
    },
    [onUpdate],
  );

  const updateArpField = useCallback(
    (index: 0 | 1 | 2, field: 'length' | 'repeat', value: number) => {
      const cur = is2Ref.current;
      const arps = cur.arpeggios.map((a, i) =>
        i === index ? { ...a, [field]: value } : { ...a },
      ) as InStereo2Config['arpeggios'];
      onUpdate(idRef.current, { inStereo2: { ...cur, arpeggios: arps } });
    },
    [onUpdate],
  );

  const tabs: { id: IS20Tab; label: string }[] = [
    { id: 'synthesis', label: 'Synthesis' },
    { id: 'envelope', label: 'Envelope' },
    { id: 'modulation', label: 'Modulation' },
    { id: 'arpeggio', label: 'Arpeggio' },
  ];

  // ---- Drawing helpers ----

  const drawWaveform = useCallback(
    (data: number[], color: number) => (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, WAVE_H).fill({ color: theme.bg.color });
      const mid = WAVE_H / 2;
      g.moveTo(0, mid).lineTo(DISPLAY_W, mid).stroke({ color: theme.border.color, width: 1 });
      if (!data || data.length === 0) return;
      const len = data.length;
      for (let x = 0; x < DISPLAY_W; x++) {
        const idx = Math.floor((x / DISPLAY_W) * len) % len;
        const s = data[idx];
        const y = mid - (s / 128) * (mid - 2);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color, width: 2 });
    },
    [theme.bg.color, theme.border.color],
  );

  const drawUnipolarBars = useCallback(
    (values: number[], maxVal: number, color: number, markers?: { pos: number; color: number }[]) => (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      g.moveTo(0, DISPLAY_H - 1).lineTo(DISPLAY_W, DISPLAY_H - 1).stroke({ color: theme.border.color, width: 1 });
      if (!values || values.length === 0) return;
      const barW = DISPLAY_W / values.length;
      for (let i = 0; i < values.length; i++) {
        const v = Math.max(0, Math.min(maxVal, values[i]));
        const h = (v / maxVal) * (DISPLAY_H - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        g.rect(x, DISPLAY_H - h - 1, w, h).fill({ color });
      }
      if (markers) {
        for (const m of markers) {
          if (m.pos > 0 && m.pos < values.length) {
            const mx = m.pos * barW;
            g.moveTo(mx, 0).lineTo(mx, DISPLAY_H).stroke({ color: m.color, width: 1 });
          }
        }
      }
    },
    [theme.bg.color, theme.border.color],
  );

  const drawBipolarBars = useCallback(
    (values: number[], color: number) => (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      const mid = DISPLAY_H / 2;
      g.moveTo(0, mid).lineTo(DISPLAY_W, mid).stroke({ color: theme.border.color, width: 1 });
      if (!values || values.length === 0) return;
      let maxMag = 1;
      for (const v of values) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }
      const barW = DISPLAY_W / values.length;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const scaled = (v / maxMag) * (mid - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        if (scaled >= 0) {
          g.rect(x, mid - scaled, w, scaled).fill({ color });
        } else {
          g.rect(x, mid, w, -scaled).fill({ color });
        }
      }
    },
    [theme.bg.color, theme.border.color],
  );

  // Memoized draw callbacks
  const drawWF1 = useCallback(drawWaveform(is2.waveform1, theme.accent.color), [is2.waveform1, drawWaveform, theme.accent.color]);
  const drawWF2 = useCallback(drawWaveform(is2.waveform2, theme.success.color), [is2.waveform2, drawWaveform, theme.success.color]);

  const adsrMarkers = [];
  if (is2.sustainPoint > 0) adsrMarkers.push({ pos: is2.sustainPoint, color: 0xFFFF00 });
  if (is2.adsrLength > 0) adsrMarkers.push({ pos: is2.adsrLength, color: 0xFF4444 });
  if (is2.adsrRepeat > 0) adsrMarkers.push({ pos: is2.adsrRepeat, color: 0x44FF44 });

  const drawADSR = useCallback(
    drawUnipolarBars(is2.adsrTable, 255, theme.accent.color, adsrMarkers),
    [is2.adsrTable, is2.sustainPoint, is2.adsrLength, is2.adsrRepeat, drawUnipolarBars, theme.accent.color],
  );

  const egMarkers = is2.egMode === 2 && is2.egStartLen > 0
    ? [{ pos: is2.egStartLen, color: 0xFF4444 }]
    : [];

  const drawEG = useCallback(
    drawUnipolarBars(is2.egTable, 255, theme.warning.color, egMarkers),
    [is2.egTable, is2.egMode, is2.egStartLen, drawUnipolarBars, theme.warning.color],
  );

  const drawLFO = useCallback(
    drawBipolarBars(is2.lfoTable, theme.accent.color),
    [is2.lfoTable, drawBipolarBars, theme.accent.color],
  );

  const drawArp = useCallback(
    (values: number[]) => drawBipolarBars(values, theme.warning.color),
    [drawBipolarBars, theme.warning.color],
  );

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          borderRadius: 4,
          backgroundColor: theme.bgTertiary.color,
        }}
      >
        <PixiLabel text="InStereo! 2.0" size="sm" weight="bold" color="custom" customColor={0xFF8844} />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* Tab bar */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
        {tabs.map((t) => (
          <PixiButton
            key={t.id}
            label={t.label}
            variant={activeTab === t.id ? 'primary' : 'ghost'}
            onClick={() => setActiveTab(t.id)}
          />
        ))}
      </layoutContainer>

      {/* ---- SYNTHESIS TAB ---- */}
      {activeTab === 'synthesis' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VOLUME & WAVEFORM" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={is2.volume}
              min={0} max={64}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume"
              size="md"
              defaultValue={64}
            />
            <PixiKnob
              value={is2.waveformLength}
              min={2} max={256}
              step={2}
              onChange={(v) => upd('waveformLength', Math.round(v))}
              label="Wave Len"
              size={KNOB_SIZE}
              defaultValue={32}
            />
          </layoutContainer>

          <SectionHeading text="WAVEFORM 1" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: WAVE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWF1} layout={{ width: DISPLAY_W, height: WAVE_H }} />
          </layoutContainer>

          <SectionHeading text="WAVEFORM 2" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: WAVE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWF2} layout={{ width: DISPLAY_W, height: WAVE_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- ENVELOPE TAB ---- */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ADSR ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={is2.adsrLength}
              min={0} max={127}
              onChange={(v) => upd('adsrLength', Math.round(v))}
              label="Length"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={is2.adsrRepeat}
              min={0} max={127}
              onChange={(v) => upd('adsrRepeat', Math.round(v))}
              label="Repeat"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={is2.sustainPoint}
              min={0} max={127}
              onChange={(v) => upd('sustainPoint', Math.round(v))}
              label="Sus Point"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={is2.sustainSpeed}
              min={0} max={255}
              onChange={(v) => upd('sustainSpeed', Math.round(v))}
              label="Sus Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawADSR} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>

          <SectionHeading text="ENVELOPE GENERATOR (EG)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <PixiLabel text="Mode" size="xs" color="textMuted" />
            <PixiSelect
              options={EG_MODES}
              value={String(is2.egMode)}
              onChange={(v) => upd('egMode', parseInt(v))}
              width={100}
            />
          </layoutContainer>
          {is2.egMode === 1 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
              <PixiKnob
                value={is2.egStartLen} min={0} max={255}
                onChange={(v) => upd('egStartLen', Math.round(v))}
                label="Start/Len" size={KNOB_SIZE} defaultValue={0}
              />
              <PixiKnob
                value={is2.egStopRep} min={0} max={255}
                onChange={(v) => upd('egStopRep', Math.round(v))}
                label="Stop/Rep" size={KNOB_SIZE} defaultValue={0}
              />
              <PixiKnob
                value={is2.egSpeedUp} min={0} max={255}
                onChange={(v) => upd('egSpeedUp', Math.round(v))}
                label="Speed Up" size={KNOB_SIZE} defaultValue={0}
              />
              <PixiKnob
                value={is2.egSpeedDown} min={0} max={255}
                onChange={(v) => upd('egSpeedDown', Math.round(v))}
                label="Speed Dn" size={KNOB_SIZE} defaultValue={0}
              />
            </layoutContainer>
          )}
          {is2.egMode === 2 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
              <PixiKnob
                value={is2.egStartLen} min={0} max={255}
                onChange={(v) => upd('egStartLen', Math.round(v))}
                label="Start Len" size={KNOB_SIZE} defaultValue={0}
              />
              <PixiKnob
                value={is2.egStopRep} min={0} max={255}
                onChange={(v) => upd('egStopRep', Math.round(v))}
                label="Stop Rep" size={KNOB_SIZE} defaultValue={0}
              />
            </layoutContainer>
          )}
          {is2.egMode !== 0 && (
            <layoutContainer
              layout={{
                width: DISPLAY_W,
                height: DISPLAY_H,
                borderWidth: 1,
                borderColor: theme.border.color,
                borderRadius: 4,
                marginTop: 4,
              }}
            >
              <pixiGraphics draw={drawEG} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
            </layoutContainer>
          )}
        </layoutContainer>
      )}

      {/* ---- MODULATION TAB ---- */}
      {activeTab === 'modulation' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={is2.vibratoDelay} min={0} max={255}
              onChange={(v) => upd('vibratoDelay', Math.round(v))}
              label="Delay" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={is2.vibratoSpeed} min={0} max={255}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={is2.vibratoLevel} min={0} max={255}
              onChange={(v) => upd('vibratoLevel', Math.round(v))}
              label="Level" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="PORTAMENTO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={is2.portamentoSpeed} min={0} max={255}
              onChange={(v) => upd('portamentoSpeed', Math.round(v))}
              label="Speed" size="md" defaultValue={0}
            />
            <PixiLabel text="0 = disabled" size="xs" color="textMuted" />
          </layoutContainer>

          <SectionHeading text="LFO (PITCH MODULATION)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={is2.amfLength} min={0} max={127}
              onChange={(v) => upd('amfLength', Math.round(v))}
              label="Length" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={is2.amfRepeat} min={0} max={127}
              onChange={(v) => upd('amfRepeat', Math.round(v))}
              label="Repeat" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawLFO} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- ARPEGGIO TAB ---- */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ARPEGGIO TABLES" />
          {([0, 1, 2] as const).map((tIdx) => {
            const arp = is2.arpeggios[tIdx];
            const drawArpChart = drawArp(arp.values);
            return (
              <layoutContainer key={tIdx} layout={{ flexDirection: 'column', gap: 4, paddingBottom: 4 }}>
                <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <PixiLabel text={`Arp ${tIdx + 1}`} size="xs" weight="bold" color="custom" customColor={theme.accent.color} />
                  <PixiLabel text="Len" size="xs" color="textMuted" />
                  <PixiNumericInput
                    value={arp.length}
                    min={0} max={14}
                    onChange={(v) => updateArpField(tIdx, 'length', v)}
                    width={40}
                  />
                  <PixiLabel text="Rep" size="xs" color="textMuted" />
                  <PixiNumericInput
                    value={arp.repeat}
                    min={0} max={14}
                    onChange={(v) => updateArpField(tIdx, 'repeat', v)}
                    width={40}
                  />
                </layoutContainer>
                <layoutContainer
                  layout={{
                    width: DISPLAY_W,
                    height: DISPLAY_H,
                    borderWidth: 1,
                    borderColor: theme.border.color,
                    borderRadius: 4,
                  }}
                >
                  <pixiGraphics draw={drawArpChart} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
                </layoutContainer>
              </layoutContainer>
            );
          })}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
