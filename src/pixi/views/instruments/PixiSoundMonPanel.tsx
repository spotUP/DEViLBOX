/**
 * PixiSoundMonPanel -- GL-native SoundMon II instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/SoundMonControls.tsx
 * 1:1 in structure:
 *   - Header row with "SoundMon" label, instrument name, type badge (synth/pcm)
 *   - Three tabs: Parameters, Arpeggio, Sample
 *   - Parameters tab: waveType selector, waveSpeed knob, volume envelope (ADSR knobs),
 *     vibrato knobs, portamento knob
 *   - Arpeggio tab: arpSpeed knob + bar chart display of arpTable
 *   - Sample tab: type indicator, wavePCM/pcmData display (read-only bars),
 *     finetune/transpose/volume knobs
 *
 * Mutations flow via onUpdate(instrumentId, { soundMon: { ...prev, [key]: value } }).
 * No UADE chip RAM writes -- the store handles that.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SoundMonConfig } from '@/types/instrument/exotic';
import type { Graphics } from 'pixi.js';

const KNOB_SIZE = 'sm' as const;

type SMTab = 'params' | 'arpeggio' | 'sample';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const WAVE_NAMES = [
  'Square', 'Saw', 'Triangle', 'Noise',
  'Pulse 1', 'Pulse 2', 'Pulse 3', 'Pulse 4',
  'Blend 1', 'Blend 2', 'Blend 3', 'Blend 4',
  'Ring 1', 'Ring 2', 'FM 1', 'FM 2',
];

const SEQ_W = 320;
const SEQ_H = 80;

export const PixiSoundMonPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const sm = instrument.soundMon!;
  const [activeTab, setActiveTab] = useState<SMTab>('params');

  // configRef pattern for stale-closure protection
  const smRef = useRef(sm);
  useEffect(() => { smRef.current = sm; }, [sm]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof SoundMonConfig>(key: K, value: SoundMonConfig[K]) => {
      const cur = smRef.current;
      onUpdate(instrumentIdRef.current, {
        soundMon: { ...cur, [key]: value },
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

      const data = sm.arpTable;
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
    [sm.arpTable, theme.bg.color, theme.border.color, theme.accent.color],
  );

  // -- WavePCM / PCM preview bar chart --
  const drawWavePreview = useCallback(
    (g: Graphics) => {
      g.clear();
      const W = SEQ_W;
      const H = SEQ_H;
      const mid = H / 2;

      g.rect(0, 0, W, H).fill({ color: theme.bg.color });
      g.moveTo(0, mid).lineTo(W, mid).stroke({ color: theme.border.color, width: 1 });

      // Pick the right data source based on type
      let samples: number[] | Uint8Array | undefined;
      let isSigned = true;
      if (sm.type === 'synth') {
        samples = sm.wavePCM;
        isSigned = true; // wavePCM is signed int8
      } else {
        samples = sm.pcmData;
        isSigned = false; // pcmData is Uint8Array, treat bytes > 127 as negative
      }

      if (!samples || samples.length === 0) return;

      const len = samples.length;
      const step = Math.max(1, Math.floor(len / W));
      const accentColor = sm.type === 'synth' ? theme.accent.color : theme.success.color;

      g.moveTo(0, mid);
      for (let x = 0; x < W; x++) {
        const idx = Math.min(len - 1, x * step);
        const raw = samples[idx];
        const s = isSigned ? raw : (raw > 127 ? raw - 256 : raw);
        const y = mid - (s / 128) * (mid - 2);
        if (x === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ color: accentColor, width: 1 });
    },
    [sm.type, sm.wavePCM, sm.pcmData, theme.bg.color, theme.border.color, theme.accent.color, theme.success.color],
  );

  // -- Tab definitions --
  const tabs: { id: SMTab; label: string }[] = [
    { id: 'params', label: 'Parameters' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'sample', label: 'Sample' },
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
        <PixiLabel text="SoundMon" size="sm" weight="bold" color="custom" customColor={theme.accent.color} />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        <Badge
          text={sm.type === 'synth' ? 'SYNTH' : 'PCM'}
          color={sm.type === 'synth' ? theme.accent.color : theme.success.color}
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

      {/* ======== PARAMETERS TAB ======== */}
      {activeTab === 'params' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Waveform selector */}
          <SectionHeading text="WAVEFORM" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <PixiKnob
              value={sm.waveType}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('waveType', Math.round(v))}
              label="Wave Type"
              size={KNOB_SIZE}
              defaultValue={0}
              formatValue={(v) => `${Math.round(v)}: ${WAVE_NAMES[Math.round(v)] ?? '?'}`}
            />
            <PixiKnob
              value={sm.waveSpeed}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('waveSpeed', Math.round(v))}
              label="Morph Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Volume Envelope — Attack */}
          <SectionHeading text="VOLUME ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <PixiLabel text="Attack" size="xs" color="textMuted" />
              <PixiKnob
                value={sm.attackVolume}
                min={0}
                max={64}
                step={1}
                onChange={(v) => upd('attackVolume', Math.round(v))}
                label="Volume"
                size={KNOB_SIZE}
                defaultValue={64}
              />
              <PixiKnob
                value={sm.attackSpeed}
                min={0}
                max={63}
                step={1}
                onChange={(v) => upd('attackSpeed', Math.round(v))}
                label="Speed"
                size={KNOB_SIZE}
                defaultValue={0}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <PixiLabel text="Decay" size="xs" color="textMuted" />
              <PixiKnob
                value={sm.decayVolume}
                min={0}
                max={64}
                step={1}
                onChange={(v) => upd('decayVolume', Math.round(v))}
                label="Volume"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={sm.decaySpeed}
                min={0}
                max={63}
                step={1}
                onChange={(v) => upd('decaySpeed', Math.round(v))}
                label="Speed"
                size={KNOB_SIZE}
                defaultValue={0}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <PixiLabel text="Sustain" size="xs" color="textMuted" />
              <PixiKnob
                value={sm.sustainVolume}
                min={0}
                max={64}
                step={1}
                onChange={(v) => upd('sustainVolume', Math.round(v))}
                label="Volume"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={sm.sustainLength}
                min={0}
                max={255}
                step={1}
                onChange={(v) => upd('sustainLength', Math.round(v))}
                label="Length"
                size={KNOB_SIZE}
                defaultValue={0}
              />
            </layoutContainer>
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <PixiLabel text="Release" size="xs" color="textMuted" />
              <PixiKnob
                value={sm.releaseVolume}
                min={0}
                max={64}
                step={1}
                onChange={(v) => upd('releaseVolume', Math.round(v))}
                label="Volume"
                size={KNOB_SIZE}
                defaultValue={0}
              />
              <PixiKnob
                value={sm.releaseSpeed}
                min={0}
                max={63}
                step={1}
                onChange={(v) => upd('releaseSpeed', Math.round(v))}
                label="Speed"
                size={KNOB_SIZE}
                defaultValue={0}
              />
            </layoutContainer>
          </layoutContainer>

          {/* Vibrato */}
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sm.vibratoDelay}
              min={0}
              max={255}
              onChange={(v) => upd('vibratoDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sm.vibratoSpeed}
              min={0}
              max={63}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={sm.vibratoDepth}
              min={0}
              max={63}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Portamento */}
          <SectionHeading text="PORTAMENTO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={sm.portamentoSpeed}
              min={0}
              max={63}
              step={1}
              onChange={(v) => upd('portamentoSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiLabel text="0 = disabled" size="xs" color="textMuted" />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ======== ARPEGGIO TAB ======== */}
      {activeTab === 'arpeggio' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <SectionHeading text="ARPEGGIO" />
            <PixiKnob
              value={sm.arpSpeed}
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
            text={`${sm.arpTable?.length ?? 0} steps (semitones)`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* ======== SAMPLE TAB ======== */}
      {activeTab === 'sample' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Type indicator */}
          <SectionHeading text="INSTRUMENT TYPE" />
          <PixiLabel
            text={sm.type === 'synth' ? 'SYNTH (wavetable)' : 'PCM (sample)'}
            size="xs"
            color="custom"
            customColor={sm.type === 'synth' ? theme.accent.color : theme.success.color}
          />

          {/* Waveform / PCM preview */}
          <SectionHeading text={sm.type === 'synth' ? 'WAVE PCM (READ-ONLY)' : 'PCM SAMPLE'} />
          <layoutContainer
            layout={{
              width: SEQ_W,
              height: SEQ_H,
              borderWidth: 1,
              borderColor: theme.border.color,
              borderRadius: 4,
            }}
          >
            <pixiGraphics draw={drawWavePreview} layout={{ width: SEQ_W, height: SEQ_H }} />
          </layoutContainer>
          {sm.type === 'synth' && (
            <PixiLabel
              text={`${sm.wavePCM?.length ?? 64} bytes`}
              size="xs"
              color="textMuted"
            />
          )}
          {sm.type === 'pcm' && (
            <PixiLabel
              text={sm.pcmData ? `${sm.pcmData.length.toLocaleString()} bytes` : 'No PCM data'}
              size="xs"
              color="textMuted"
            />
          )}

          {/* PCM loop points (read-only display) */}
          {sm.type === 'pcm' && (
            <>
              <SectionHeading text="LOOP POINTS" />
              <layoutContainer layout={{ flexDirection: 'row', gap: 16 }}>
                <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <PixiLabel text="Start" size="xs" color="textMuted" />
                  <PixiLabel text={String(sm.loopStart ?? 0)} size="xs" color="text" />
                </layoutContainer>
                <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <PixiLabel text="Length" size="xs" color="textMuted" />
                  <PixiLabel text={String(sm.loopLength ?? 0)} size="xs" color="text" />
                </layoutContainer>
              </layoutContainer>
            </>
          )}

          {/* Tuning & Volume */}
          <SectionHeading text="TUNING & VOLUME" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sm.finetune ?? 0}
              min={-8}
              max={7}
              step={1}
              onChange={(v) => upd('finetune', Math.round(v))}
              label="Finetune"
              size={KNOB_SIZE}
              defaultValue={0}
              bipolar
            />
            <PixiKnob
              value={sm.transpose ?? 0}
              min={-12}
              max={12}
              step={1}
              onChange={(v) => upd('transpose', Math.round(v))}
              label="Transpose"
              size={KNOB_SIZE}
              defaultValue={0}
              bipolar
            />
            <PixiKnob
              value={sm.volume ?? 64}
              min={0}
              max={64}
              step={1}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume"
              size={KNOB_SIZE}
              defaultValue={64}
            />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
