/**
 * PixiSymphoniePanel -- GL-native Symphonie Pro instrument editor.
 *
 * Mirrors src/components/instruments/controls/SymphonieControls.tsx 1:1:
 *   - Three tabs: General, Loop, Routing
 *   - General tab: instrument type selector, volume knob, tune/fineTune knobs,
 *     sample rate knob
 *   - Loop tab: loopStart/loopLen percentage knobs, numLoops knob,
 *     newLoopSystem toggle
 *   - Routing tab: multiChannel selector, noDsp toggle
 *
 * Mutations flow via onUpdate(instrumentId, { symphonie: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiToggle, PixiSelect, type SelectOption } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SymphonieConfig } from '@/types/instrument/exotic';

const KNOB_SIZE = 'sm' as const;

type SymphonieTab = 'general' | 'loop' | 'routing';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const TYPE_OPTIONS: SelectOption[] = [
  { value: '0', label: 'Normal (one-shot)' },
  { value: '4', label: 'Loop' },
  { value: '8', label: 'Sustain' },
  { value: '-4', label: 'Kill' },
  { value: '-8', label: 'Silent' },
];

const MULTI_CHANNEL_OPTIONS: SelectOption[] = [
  { value: '0', label: 'Mono' },
  { value: '1', label: 'Stereo L' },
  { value: '2', label: 'Stereo R' },
  { value: '3', label: 'Line Source' },
];

export const PixiSymphoniePanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const sym = instrument.symphonie!;
  const [activeTab, setActiveTab] = useState<SymphonieTab>('general');

  const symRef = useRef(sym);
  useEffect(() => { symRef.current = sym; }, [sym]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof SymphonieConfig>(key: K, value: SymphonieConfig[K]) => {
      const cur = symRef.current;
      onUpdate(instrumentIdRef.current, {
        symphonie: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  const tabs: { id: SymphonieTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'loop', label: 'Loop' },
    { id: 'routing', label: 'Routing' },
  ];

  // Loop percentage helpers
  const loopPct = sym.loopStart / (100 * 65536) * 100;
  const lenPct = sym.loopLen / (100 * 65536) * 100;

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
        <PixiLabel text="Symphonie Pro" size="sm" weight="bold" color="custom" customColor={0xBB88FF} />
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

      {/* ── GENERAL TAB ── */}
      {activeTab === 'general' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="INSTRUMENT TYPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <PixiSelect
              options={TYPE_OPTIONS}
              value={String(sym.type)}
              onChange={(v) => upd('type', parseInt(v, 10))}
              width={160}
            />
          </layoutContainer>

          <SectionHeading text="VOLUME" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sym.volume}
              min={0} max={100} step={1}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume" size={KNOB_SIZE} defaultValue={100}
            />
          </layoutContainer>

          <SectionHeading text="TUNING" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sym.tune}
              min={-48} max={48} step={1}
              onChange={(v) => upd('tune', Math.round(v))}
              label="Tune" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sym.fineTune}
              min={-128} max={127} step={1}
              onChange={(v) => upd('fineTune', Math.round(v))}
              label="Fine Tune" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="SAMPLE RATE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={sym.sampledFrequency}
              min={4000} max={48000} step={1}
              onChange={(v) => upd('sampledFrequency', Math.round(v))}
              label="Rate (Hz)" size={KNOB_SIZE} defaultValue={8363}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── LOOP TAB ── */}
      {activeTab === 'loop' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="LOOP SETTINGS" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={loopPct}
              min={0} max={100} step={0.1}
              onChange={(v) => upd('loopStart', Math.round(v / 100 * 100 * 65536))}
              label="Start %" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={lenPct}
              min={0} max={100} step={0.1}
              onChange={(v) => upd('loopLen', Math.round(v / 100 * 100 * 65536))}
              label="Length %" size={KNOB_SIZE} defaultValue={0}
            />
            <PixiKnob
              value={sym.numLoops}
              min={0} max={255} step={1}
              onChange={(v) => upd('numLoops', Math.round(v))}
              label="Repeats" size={KNOB_SIZE} defaultValue={0}
            />
          </layoutContainer>

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8 }}>
            <PixiToggle
              label="New Loop System"
              value={sym.newLoopSystem}
              onChange={(v) => upd('newLoopSystem', v)}
            />
          </layoutContainer>

          <layoutContainer layout={{ paddingTop: 4 }}>
            <PixiLabel
              text="Loop start/length as % of sample. Repeats 0 = infinite."
              size="xs"
              color="textMuted"
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── ROUTING TAB ── */}
      {activeTab === 'routing' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="CHANNEL ROUTING" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <PixiSelect
              options={MULTI_CHANNEL_OPTIONS}
              value={String(sym.multiChannel)}
              onChange={(v) => upd('multiChannel', parseInt(v, 10))}
              width={140}
            />
          </layoutContainer>

          <SectionHeading text="DSP PROCESSING" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <PixiToggle
              label="Bypass DSP (no echo/delay)"
              value={sym.noDsp}
              onChange={(v) => upd('noDsp', v)}
            />
          </layoutContainer>

          <layoutContainer layout={{ paddingTop: 4 }}>
            <PixiLabel
              text="When enabled, this instrument bypasses Symphonie DSP ring buffer effects."
              size="xs"
              color="textMuted"
            />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
