/**
 * PixiDavidWhittakerPanel — GL-native David Whittaker instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/DavidWhittakerControls.tsx
 * 1:1 in structure: scalar knobs (volume, vibrato speed/depth), tuning display,
 * and read-only bar chart displays for volume and frequency sequences.
 *
 * Data shape: instrument.davidWhittaker (DavidWhittakerConfig). Mutations flow through
 * the shared onUpdate(instrumentId, { davidWhittaker: { ... } }) path.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { PixiKnob, PixiLabel } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;
const SEQ_W = 320;
const SEQ_H = 80;

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiDavidWhittakerPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const dw = instrument.davidWhittaker!;

  const dwRef = useRef(dw);
  useEffect(() => { dwRef.current = dw; }, [dw]);

  const updDW = useCallback(
    (key: string, value: number) => {
      onUpdate(instrument.id, {
        davidWhittaker: { ...instrument.davidWhittaker!, [key]: value },
      });
    },
    [instrument.id, instrument.davidWhittaker, onUpdate],
  );

  // ── Volume Sequence (unipolar bar chart, read-only) ──────────────────────
  const drawVolseq = useCallback(
    (g: Graphics) => {
      g.clear();
      const values = dw.volseq ?? [];
      const W = SEQ_W;
      const H = SEQ_H;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, H - 1).lineTo(W, H - 1).stroke({ color: theme.border.color, width: 1 });

      if (values.length === 0) return;

      // Clamp -128 loop markers to 0 for display (same as DOM editor)
      const visible = values.map((v) => Math.max(0, v));
      const maxVal = 64;
      const barW = W / visible.length;
      for (let i = 0; i < visible.length; i++) {
        const v = Math.min(maxVal, visible[i]);
        const h = (v / maxVal) * (H - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        g.rect(x, H - h - 1, w, h).fill({ color: theme.success.color });
      }
    },
    [dw.volseq, theme.bg.color, theme.border.color, theme.success.color],
  );

  // ── Frequency Sequence (bipolar bar chart, read-only) ────────────────────
  const drawFrqseq = useCallback(
    (g: Graphics) => {
      g.clear();
      const values = dw.frqseq ?? [];
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
    [dw.frqseq, theme.bg.color, theme.border.color, theme.accent.color],
  );

  const relVal = dw.relative ?? 8364;
  const approxHz = Math.round(3579545 / Math.max(1, relVal));

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
          text="David Whittaker"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* Volume & Tuning */}
      <SectionHeading text="VOLUME & TUNING" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
        <PixiKnob
          value={dw.defaultVolume ?? 64}
          min={0}
          max={64}
          onChange={(v) => updDW('defaultVolume', Math.round(v))}
          label="Volume"
          size={KNOB_SIZE}
          defaultValue={64}
        />
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel
            text={`Relative: ${relVal}`}
            size="xs"
            color="custom"
            customColor={theme.accent.color}
          />
          <PixiLabel
            text={`3579545 / ${relVal} = ${approxHz} Hz`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      </layoutContainer>

      {/* Vibrato */}
      <SectionHeading text="VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={dw.vibratoSpeed ?? 0}
          min={0}
          max={255}
          onChange={(v) => updDW('vibratoSpeed', Math.round(v))}
          label="Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={dw.vibratoDepth ?? 0}
          min={0}
          max={255}
          onChange={(v) => updDW('vibratoDepth', Math.round(v))}
          label="Depth"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Volume Sequence */}
      <SectionHeading text="VOLUME SEQUENCE (0-64)" />
      {(dw.volseq?.length ?? 0) > 0 ? (
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
            <pixiGraphics draw={drawVolseq} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={`volseq length: ${dw.volseq?.length ?? 0}`}
            size="xs"
            color="textMuted"
          />
        </>
      ) : (
        <PixiLabel text="No volume sequence" size="xs" color="textMuted" />
      )}

      {/* Frequency Sequence */}
      <SectionHeading text="FREQUENCY SEQUENCE (SEMITONES)" />
      {(dw.frqseq?.length ?? 0) > 0 ? (
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
            <pixiGraphics draw={drawFrqseq} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={`frqseq length: ${dw.frqseq?.length ?? 0}`}
            size="xs"
            color="textMuted"
          />
        </>
      ) : (
        <PixiLabel text="No frequency sequence" size="xs" color="textMuted" />
      )}
    </layoutContainer>
  );
};
