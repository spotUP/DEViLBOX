/**
 * PixiRobHubbardPanel — GL-native Rob Hubbard instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/RobHubbardControls.tsx
 * 1:1 in structure: sample knobs (volume), vibrato knobs (divider, startIndex),
 * wobble knobs (upper/lower), tuning display, and read-only bar charts for
 * vibrato wave table and sample waveform.
 *
 * Data shape: instrument.robHubbard (RobHubbardConfig). Mutations flow through the
 * shared onUpdate(instrumentId, { robHubbard: { ... } }) path.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { PixiKnob, PixiLabel } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const SEQ_W = 320;
const SEQ_H = 64;

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiRobHubbardPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const rh = instrument.robHubbard!;

  const rhRef = useRef(rh);
  useEffect(() => { rhRef.current = rh; }, [rh]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const updRH = useCallback(
    (key: string, value: number | number[]) => {
      onUpdate(instrument.id, {
        robHubbard: { ...instrument.robHubbard!, [key]: value },
      });
    },
    [instrument.id, instrument.robHubbard, onUpdate],
  );

  // ── Vibrato wave table (bipolar bar chart, read-only) ────────────────────
  const drawVibTable = useCallback(
    (g: Graphics) => {
      g.clear();
      const values = rh.vibTable ?? [];
      const W = SEQ_W;
      const H = SEQ_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      if (values.length === 0) return;

      let maxMag = 1;
      for (const v of values) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }
      if (maxMag < 12) maxMag = 12;

      const barW = W / values.length;
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const scaled = (v / maxMag) * (mid - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        if (scaled >= 0) {
          g.rect(x, mid - scaled, w, scaled).fill({ color: theme.accent.color });
        } else {
          g.rect(x, mid, w, -scaled).fill({ color: theme.accent.color });
        }
      }
    },
    [rh.vibTable, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // ── Sample waveform (unipolar line chart, read-only) ─────────────────────
  const drawSampleWaveform = useCallback(
    (g: Graphics) => {
      g.clear();
      const raw = rh.sampleData ?? [];
      const W = SEQ_W;
      const H = SEQ_H;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });

      if (raw.length === 0) return;

      // Subsample to max 512 points
      const MAX_POINTS = 512;
      const stride = Math.max(1, Math.ceil(raw.length / MAX_POINTS));
      const samples: number[] = [];
      for (let i = 0; i < raw.length; i += stride) {
        samples.push(raw[i] & 0xff);
      }

      const stepX = W / samples.length;
      g.moveTo(0, H - (samples[0] / 255) * H);
      for (let i = 1; i < samples.length; i++) {
        g.lineTo(i * stepX, H - (samples[i] / 255) * H);
      }
      g.stroke({ color: theme.success.color, width: 1 });
    },
    [rh.sampleData, theme.bg.color, theme.success.color],
  );

  const approxHz = Math.round(3579545 / Math.max(1, rh.relative));

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
          text="Rob Hubbard"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* Sample */}
      <SectionHeading text="SAMPLE" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={rh.sampleVolume}
          min={0}
          max={64}
          onChange={(v) => updRH('sampleVolume', Math.round(v))}
          label="Volume"
          size={KNOB_SIZE}
          defaultValue={64}
        />
        <layoutContainer layout={{ flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
          <PixiLabel
            text={`Loop: ${rh.loopOffset < 0 ? 'No loop' : rh.loopOffset.toString()}`}
            size="xs"
            color="textSecondary"
          />
          <PixiLabel
            text={`Length: ${rh.sampleLen} bytes`}
            size="xs"
            color="textSecondary"
          />
        </layoutContainer>
      </layoutContainer>

      {/* Vibrato */}
      <SectionHeading text="VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={rh.divider}
          min={0}
          max={255}
          onChange={(v) => updRH('divider', Math.round(v))}
          label="Depth Div"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={rh.vibratoIdx}
          min={0}
          max={255}
          onChange={(v) => updRH('vibratoIdx', Math.round(v))}
          label="Start Idx"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Wobble */}
      <SectionHeading text="WOBBLE" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={rh.hiPos}
          min={0}
          max={255}
          onChange={(v) => updRH('hiPos', Math.round(v))}
          label="Upper"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={rh.loPos}
          min={0}
          max={255}
          onChange={(v) => updRH('loPos', Math.round(v))}
          label="Lower"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Tuning */}
      <SectionHeading text="TUNING" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 8, paddingTop: 4, alignItems: 'center' }}>
        <PixiLabel
          text={`Relative: ${rh.relative}`}
          size="xs"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel
          text={`3579545 / ${rh.relative} = ${approxHz} Hz`}
          size="xs"
          color="textMuted"
        />
      </layoutContainer>

      {/* Vibrato Wave Table */}
      <SectionHeading text="VIBRATO WAVE TABLE" />
      {(rh.vibTable?.length ?? 0) > 0 ? (
        <>
          <layoutContainer
            layout={{
              width: SEQ_W,
              height: SEQ_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawVibTable} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${rh.vibTable?.length ?? 0} entries, start index: ${rh.vibratoIdx}`}
            size="xs"
            color="textMuted"
          />
        </>
      ) : (
        <PixiLabel text="No vibrato table data" size="xs" color="textMuted" />
      )}

      {/* Sample Waveform */}
      <SectionHeading text="SAMPLE WAVEFORM" />
      {(rh.sampleData?.length ?? 0) > 0 ? (
        <>
          <layoutContainer
            layout={{
              width: SEQ_W,
              height: SEQ_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawSampleWaveform} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${rh.sampleLen} bytes (read-only)`}
            size="xs"
            color="textMuted"
          />
        </>
      ) : (
        <PixiLabel text="No sample data" size="xs" color="textMuted" />
      )}
    </layoutContainer>
  );
};
