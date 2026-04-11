/**
 * PixiOctaMEDPanel -- GL-native OctaMED SynthInstr instrument editor.
 *
 * Mirrors src/components/instruments/controls/OctaMEDControls.tsx 1:1:
 *   - Four tabs: Parameters, Vol Table, WF Table, Waveforms
 *   - Parameters tab: volume, voltblSpeed, wfSpeed, vibratoSpeed knobs,
 *     plus read-only loop start/length display
 *   - Vol Table tab: 128-byte vol command table bar chart
 *   - WF Table tab: 128-byte wf command table bar chart
 *   - Waveforms tab: per-waveform signed bipolar bar charts
 *
 * Mutations flow via onUpdate(instrumentId, { octamed: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { PixiNumericInput } from '../../components/PixiNumericInput';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { OctaMEDConfig } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const DISPLAY_W = 320;
const DISPLAY_H = 72;

type OMTab = 'params' | 'voltbl' | 'wftbl' | 'waveform';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiOctaMEDPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const med = instrument.octamed!;
  const [activeTab, setActiveTab] = useState<OMTab>('params');

  const medRef = useRef(med);
  useEffect(() => { medRef.current = med; }, [med]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof OctaMEDConfig>(key: K, value: OctaMEDConfig[K]) => {
      const cur = medRef.current;
      onUpdate(instrumentIdRef.current, {
        octamed: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  const tabs: { id: OMTab; label: string }[] = [
    { id: 'params', label: 'Parameters' },
    { id: 'voltbl', label: 'Vol Table' },
    { id: 'wftbl', label: 'WF Table' },
    { id: 'waveform', label: 'Waveforms' },
  ];

  // ── Bar chart renderers ──

  const drawVolTable = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      g.moveTo(0, DISPLAY_H - 1).lineTo(DISPLAY_W, DISPLAY_H - 1)
        .stroke({ color: theme.border.color, width: 1 });
      const data = med.voltbl;
      if (!data || data.length === 0) return;
      const barW = DISPLAY_W / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        let color = theme.textMuted.color;
        if (v === 0xFF) color = theme.accent.color;       // loop
        else if (v === 0xFE) color = theme.error.color;   // stop
        else if (v >= 0x80 && v <= 0xBF) color = theme.textSecondary.color; // wait
        else if (v > 0) color = theme.success.color;      // volume
        const h = (v / 255) * (DISPLAY_H - 2);
        g.rect(i * barW, DISPLAY_H - h - 1, Math.max(1, barW - 1), h).fill({ color });
      }
    },
    [med.voltbl, theme],
  );

  const drawWfTable = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      g.moveTo(0, DISPLAY_H - 1).lineTo(DISPLAY_W, DISPLAY_H - 1)
        .stroke({ color: theme.border.color, width: 1 });
      const data = med.wftbl;
      if (!data || data.length === 0) return;
      const barW = DISPLAY_W / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        let color = theme.textMuted.color;
        if (v === 0xFF) color = theme.accent.color;
        else if (v === 0xFE) color = theme.error.color;
        else if (v >= 0x80 && v <= 0xBF) color = theme.textSecondary.color;
        else if (v >= 0x00 && v <= 0x09) color = theme.success.color;
        const h = (v / 255) * (DISPLAY_H - 2);
        g.rect(i * barW, DISPLAY_H - h - 1, Math.max(1, barW - 1), h).fill({ color });
      }
    },
    [med.wftbl, theme],
  );

  const drawWaveform = useCallback(
    (wf: Int8Array) => (g: Graphics) => {
      g.clear();
      const mid = DISPLAY_H / 2;
      g.rect(0, 0, DISPLAY_W, DISPLAY_H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(DISPLAY_W, mid).stroke({ color: theme.border.color, width: 1 });
      if (!wf || wf.length === 0) return;
      const barW = DISPLAY_W / wf.length;
      for (let i = 0; i < wf.length; i++) {
        const v = wf[i];
        const scaled = (v / 128) * (mid - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        if (scaled >= 0) {
          g.rect(x, mid - scaled, w, scaled).fill({ color: theme.accent.color });
        } else {
          g.rect(x, mid, w, -scaled).fill({ color: theme.accent.color });
        }
      }
    },
    [theme.bg.color, theme.border.color, theme.accent.color],
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
        <PixiLabel text="OctaMED Synth" size="sm" weight="bold" color="custom" customColor={0x44AAFF} />
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
      {activeTab === 'params' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="PLAYBACK" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={med.volume}
              min={0} max={64} step={1}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume" size={KNOB_SIZE} defaultValue={64}
            />
            <PixiKnob
              value={med.voltblSpeed}
              min={0} max={15} step={1}
              onChange={(v) => upd('voltblSpeed', Math.round(v))}
              label="Vol Tbl Spd" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={med.wfSpeed}
              min={0} max={15} step={1}
              onChange={(v) => upd('wfSpeed', Math.round(v))}
              label="WF Speed" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={med.vibratoSpeed}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Vibrato Spd" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="LOOP (BYTES)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <PixiLabel text="Loop Start" size="xs" color="textMuted" />
              <PixiNumericInput
                value={med.loopStart}
                min={0}
                max={65534}
                step={2}
                onChange={(v) => upd('loopStart', Math.max(0, Math.round(v)))}
                width={70}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <PixiLabel text="Loop Length" size="xs" color="textMuted" />
              <PixiNumericInput
                value={med.loopLen}
                min={0}
                max={65534}
                step={2}
                onChange={(v) => upd('loopLen', Math.max(0, Math.round(v)))}
                width={70}
              />
            </layoutContainer>
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── VOL TABLE TAB ── */}
      {activeTab === 'voltbl' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VOL COMMAND TABLE (128 bytes)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingBottom: 4 }}>
            <PixiLabel text="FF=loop" size="xs" color="custom" customColor={theme.accent.color} />
            <PixiLabel text="FE=stop" size="xs" color="custom" customColor={theme.error.color} />
            <PixiLabel text="00-40=vol" size="xs" color="custom" customColor={theme.success.color} />
            <PixiLabel text="80-BF=wait" size="xs" color="textSecondary" />
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
            <pixiGraphics draw={drawVolTable} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── WF TABLE TAB ── */}
      {activeTab === 'wftbl' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="WF COMMAND TABLE (128 bytes)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingBottom: 4 }}>
            <PixiLabel text="FF=loop" size="xs" color="custom" customColor={theme.accent.color} />
            <PixiLabel text="FE=stop" size="xs" color="custom" customColor={theme.error.color} />
            <PixiLabel text="00-09=wave" size="xs" color="custom" customColor={theme.success.color} />
            <PixiLabel text="80-BF=wait" size="xs" color="textSecondary" />
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
            <pixiGraphics draw={drawWfTable} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── WAVEFORMS TAB ── */}
      {activeTab === 'waveform' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {med.waveforms.length === 0 && (
            <PixiLabel text="No waveforms defined." size="xs" color="textMuted" />
          )}
          {med.waveforms.map((wf, idx) => {
            const draw = drawWaveform(wf);
            return (
              <layoutContainer key={idx} layout={{ flexDirection: 'column', gap: 4 }}>
                <SectionHeading text={`WAVE ${idx + 1}`} />
                <layoutContainer
                  layout={{
                    width: DISPLAY_W,
                    height: DISPLAY_H,
                    borderWidth: 1,
                    borderColor: theme.border.color,
                    borderRadius: 4,
                  }}
                >
                  <pixiGraphics draw={draw} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
                </layoutContainer>
              </layoutContainer>
            );
          })}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
