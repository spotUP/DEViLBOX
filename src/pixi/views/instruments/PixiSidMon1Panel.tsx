/**
 * PixiSidMon1Panel -- GL-native SidMon 1 instrument editor.
 *
 * Mirrors src/components/instruments/controls/SidMon1Controls.tsx 1:1:
 *   - Three tabs: Parameters, Arpeggio, Waveform
 *   - Parameters tab: ADSR envelope knobs (attackSpeed/attackMax/decaySpeed/decayMin/
 *     sustain/releaseSpeed/releaseMin), phase oscillator (phaseShift/phaseSpeed),
 *     tuning (finetune/pitchFall)
 *   - Arpeggio tab: 16-step arpeggio bar chart display
 *   - Waveform tab: mainWave + phaseWave 32-byte bar chart displays
 *
 * Mutations flow via onUpdate(instrumentId, { sidmon1: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SidMon1Config } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const DISPLAY_W = 320;
const DISPLAY_H = 72;

type SM1Tab = 'main' | 'arpeggio' | 'waveform';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiSidMon1Panel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const sm1 = instrument.sidmon1!;
  const [activeTab, setActiveTab] = useState<SM1Tab>('main');

  const sm1Ref = useRef(sm1);
  useEffect(() => { sm1Ref.current = sm1; }, [sm1]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof SidMon1Config>(key: K, value: SidMon1Config[K]) => {
      const cur = sm1Ref.current;
      onUpdate(instrumentIdRef.current, {
        sidmon1: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  const tabs: { id: SM1Tab; label: string }[] = [
    { id: 'main', label: 'Parameters' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'waveform', label: 'Waveform' },
  ];

  // ── Bar chart renderers ──

  const drawUnipolarBars = useCallback(
    (values: number[] | undefined, color: number, max: number) => (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      g.moveTo(0, DISPLAY_H - 1).lineTo(DISPLAY_W, DISPLAY_H - 1)
        .stroke({ color: theme.border.color, width: 1 });
      if (!values || values.length === 0) return;
      const barW = DISPLAY_W / values.length;
      for (let i = 0; i < values.length; i++) {
        const v = Math.max(0, Math.min(max, values[i]));
        const h = (v / max) * (DISPLAY_H - 2);
        g.rect(i * barW, DISPLAY_H - h - 1, Math.max(1, barW - 1), h).fill({ color });
      }
    },
    [theme.bg.color, theme.border.color],
  );

  const drawBipolarBars = useCallback(
    (values: number[] | undefined, color: number) => (g: Graphics) => {
      g.clear();
      const mid = DISPLAY_H / 2;
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
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
  const drawArpeggio = useCallback(
    drawUnipolarBars(sm1.arpeggio, theme.accent.color, 255),
    [sm1.arpeggio, drawUnipolarBars, theme.accent.color],
  );

  const drawMainWave = useCallback(
    drawBipolarBars(sm1.mainWave, theme.accent.color),
    [sm1.mainWave, drawBipolarBars, theme.accent.color],
  );

  const drawPhaseWave = useCallback(
    drawBipolarBars(sm1.phaseWave, theme.success.color),
    [sm1.phaseWave, drawBipolarBars, theme.success.color],
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
        <PixiLabel text="SidMon 1" size="sm" weight="bold" color="custom" customColor={0x44AAFF} />
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

      {/* ── PARAMETERS TAB ── */}
      {activeTab === 'main' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ADSR ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={sm1.attackSpeed ?? 0}
              min={0} max={255}
              onChange={(v) => upd('attackSpeed', Math.round(v))}
              label="Atk Speed" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.attackMax ?? 0}
              min={0} max={64}
              onChange={(v) => upd('attackMax', Math.round(v))}
              label="Atk Max" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.decaySpeed ?? 0}
              min={0} max={255}
              onChange={(v) => upd('decaySpeed', Math.round(v))}
              label="Dec Speed" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.decayMin ?? 0}
              min={0} max={64}
              onChange={(v) => upd('decayMin', Math.round(v))}
              label="Dec Min" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={sm1.sustain ?? 0}
              min={0} max={255}
              onChange={(v) => upd('sustain', Math.round(v))}
              label="Sustain" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.releaseSpeed ?? 0}
              min={0} max={255}
              onChange={(v) => upd('releaseSpeed', Math.round(v))}
              label="Rel Speed" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.releaseMin ?? 0}
              min={0} max={64}
              onChange={(v) => upd('releaseMin', Math.round(v))}
              label="Rel Min" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="PHASE OSCILLATOR" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sm1.phaseShift ?? 0}
              min={0} max={255}
              onChange={(v) => upd('phaseShift', Math.round(v))}
              label="Phase Shift" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.phaseSpeed ?? 0}
              min={0} max={255}
              onChange={(v) => upd('phaseSpeed', Math.round(v))}
              label="Phase Speed" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="TUNING" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sm1.finetune ?? 0}
              min={0} max={1005} step={67}
              onChange={(v) => {
                const steps = Math.round(v / 67);
                upd('finetune', steps * 67);
              }}
              label="Finetune" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sm1.pitchFall ?? 0}
              min={-128} max={127}
              onChange={(v) => upd('pitchFall', Math.round(v))}
              label="Pitch Fall" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── ARPEGGIO TAB ── */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ARPEGGIO (16 steps)" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawArpeggio} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── WAVEFORM TAB ── */}
      {activeTab === 'waveform' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="MAIN WAVE (32 bytes, signed)" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawMainWave} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>

          <SectionHeading text="PHASE WAVE (32 bytes, signed)" />
          <layoutContainer
            layout={{
              width: DISPLAY_W,
              height: DISPLAY_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawPhaseWave} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
