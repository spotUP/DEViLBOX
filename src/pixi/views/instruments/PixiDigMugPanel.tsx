/**
 * PixiDigMugPanel -- GL-native Digital Mugician (V1/V2) instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/DigMugControls.tsx:
 *   - Header: "Digital Mugician" + instrument name
 *   - Synth section: volume, waveBlend, waveSpeed, vibSpeed, vibDepth, arpSpeed knobs
 *     + wavetable selector (4 slots) + waveformData display (read-only pixiGraphics)
 *   - PCM section: loopStart / loopLength numeric inputs, pcmData preview (read-only)
 *   - Type discrimination: waveformData present = synth, pcmData present = PCM
 *
 * Data shape: instrument.digMug (DigMugConfig). Mutations flow through
 * onUpdate(instrumentId, { digMug: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { PixiKnob, PixiLabel, PixiSelect, PixiNumericInput } from '../../components';
import type { SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DigMugConfig } from '@/types/instrument/exotic';
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

// Built-in Digital Mugician waveform names (mirrors DOM DM_WAVES)
const DM_WAVE_NAMES = [
  'Sine', 'Triangle', 'Sawtooth', 'Square', 'Pulse 25%', 'Pulse 12%',
  'Noise', 'Organ 1', 'Organ 2', 'Brass', 'String', 'Bell', 'Piano',
  'Flute', 'Reed',
];

const WAVE_OPTIONS: SelectOption[] = DM_WAVE_NAMES.map((name, i) => ({
  value: String(i),
  label: `${i}: ${name}`,
}));

const WAVE_W = 300;
const WAVE_H = 80;

export const PixiDigMugPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const dm = instrument.digMug!;

  // Ref pattern to avoid stale closures during rapid knob drags
  const dmRef = useRef(dm);
  useEffect(() => { dmRef.current = dm; }, [dm]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const updDM = useCallback(
    <K extends keyof DigMugConfig>(key: K, value: DigMugConfig[K]) => {
      onUpdate(instrumentIdRef.current, {
        digMug: { ...dmRef.current, [key]: value },
      });
    },
    [onUpdate],
  );

  const updateWavetable = useCallback(
    (slot: 0 | 1 | 2 | 3, value: number) => {
      const wt = [...dmRef.current.wavetable] as [number, number, number, number];
      wt[slot] = value;
      onUpdate(instrumentIdRef.current, {
        digMug: { ...dmRef.current, wavetable: wt },
      });
    },
    [onUpdate],
  );

  // -- Synth waveform display (read-only) --
  const hasWaveform = !!dm.waveformData;
  const hasPcm = !!dm.pcmData;

  const drawWaveform = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = WAVE_W;
      const H = WAVE_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const wf = dm.waveformData;
      if (!wf || wf.length === 0) return;

      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.floor((x / W) * wf.length) % wf.length;
        const s = wf[idx] > 127 ? wf[idx] - 256 : wf[idx];
        const y = mid - (s / 128) * (mid - 4);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ color: theme.accent.color, width: 2 });
    },
    [dm.waveformData, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // -- PCM preview display (read-only) --
  const drawPcm = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = WAVE_W;
      const H = WAVE_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const pcm = dm.pcmData;
      if (!pcm || pcm.length === 0) return;

      // Loop region shading
      const loopStart = dm.loopStart ?? 0;
      const loopLength = dm.loopLength ?? 0;
      if (loopLength > 0) {
        const x0 = Math.floor((loopStart / pcm.length) * W);
        const x1 = Math.min(W, Math.floor(((loopStart + loopLength) / pcm.length) * W));
        g.rect(x0, 0, Math.max(1, x1 - x0), H).fill({ color: theme.accent.color, alpha: 0.1 });
        g.moveTo(x0 + 0.5, 0).lineTo(x0 + 0.5, H).stroke({ color: theme.accent.color, width: 1 });
        g.moveTo(x1 - 0.5, 0).lineTo(x1 - 0.5, H).stroke({ color: theme.accent.color, width: 1 });
      }

      // Min/max envelope per pixel column
      const step = Math.max(1, Math.floor(pcm.length / W));
      for (let x = 0; x < W; x++) {
        let min = 127;
        let max = -128;
        const start = Math.floor((x / W) * pcm.length);
        const end = Math.min(pcm.length, start + step);
        for (let i = start; i < end; i++) {
          const s = pcm[i] > 127 ? pcm[i] - 256 : pcm[i];
          if (s < min) min = s;
          if (s > max) max = s;
        }
        const yMin = mid - (max / 128) * (mid - 2);
        const yMax = mid - (min / 128) * (mid - 2);
        g.moveTo(x + 0.5, yMin).lineTo(x + 0.5, yMax).stroke({ color: theme.accent.color, width: 1 });
      }
    },
    [dm.pcmData, dm.loopStart, dm.loopLength, theme.bg.color, theme.border.color, theme.accent.color],
  );

  const pcmLen = dm.pcmData?.length ?? 0;

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
          text="Digital Mugician"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* Wavetable Slots */}
      <SectionHeading text="WAVETABLE SLOTS (4 WAVES)" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {([0, 1, 2, 3] as const).map((slot) => (
          <layoutContainer key={slot} layout={{ flexDirection: 'column', gap: 2, minWidth: 100 }}>
            <PixiLabel text={`Wave ${slot + 1}`} size="xs" color="textMuted" />
            <PixiSelect
              options={WAVE_OPTIONS}
              value={String(dm.wavetable[slot])}
              onChange={(v) => updateWavetable(slot, parseInt(v))}
              width={100}
            />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* Blend & Morph knobs */}
      <SectionHeading text="BLEND & MORPH" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={dm.waveBlend}
          min={0}
          max={63}
          onChange={(v) => updDM('waveBlend', Math.round(v))}
          label="Blend Pos"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={dm.waveSpeed}
          min={0}
          max={63}
          onChange={(v) => updDM('waveSpeed', Math.round(v))}
          label="Morph Spd"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Volume & Vibrato */}
      <SectionHeading text="VOLUME & VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={dm.volume}
          min={0}
          max={64}
          onChange={(v) => updDM('volume', Math.round(v))}
          label="Volume"
          size={KNOB_SIZE}
          defaultValue={64}
        />
        <PixiKnob
          value={dm.vibSpeed}
          min={0}
          max={63}
          onChange={(v) => updDM('vibSpeed', Math.round(v))}
          label="Vib Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={dm.vibDepth}
          min={0}
          max={63}
          onChange={(v) => updDM('vibDepth', Math.round(v))}
          label="Vib Depth"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={dm.arpSpeed}
          min={0}
          max={15}
          onChange={(v) => updDM('arpSpeed', Math.round(v))}
          label="Arp Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Synth Waveform Display (read-only) */}
      {hasWaveform && (
        <>
          <SectionHeading text="SYNTH WAVEFORM" />
          <layoutContainer
            layout={{
              width: WAVE_W,
              height: WAVE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWaveform} layout={{ width: WAVE_W, height: WAVE_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${dm.waveformData?.length ?? 0} bytes (signed 8-bit)`}
            size="xs"
            color="textMuted"
          />
        </>
      )}

      {/* PCM Sample Preview (read-only) */}
      {hasPcm && (
        <>
          <SectionHeading text="PCM SAMPLE (READ-ONLY)" />
          <layoutContainer
            layout={{
              width: WAVE_W,
              height: WAVE_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawPcm} layout={{ width: WAVE_W, height: WAVE_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${pcmLen.toLocaleString()} bytes`}
            size="xs"
            color="textMuted"
          />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2, minWidth: 100 }}>
              <PixiLabel text="Loop Start" size="xs" color="textMuted" />
              <PixiNumericInput
                value={dm.loopStart ?? 0}
                min={0}
                max={pcmLen}
                step={1}
                onChange={(v) => updDM('loopStart', Math.max(0, Math.min(pcmLen, Math.floor(v))))}
                width={100}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', gap: 2, minWidth: 100 }}>
              <PixiLabel text="Loop Length" size="xs" color="textMuted" />
              <PixiNumericInput
                value={dm.loopLength ?? 0}
                min={0}
                max={Math.max(0, pcmLen - (dm.loopStart ?? 0))}
                step={1}
                onChange={(v) => updDM('loopLength', Math.max(0, Math.min(Math.max(0, pcmLen - (dm.loopStart ?? 0)), Math.floor(v))))}
                width={100}
              />
            </layoutContainer>
          </layoutContainer>
          <PixiLabel
            text={`Loop end: ${((dm.loopStart ?? 0) + (dm.loopLength ?? 0)).toLocaleString()} / ${pcmLen.toLocaleString()}`}
            size="xs"
            color="textMuted"
          />
        </>
      )}

      {/* No sample data */}
      {!hasWaveform && !hasPcm && (
        <layoutContainer layout={{ padding: 12 }}>
          <PixiLabel text="No sample data on this instrument." size="xs" color="textMuted" />
        </layoutContainer>
      )}

      {/* Arpeggio table (read-only bar chart) */}
      <SectionHeading text="ARPEGGIO TABLE" />
      <layoutContainer
        layout={{
          width: WAVE_W,
          height: 60,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        <pixiGraphics
          draw={useCallback(
            (g: Graphics) => {
              g.clear();
              const W = WAVE_W;
              const H = 60;
              const mid = H / 2;

              g.rect(0, 0, W, H).fill({ color: theme.bg.color });
              g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

              const arp = dm.arpTable;
              if (!arp || arp.length === 0) return;

              let maxMag = 1;
              for (const v of arp) {
                const a = Math.abs(v);
                if (a > maxMag) maxMag = a;
              }
              if (maxMag < 12) maxMag = 12;

              const barW = W / arp.length;
              for (let i = 0; i < arp.length; i++) {
                const v = arp[i] > 127 ? arp[i] - 256 : arp[i];
                const scaled = (v / maxMag) * (mid - 2);
                const x = i * barW;
                const w = Math.max(1, barW - 1);
                if (scaled >= 0) {
                  g.rect(x, mid - scaled, w, Math.max(1, scaled)).fill({ color: theme.success.color });
                } else {
                  g.rect(x, mid, w, Math.max(1, -scaled)).fill({ color: theme.success.color });
                }
              }
            },
            [dm.arpTable, theme.bg.color, theme.border.color, theme.success.color],
          )}
          layout={{ width: WAVE_W, height: 60 }}
        />
      </layoutContainer>
      <PixiLabel
        text={`${dm.arpTable?.length ?? 0} entries`}
        size="xs"
        color="textMuted"
      />
    </layoutContainer>
  );
};
