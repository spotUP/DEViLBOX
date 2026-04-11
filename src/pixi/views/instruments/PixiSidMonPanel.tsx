/**
 * PixiSidMonPanel -- GL-native SidMon II instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/SidMonControls.tsx
 * 1:1 in structure:
 *   - Header row with "SidMon" label, instrument name, type badge
 *   - Four tabs: Main, Filter, Arpeggio, PCM (PCM tab only for pcm-type instruments)
 *   - Main tab: waveform selector (0-3), pulseWidth knob (when pulse), ADSR knobs (0-15),
 *     vibrato knobs (delay/speed/depth)
 *   - Filter tab: filterMode buttons (LP/HP/BP), cutoff + resonance knobs
 *   - Arpeggio tab: arpSpeed knob + bar chart of arpTable
 *   - PCM tab: pcmData preview, loop points display, finetune knob
 *
 * Mutations flow via onUpdate(instrumentId, { sidMon: { ...prev, [key]: value } }).
 * No UADE chip RAM writes -- the store handles that.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SidMonConfig } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

type SMTab = 'main' | 'filter' | 'arpeggio' | 'pcm';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const WAVEFORM_NAMES = ['Triangle', 'Sawtooth', 'Pulse', 'Noise'];
const FILTER_MODE_NAMES = ['LP', 'HP', 'BP'];

const SEQ_W = 320;
const SEQ_H = 80;

export const PixiSidMonPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const sid = instrument.sidMon!;
  const [activeTab, setActiveTab] = useState<SMTab>('main');

  // configRef pattern for stale-closure protection
  const sidRef = useRef(sid);
  useEffect(() => { sidRef.current = sid; }, [sid]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof SidMonConfig>(key: K, value: SidMonConfig[K]) => {
      const cur = sidRef.current;
      onUpdate(instrumentIdRef.current, {
        sidMon: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  // -- Badge helper --
  const Badge: React.FC<{ text: string; color: number }> = ({ text, color }) => (
    <layoutContainer
      layout={{
        paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
        borderRadius: 3,
        backgroundColor: theme.bgTertiary.color,
      }}
    >
      <PixiLabel text={text} size="xs" weight="bold" color="custom" customColor={color} />
    </layoutContainer>
  );

  // -- Arpeggio bar chart (bipolar semitones) --
  const drawArpBars = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = SEQ_W;
      const H = SEQ_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const data = sid.arpTable;
      if (!data || data.length === 0) return;

      let maxMag = 12;
      for (const v of data) {
        const a = Math.abs(v);
        if (a > maxMag) maxMag = a;
      }

      const barW = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
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
    [sid.arpTable, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // -- PCM waveform preview --
  const drawPcmPreview = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = SEQ_W;
      const H = SEQ_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      const data = sid.pcmData;
      if (!data || data.length === 0) return;

      const step = Math.max(1, Math.floor(data.length / W));
      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.min(data.length - 1, x * step);
        const raw = data[idx];
        const s = raw > 127 ? raw - 256 : raw;
        const y = mid - (s / 128) * (mid - 2);
        if (x === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ color: theme.success.color, width: 1 });
    },
    [sid.pcmData, theme.bg.color, theme.border.color, theme.success.color],
  );

  // -- Tab definitions --
  const tabs: { id: SMTab; label: string }[] = [
    { id: 'main', label: 'Main' },
    { id: 'filter', label: 'Filter' },
    { id: 'arpeggio', label: 'Arpeggio' },
    ...(sid.type === 'pcm' ? [{ id: 'pcm' as SMTab, label: 'PCM Sample' }] : []),
  ];

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
        <PixiLabel text="SidMon" size="sm" weight="bold" color="custom" customColor={theme.accent.color} />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        <Badge
          text={sid.type === 'synth' ? 'SYNTH' : 'PCM'}
          color={sid.type === 'synth' ? theme.accent.color : theme.success.color}
        />
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

      {/* ======== MAIN TAB ======== */}
      {activeTab === 'main' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Waveform selector */}
          <SectionHeading text="WAVEFORM" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            {WAVEFORM_NAMES.map((name, i) => (
              <PixiButton
                key={i}
                label={name}
                variant={sid.waveform === i ? 'primary' : 'ghost'}
                onClick={() => upd('waveform', i as 0 | 1 | 2 | 3)}
              />
            ))}
          </layoutContainer>

          {/* Pulse width (only visible when waveform === 2) */}
          {sid.waveform === 2 && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
              <PixiKnob
                value={sid.pulseWidth}
                min={0}
                max={255}
                step={1}
                onChange={(v) => upd('pulseWidth', Math.round(v))}
                label="Pulse Width"
                size={KNOB_SIZE}
                defaultValue={128}
              />
            </layoutContainer>
          )}

          {/* ADSR (SID format, 0-15) */}
          <SectionHeading text="ADSR (SID FORMAT, 0-15)" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sid.attack}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('attack', Math.round(v))}
              label="Attack"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sid.decay}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('decay', Math.round(v))}
              label="Decay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sid.sustain}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('sustain', Math.round(v))}
              label="Sustain"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sid.release}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('release', Math.round(v))}
              label="Release"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Vibrato */}
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sid.vibDelay}
              min={0}
              max={255}
              onChange={(v) => upd('vibDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sid.vibSpeed}
              min={0}
              max={63}
              onChange={(v) => upd('vibSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sid.vibDepth}
              min={0}
              max={63}
              onChange={(v) => upd('vibDepth', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ======== FILTER TAB ======== */}
      {activeTab === 'filter' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="FILTER MODE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
            {FILTER_MODE_NAMES.map((name, i) => (
              <PixiButton
                key={i}
                label={name}
                variant={sid.filterMode === i ? 'primary' : 'ghost'}
                onClick={() => upd('filterMode', i)}
              />
            ))}
          </layoutContainer>

          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}>
            <PixiKnob
              value={sid.filterCutoff}
              min={0}
              max={255}
              step={1}
              onChange={(v) => upd('filterCutoff', Math.round(v))}
              label="Cutoff"
              size={KNOB_SIZE}
              defaultValue={128}
            />
            <PixiKnob
              value={sid.filterResonance}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('filterResonance', Math.round(v))}
              label="Resonance"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ======== ARPEGGIO TAB ======== */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <SectionHeading text="ARPEGGIO" />
            <PixiKnob
              value={sid.arpSpeed}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('arpSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <layoutContainer
            layout={{
              width: SEQ_W,
              height: SEQ_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawArpBars} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={`${sid.arpTable?.length ?? 0} steps (semitones)`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* ======== PCM TAB ======== */}
      {activeTab === 'pcm' && sid.type === 'pcm' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="PCM SAMPLE (READ-ONLY PREVIEW)" />
          <layoutContainer
            layout={{
              width: SEQ_W,
              height: SEQ_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawPcmPreview} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          <PixiLabel
            text={sid.pcmData ? `${sid.pcmData.length.toLocaleString()} bytes` : 'No PCM data'}
            size="xs"
            color="textMuted"
          />

          {/* Loop points (read-only display) */}
          <SectionHeading text="LOOP POINTS" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16 }}>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <PixiLabel text="Start" size="xs" color="textMuted" />
              <PixiLabel text={String(sid.loopStart ?? 0)} size="xs" color="text" />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <PixiLabel text="Length" size="xs" color="textMuted" />
              <PixiLabel text={String(sid.loopLength ?? 0)} size="xs" color="text" />
            </layoutContainer>
          </layoutContainer>

          {/* Finetune */}
          <SectionHeading text="FINETUNE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={sid.finetune ?? 0}
              min={-8}
              max={7}
              step={1}
              onChange={(v) => upd('finetune', Math.round(v))}
              label="Finetune"
              size={KNOB_SIZE}
              defaultValue={0}
              bipolar
            />
            <PixiLabel text="-8 .. +7 (signed nibble)" size="xs" color="textMuted" />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
