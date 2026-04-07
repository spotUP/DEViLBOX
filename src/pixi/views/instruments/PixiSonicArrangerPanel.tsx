/**
 * PixiSonicArrangerPanel — GL-native Sonic Arranger instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/SonicArrangerControls.tsx.
 * The DOM editor uses 3 tabs (synthesis, envelope, modulation); the GL panel folds
 * them into stacked SectionHeading sections for a simpler scroll layout.
 *
 * Data shape: instrument.sonicArranger (SonicArrangerConfig). Mutations flow through
 * onUpdate(instrumentId, { sonicArranger: { ... } }) — the store handles any UADE
 * chip-RAM propagation downstream.
 *
 * The ADSR / AMF / waveform / arpeggio displays are read-only bar-charts for this
 * phase. Live drag-edit is a follow-up that would mirror the JamCracker AM waveform
 * drag editor.
 */

import React, { useCallback } from 'react';
import { PixiKnob, PixiLabel } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const DISPLAY_W = 320;
const DISPLAY_H = 72;
const WAVE_H = 80;

// ── Effect label helpers (mirror DOM editor's arg labels) ───────────────────
function arg1Label(effect: number): string {
  switch (effect) {
    case 0: return 'Off';
    case 1: return 'Speed';     // waveform filter
    case 2: return 'Low Lim';
    case 3: return 'Low Lim';
    case 4: return 'Delay';
    default: return 'Arg1';
  }
}
function arg2Label(effect: number): string {
  switch (effect) {
    case 0: return '-';
    case 1: return 'Count';
    case 2: return 'Hi Lim';
    case 3: return 'Hi Lim';
    case 4: return 'Mix';
    default: return 'Arg2';
  }
}
function arg3Label(effect: number): string {
  switch (effect) {
    case 0: return '-';
    case 1: return 'Mode';
    case 2: return 'Speed';
    case 3: return 'Speed';
    case 4: return 'Source';
    default: return 'Arg3';
  }
}

export const PixiSonicArrangerPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const sa = instrument.sonicArranger!;

  const updSA = useCallback(
    (key: string, value: number) => {
      onUpdate(instrument.id, {
        sonicArranger: { ...instrument.sonicArranger!, [key]: value },
      });
    },
    [instrument.id, instrument.sonicArranger, onUpdate],
  );

  // ── Bar chart renderers (read-only) ────────────────────────────────────────

  const drawUnipolarBars = useCallback(
    (values: number[] | undefined, color: number, max: number) => (g: Graphics) => {
      g.clear();
      const W = DISPLAY_W;
      const H = DISPLAY_H;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, H - 1).lineTo(W, H - 1).stroke({ color: theme.border.color, width: 1 });

      if (!values || values.length === 0) return;
      const barW = W / values.length;
      for (let i = 0; i < values.length; i++) {
        const v = Math.max(0, Math.min(max, values[i]));
        const h = (v / max) * (H - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        g.rect(x, H - h - 1, w, h).fill({ color });
      }
    },
    [theme.bg.color, theme.border.color],
  );

  const drawBipolarBars = useCallback(
    (values: number[] | undefined, color: number) => (g: Graphics) => {
      g.clear();
      const W = DISPLAY_W;
      const H = DISPLAY_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      if (!values || values.length === 0) return;
      let maxMag = 1;
      for (const v of values) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }
      const barW = W / values.length;
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

  const drawWaveform = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = DISPLAY_W;
      const H = WAVE_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const wf = sa.waveformData;
      if (!wf || wf.length === 0) return;
      const len = wf.length;
      for (let x = 0; x < W; x++) {
        const idx = Math.floor((x / W) * len) % len;
        const s = wf[idx]; // signed -128..127 already
        const y = mid - (s / 128) * (mid - 2);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color: theme.accent.color, width: 2 });
    },
    [sa.waveformData, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // Memoized draw callbacks for the tables
  const drawAdsr = useCallback(drawUnipolarBars(sa.adsrTable, theme.success.color, 64), [
    sa.adsrTable,
    drawUnipolarBars,
    theme.success.color,
  ]);
  const drawAmf = useCallback(drawBipolarBars(sa.amfTable, 0xF472B6 /* pink */), [
    sa.amfTable,
    drawBipolarBars,
  ]);

  const drawArp = useCallback(
    (values: number[] | undefined) => drawBipolarBars(values, theme.warning.color),
    [drawBipolarBars, theme.warning.color],
  );
  const drawArp0 = useCallback(drawArp(sa.arpeggios?.[0]?.values), [sa.arpeggios, drawArp]);
  const drawArp1 = useCallback(drawArp(sa.arpeggios?.[1]?.values), [sa.arpeggios, drawArp]);
  const drawArp2 = useCallback(drawArp(sa.arpeggios?.[2]?.values), [sa.arpeggios, drawArp]);

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
        <PixiLabel
          text="Sonic Arranger"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name || sa.name || ''} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* ── SYNTHESIS ───────────────────────────────────────────────────────── */}
      <SectionHeading text="SYNTHESIS EFFECT" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.effect}
          min={0}
          max={4}
          onChange={(v) => updSA('effect', Math.round(v))}
          label="Effect"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.effectArg1}
          min={0}
          max={127}
          onChange={(v) => updSA('effectArg1', Math.round(v))}
          label={arg1Label(sa.effect)}
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.effectArg2}
          min={0}
          max={127}
          onChange={(v) => updSA('effectArg2', Math.round(v))}
          label={arg2Label(sa.effect)}
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.effectArg3}
          min={0}
          max={127}
          onChange={(v) => updSA('effectArg3', Math.round(v))}
          label={arg3Label(sa.effect)}
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.effectDelay}
          min={1}
          max={255}
          onChange={(v) => updSA('effectDelay', Math.round(v))}
          label="Eff Speed"
          size={KNOB_SIZE}
          defaultValue={1}
        />
      </layoutContainer>

      <SectionHeading text="WAVEFORM" />
      <layoutContainer
        layout={{
          width: DISPLAY_W,
          height: WAVE_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawWaveform} layout={{ width: DISPLAY_W, height: WAVE_H }} />
      </layoutContainer>

      {/* ── ENVELOPE ────────────────────────────────────────────────────────── */}
      <SectionHeading text="VOLUME & TUNING" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.volume}
          min={0}
          max={64}
          onChange={(v) => updSA('volume', Math.round(v))}
          label="Volume"
          size={KNOB_SIZE}
          defaultValue={64}
        />
        <PixiKnob
          value={sa.fineTuning}
          min={-128}
          max={127}
          onChange={(v) => updSA('fineTuning', Math.round(v))}
          label="Fine Tune"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      <SectionHeading text="ADSR ENVELOPE" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.adsrNumber}
          min={0}
          max={255}
          onChange={(v) => updSA('adsrNumber', Math.round(v))}
          label="Number"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.adsrDelay}
          min={0}
          max={255}
          onChange={(v) => updSA('adsrDelay', Math.round(v))}
          label="Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.adsrLength}
          min={0}
          max={127}
          onChange={(v) => updSA('adsrLength', Math.round(v))}
          label="Length"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.adsrRepeat}
          min={0}
          max={127}
          onChange={(v) => updSA('adsrRepeat', Math.round(v))}
          label="Repeat"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.sustainPoint}
          min={0}
          max={127}
          onChange={(v) => updSA('sustainPoint', Math.round(v))}
          label="Sus Pt"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.sustainDelay}
          min={0}
          max={255}
          onChange={(v) => updSA('sustainDelay', Math.round(v))}
          label="Sus Dly"
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
        <pixiGraphics draw={drawAdsr} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
      </layoutContainer>

      <SectionHeading text="AMF (PITCH MODULATION)" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.amfNumber}
          min={0}
          max={255}
          onChange={(v) => updSA('amfNumber', Math.round(v))}
          label="Number"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.amfDelay}
          min={0}
          max={255}
          onChange={(v) => updSA('amfDelay', Math.round(v))}
          label="Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.amfLength}
          min={0}
          max={127}
          onChange={(v) => updSA('amfLength', Math.round(v))}
          label="Length"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.amfRepeat}
          min={0}
          max={127}
          onChange={(v) => updSA('amfRepeat', Math.round(v))}
          label="Repeat"
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
        <pixiGraphics draw={drawAmf} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
      </layoutContainer>

      {/* ── MODULATION ──────────────────────────────────────────────────────── */}
      <SectionHeading text="VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.vibratoDelay}
          min={0}
          max={255}
          onChange={(v) => updSA('vibratoDelay', Math.round(v))}
          label="Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.vibratoSpeed}
          min={0}
          max={65535}
          onChange={(v) => updSA('vibratoSpeed', Math.round(v))}
          label="Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={sa.vibratoLevel}
          min={0}
          max={65535}
          onChange={(v) => updSA('vibratoLevel', Math.round(v))}
          label="Level"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      <SectionHeading text="PORTAMENTO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={sa.portamentoSpeed}
          min={0}
          max={65535}
          onChange={(v) => updSA('portamentoSpeed', Math.round(v))}
          label="Porta Spd"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      <SectionHeading text="ARPEGGIO 1" />
      <layoutContainer
        layout={{
          width: DISPLAY_W,
          height: DISPLAY_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawArp0} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
      </layoutContainer>

      <SectionHeading text="ARPEGGIO 2" />
      <layoutContainer
        layout={{
          width: DISPLAY_W,
          height: DISPLAY_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawArp1} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
      </layoutContainer>

      <SectionHeading text="ARPEGGIO 3" />
      <layoutContainer
        layout={{
          width: DISPLAY_W,
          height: DISPLAY_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics draw={drawArp2} layout={{ width: DISPLAY_W, height: DISPLAY_H }} />
      </layoutContainer>
    </layoutContainer>
  );
};
