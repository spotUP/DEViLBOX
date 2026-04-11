/**
 * PixiHippelCoSoPanel — GL-native Hippel CoSo instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/HippelCoSoControls.tsx
 * 1:1 in structure: scalar knobs (volSpeed, vibSpeed, vibDepth, vibDelay) + drag-to-
 * edit bar-chart displays for the frequency and volume sequences.
 *
 * Data shape: instrument.hippelCoso (HippelCoSoConfig). Mutations flow through the
 * shared onUpdate(instrumentId, { hippelCoso: { ... } }) path. The underlying store
 * handles any UADE chip RAM propagation — this panel never touches UADEChipEditor
 * directly (same policy as the DOM editor's updU8WithChipRam path).
 *
 * Both fseq and vseq displays are interactive: click-and-drag to draw a new
 * sequence using the shared writeBipolarBar/writeUnipolarBar helpers in
 * src/lib/pixi/barChartDraw.ts. Terminator sentinels (-31..-25 for fseq,
 * -128 loop markers for vseq) are skipped by the writer so end-of-sequence
 * positions are preserved during a drag.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiNumericInput } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { Graphics, FederatedPointerEvent, Container } from 'pixi.js';
import { writeBipolarBar, writeUnipolarBar } from '@/lib/pixi/barChartDraw';
import { HippelCoSoSynth } from '@/engine/hippelcoso/HippelCoSoSynth';

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

export const PixiHippelCoSoPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const hc = instrument.hippelCoso!;

  // ── Preview synth ──────────────────────────────────────────────────────────
  const [previewNote, setPreviewNote] = useState(48);
  const previewSynthRef = useRef<HippelCoSoSynth | null>(null);

  useEffect(() => {
    return () => {
      previewSynthRef.current?.dispose();
      previewSynthRef.current = null;
    };
  }, []);

  const handlePreview = useCallback(async () => {
    const cfg = instrument.hippelCoso;
    if (!cfg) return;
    let synth = previewSynthRef.current;
    if (!synth) {
      synth = new HippelCoSoSynth();
      previewSynthRef.current = synth;
      synth.output.connect(synth.output.context.destination);
    }
    await synth.setInstrument(cfg);
    synth.triggerAttack(previewNote);
    setTimeout(() => synth!.triggerRelease(), 800);
  }, [instrument.hippelCoso, previewNote]);

  const updHC = useCallback(
    (key: string, value: number) => {
      onUpdate(instrument.id, {
        hippelCoso: { ...instrument.hippelCoso!, [key]: value },
      });
    },
    [instrument.id, instrument.hippelCoso, onUpdate],
  );

  // ── Drag state for interactive bar charts ──────────────────────────────────
  // Refs mirror the JamCracker AM-waveform drag pattern: hcRef keeps the latest
  // config so pointer callbacks never read stale data mid-drag, fseq/vseqDrag
  // track whether a drag is active and the last written index.
  const hcRef = useRef(hc);
  useEffect(() => { hcRef.current = hc; }, [hc]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const fseqDrawing = useRef(false);
  const fseqLastIdx = useRef(-1);
  const vseqDrawing = useRef(false);
  const vseqLastIdx = useRef(-1);

  // Compute bipolar maxMag exactly as the fseq renderer does so the drag
  // amplitude matches what the user sees on screen.
  const computeFseqMaxMag = useCallback((values: number[]): number => {
    let maxMag = 1;
    for (const v of values) {
      if (v <= -25 && v >= -31) continue;
      const a = Math.abs(v);
      if (a > maxMag) maxMag = a;
    }
    if (maxMag < 12) maxMag = 12;
    return maxMag;
  }, []);

  // ── Bar chart renderers for fseq/vseq ──────────────────────────────────────

  const SEQ_W = 320;
  const SEQ_H = 80;

  const drawBipolarBars = useCallback(
    (values: number[], color: number) => (g: Graphics) => {
      g.clear();
      const W = SEQ_W;
      const H = SEQ_H;
      const mid = H / 2;

      // Background
      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      // Zero line
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      if (!values || values.length === 0) return;

      // Determine magnitude (clamp -128..127). Filter out terminator sentinels -31..-25.
      const visible = values.filter((v) => !(v <= -25 && v >= -31));
      if (visible.length === 0) return;

      let maxMag = 1;
      for (const v of visible) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }
      // Round up to a nice max (at least 12 semitones for fseq look)
      if (maxMag < 12) maxMag = 12;

      const barW = W / visible.length;
      for (let i = 0; i < visible.length; i++) {
        const v = visible[i];
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

  const drawUnipolarBars = useCallback(
    (values: number[], color: number, max: number) => (g: Graphics) => {
      g.clear();
      const W = SEQ_W;
      const H = SEQ_H;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, H - 1).lineTo(W, H - 1).stroke({ color: theme.border.color, width: 1 });

      if (!values || values.length === 0) return;
      // Clamp -128 loop markers to 0 for display (same as DOM editor)
      const visible = values.map((v) => Math.max(0, v));
      if (visible.length === 0) return;

      const barW = W / visible.length;
      for (let i = 0; i < visible.length; i++) {
        const v = Math.min(max, visible[i]);
        const h = (v / max) * (H - 2);
        const x = i * barW;
        const w = Math.max(1, barW - 1);
        g.rect(x, H - h - 1, w, h).fill({ color });
      }
    },
    [theme.bg.color, theme.border.color],
  );

  const drawFseq = useCallback(
    drawBipolarBars(hc.fseq ?? [], theme.accent.color),
    [hc.fseq, drawBipolarBars, theme.accent.color],
  );
  const drawVseq = useCallback(
    drawUnipolarBars(hc.vseq ?? [], theme.success.color, 63),
    [hc.vseq, drawUnipolarBars, theme.success.color],
  );

  // ── Drag writers (fseq bipolar, vseq unipolar) ─────────────────────────────

  const writeFseqAt = useCallback((e: FederatedPointerEvent) => {
    const cur = hcRef.current;
    const values = cur.fseq ?? [];
    if (values.length === 0) return;
    const local = e.getLocalPosition(e.currentTarget as Container);
    const maxMag = computeFseqMaxMag(values);
    const { next, idx } = writeBipolarBar(
      values,
      local.x,
      local.y,
      SEQ_W,
      SEQ_H,
      maxMag,
      -127,
      127,
      fseqLastIdx.current,
    );
    fseqLastIdx.current = idx;
    onUpdate(instrumentIdRef.current, {
      hippelCoso: { ...cur, fseq: next },
    });
  }, [computeFseqMaxMag, onUpdate]);

  const writeVseqAt = useCallback((e: FederatedPointerEvent) => {
    const cur = hcRef.current;
    const values = cur.vseq ?? [];
    if (values.length === 0) return;
    const local = e.getLocalPosition(e.currentTarget as Container);
    const { next, idx } = writeUnipolarBar(
      values,
      local.x,
      local.y,
      SEQ_W,
      SEQ_H,
      63,
      vseqLastIdx.current,
    );
    vseqLastIdx.current = idx;
    onUpdate(instrumentIdRef.current, {
      hippelCoso: { ...cur, vseq: next },
    });
  }, [onUpdate]);

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
          text="HippelCoSo"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flexGrow: 1 }} />
        <PixiNumericInput
          value={previewNote}
          min={0}
          max={95}
          onChange={setPreviewNote}
          width={40}
        />
        <PixiButton
          label="Preview"
          icon="play"
          size="sm"
          variant="ghost"
          onClick={() => void handlePreview()}
        />
      </layoutContainer>

      {/* Timing / Vibrato knobs */}
      <SectionHeading text="TIMING & VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
        <PixiKnob
          value={hc.volSpeed}
          min={1}
          max={16}
          onChange={(v) => updHC('volSpeed', Math.round(v))}
          label="Vol Speed"
          size={KNOB_SIZE}
          defaultValue={1}
        />
        <PixiKnob
          value={hc.vibDelay}
          min={0}
          max={255}
          onChange={(v) => updHC('vibDelay', Math.round(v))}
          label="Vib Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={hc.vibSpeed}
          min={-128}
          max={127}
          onChange={(v) => updHC('vibSpeed', Math.round(v))}
          label="Vib Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={hc.vibDepth}
          min={0}
          max={255}
          onChange={(v) => updHC('vibDepth', Math.round(v))}
          label="Vib Depth"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Frequency sequence (drag to edit) */}
      <SectionHeading text="FREQUENCY SEQUENCE (SEMITONES)" />
      <layoutContainer
        layout={{
          width: SEQ_W,
          height: SEQ_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
        eventMode="static"
        cursor="crosshair"
        onPointerDown={(e: FederatedPointerEvent) => {
          fseqDrawing.current = true;
          fseqLastIdx.current = -1;
          writeFseqAt(e);
        }}
        onPointerMove={(e: FederatedPointerEvent) => {
          if (fseqDrawing.current) writeFseqAt(e);
        }}
        onPointerUp={() => {
          fseqDrawing.current = false;
          fseqLastIdx.current = -1;
        }}
        onPointerUpOutside={() => {
          fseqDrawing.current = false;
          fseqLastIdx.current = -1;
        }}
      >
        <pixiGraphics draw={drawFseq} layout={{ width: SEQ_W, height: SEQ_H }} />
      </layoutContainer>
      <PixiLabel
        text={`fseq length: ${hc.fseq?.length ?? 0}`}
        size="xs"
        color="textMuted"
      />

      {/* Volume sequence (drag to edit) */}
      <SectionHeading text="VOLUME SEQUENCE (0–63)" />
      <layoutContainer
        layout={{
          width: SEQ_W,
          height: SEQ_H,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
        eventMode="static"
        cursor="crosshair"
        onPointerDown={(e: FederatedPointerEvent) => {
          vseqDrawing.current = true;
          vseqLastIdx.current = -1;
          writeVseqAt(e);
        }}
        onPointerMove={(e: FederatedPointerEvent) => {
          if (vseqDrawing.current) writeVseqAt(e);
        }}
        onPointerUp={() => {
          vseqDrawing.current = false;
          vseqLastIdx.current = -1;
        }}
        onPointerUpOutside={() => {
          vseqDrawing.current = false;
          vseqLastIdx.current = -1;
        }}
      >
        <pixiGraphics draw={drawVseq} layout={{ width: SEQ_W, height: SEQ_H }} />
      </layoutContainer>
      <PixiLabel
        text={`vseq length: ${hc.vseq?.length ?? 0}`}
        size="xs"
        color="textMuted"
      />
    </layoutContainer>
  );
};
