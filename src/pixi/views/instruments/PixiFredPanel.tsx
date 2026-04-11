/**
 * PixiFredPanel -- GL-native Fred Editor instrument panel.
 *
 * Mirrors src/components/instruments/controls/FredControls.tsx:
 *   - Envelope: envelopeVol, attackSpeed/Vol, decaySpeed/Vol, sustainTime,
 *     releaseSpeed/Vol knobs
 *   - Vibrato: delay/speed/depth knobs
 *   - Arpeggio: arpeggioSpeed, arpeggioLimit + bar chart (read-only)
 *   - PWM: pulseRateNeg/Pos, pulseSpeed, pulsePosL/H, pulseDelay knobs
 *   - Relative tuning knob
 *
 * Mutations flow via onUpdate(id, { fred: { ...prev, field: value } }).
 * No chip-RAM writes in the GL panel (DOM handles live UADE patching).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiNumericInput } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { FredConfig } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const BAR_W = 320;
const BAR_H = 56;

type FredTab = 'envelope' | 'pwm' | 'arpeggio' | 'vibrato';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiFredPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const fred = instrument.fred!;
  const [activeTab, setActiveTab] = useState<FredTab>('envelope');

  const fredRef = useRef(fred);
  useEffect(() => { fredRef.current = fred; }, [fred]);
  const idRef = useRef(instrument.id);
  useEffect(() => { idRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof FredConfig>(key: K, value: FredConfig[K]) => {
      onUpdate(idRef.current, {
        fred: { ...fredRef.current, [key]: value },
      });
    },
    [onUpdate],
  );

  const tabs: { id: FredTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'pwm', label: 'PWM' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'vibrato', label: 'Vibrato' },
  ];

  // Arpeggio bar chart (read-only, signed bipolar)
  const drawArpBars = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, BAR_W, BAR_H).fill({ color: theme.bg.color });
      const mid = BAR_H / 2;
      g.moveTo(0, mid).lineTo(BAR_W, mid).stroke({ color: theme.border.color, width: 1 });

      const data = fred.arpeggio;
      if (!data || data.length === 0) return;

      // Only draw up to arpeggioLimit active entries
      const limit = Math.min(fred.arpeggioLimit || data.length, data.length);
      let maxMag = 1;
      for (let i = 0; i < limit; i++) {
        const a = Math.abs(data[i]);
        if (a > maxMag) maxMag = a;
      }
      const barW = BAR_W / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const active = i < limit;
        const scaled = (v / maxMag) * (mid - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        const color = active ? theme.warning.color : theme.bgTertiary.color;
        if (scaled >= 0) {
          g.rect(x, mid - scaled, w, scaled).fill({ color });
        } else {
          g.rect(x, mid, w, -scaled).fill({ color });
        }
      }
    },
    [fred.arpeggio, fred.arpeggioLimit, theme.bg.color, theme.border.color, theme.warning.color, theme.bgTertiary.color],
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
        <PixiLabel text="Fred Editor" size="sm" weight="bold" color="custom" customColor={0xFF8800} />
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

      {/* ---- ENVELOPE TAB ---- */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fred.envelopeVol}
              min={0} max={64}
              onChange={(v) => upd('envelopeVol', Math.round(v))}
              label="Init Vol"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fred.attackVol}
              min={0} max={64}
              onChange={(v) => upd('attackVol', Math.round(v))}
              label="Atk Vol"
              size={KNOB_SIZE}
              defaultValue={64}
            />
            <PixiKnob
              value={fred.attackSpeed}
              min={1} max={255}
              onChange={(v) => upd('attackSpeed', Math.round(v))}
              label="Atk Spd"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={fred.decayVol}
              min={0} max={64}
              onChange={(v) => upd('decayVol', Math.round(v))}
              label="Dec Vol"
              size={KNOB_SIZE}
              defaultValue={32}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fred.decaySpeed}
              min={1} max={255}
              onChange={(v) => upd('decaySpeed', Math.round(v))}
              label="Dec Spd"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={fred.sustainTime}
              min={0} max={255}
              onChange={(v) => upd('sustainTime', Math.round(v))}
              label="Sus Time"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fred.releaseVol}
              min={0} max={64}
              onChange={(v) => upd('releaseVol', Math.round(v))}
              label="Rel Vol"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fred.releaseSpeed}
              min={1} max={255}
              onChange={(v) => upd('releaseSpeed', Math.round(v))}
              label="Rel Spd"
              size={KNOB_SIZE}
              defaultValue={1}
            />
          </layoutContainer>

          <SectionHeading text="RELATIVE TUNING" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={fred.relative}
              min={256} max={4096}
              onChange={(v) => upd('relative', Math.round(v))}
              label="Relative"
              size="md"
              defaultValue={1024}
            />
            <PixiLabel text="1024 = no shift" size="xs" color="textMuted" />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- PWM TAB ---- */}
      {activeTab === 'pwm' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="PULSE WIDTH RANGE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={fred.pulsePosL}
              min={0} max={64}
              onChange={(v) => upd('pulsePosL', Math.round(v))}
              label="Low"
              size="md"
              defaultValue={0}
            />
            <PixiKnob
              value={fred.pulsePosH}
              min={0} max={64}
              onChange={(v) => upd('pulsePosH', Math.round(v))}
              label="High"
              size="md"
              defaultValue={32}
            />
          </layoutContainer>

          <SectionHeading text="PWM MODULATION" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={fred.pulseSpeed}
              min={1} max={255}
              onChange={(v) => upd('pulseSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={fred.pulseDelay}
              min={0} max={255}
              onChange={(v) => upd('pulseDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fred.pulseRatePos}
              min={0} max={127}
              onChange={(v) => upd('pulseRatePos', Math.round(v))}
              label="Rate +"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={fred.pulseRateNeg}
              min={-128} max={0}
              onChange={(v) => upd('pulseRateNeg', Math.round(v))}
              label="Rate -"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- ARPEGGIO TAB ---- */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ARPEGGIO SETTINGS" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <PixiLabel text="Active Steps" size="xs" color="textMuted" />
              <PixiNumericInput
                value={fred.arpeggioLimit}
                min={0} max={16}
                onChange={(v) => upd('arpeggioLimit', v)}
                width={48}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <PixiLabel text="Speed (ticks)" size="xs" color="textMuted" />
              <PixiNumericInput
                value={fred.arpeggioSpeed}
                min={1} max={255}
                onChange={(v) => upd('arpeggioSpeed', v)}
                width={48}
              />
            </layoutContainer>
          </layoutContainer>

          <SectionHeading text="ARPEGGIO TABLE (semitone offsets)" />
          <layoutContainer
            layout={{
              width: BAR_W,
              height: BAR_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawArpBars} layout={{ width: BAR_W, height: BAR_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- VIBRATO TAB ---- */}
      {activeTab === 'vibrato' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={fred.vibratoDelay}
              min={0} max={255}
              onChange={(v) => upd('vibratoDelay', Math.round(v))}
              label="Delay"
              size="md"
              defaultValue={0}
            />
            <PixiKnob
              value={fred.vibratoSpeed}
              min={0} max={63}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed"
              size="md"
              defaultValue={0}
            />
            <PixiKnob
              value={fred.vibratoDepth}
              min={0} max={63}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth"
              size="md"
              defaultValue={0}
            />
          </layoutContainer>
          <PixiLabel text="Depth in 1/64th semitone units. Speed = ticks per LFO step." size="xs" color="textMuted" />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
