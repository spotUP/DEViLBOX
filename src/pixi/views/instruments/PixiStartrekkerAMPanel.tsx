/**
 * PixiStartrekkerAMPanel -- GL-native StarTrekker AM synthesis instrument editor.
 *
 * Mirrors src/components/instruments/controls/StartrekkerAMControls.tsx 1:1:
 *   - Waveform selector (Sine/Saw/Square/Noise), Period Shift knob, Base Amp knob
 *   - 5-phase ADSR envelope: Attack1, Attack2, Decay (target+rate each),
 *     Sustain (length), Release (rate)
 *   - Vibrato section: Speed + Depth knobs
 *
 * Mutations flow via onUpdate(instrumentId, { startrekkerAM: { ...prev, [key]: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { StartrekkerAMConfig } from '@/types/instrument/exotic';

const KNOB_SIZE = 'sm' as const;

type AMTab = 'waveform' | 'envelope' | 'vibrato';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const WAVEFORM_NAMES = ['Sine', 'Sawtooth', 'Square', 'Noise'];

export const PixiStartrekkerAMPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const am = instrument.startrekkerAM!;
  const [activeTab, setActiveTab] = useState<AMTab>('waveform');

  const amRef = useRef(am);
  useEffect(() => { amRef.current = am; }, [am]);
  const instrumentIdRef = useRef(instrument.id);
  useEffect(() => { instrumentIdRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof StartrekkerAMConfig>(key: K, value: StartrekkerAMConfig[K]) => {
      const cur = amRef.current;
      onUpdate(instrumentIdRef.current, {
        startrekkerAM: { ...cur, [key]: value },
      });
    },
    [onUpdate],
  );

  const tabs: { id: AMTab; label: string }[] = [
    { id: 'waveform', label: 'Waveform' },
    { id: 'envelope', label: 'Envelope' },
    { id: 'vibrato', label: 'Vibrato' },
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
        <PixiLabel text="StarTrekker AM" size="sm" weight="bold" color="custom" customColor={0x00CCCC} />
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

      {/* ── WAVEFORM TAB ── */}
      {activeTab === 'waveform' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="WAVEFORM" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {WAVEFORM_NAMES.map((name, i) => (
              <PixiButton
                key={i}
                label={name}
                variant={am.waveform === i ? 'primary' : 'ghost'}
                onClick={() => upd('waveform', i)}
              />
            ))}
          </layoutContainer>

          <SectionHeading text="PERIOD" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.periodShift}
              min={0}
              max={15}
              step={1}
              onChange={(v) => upd('periodShift', Math.round(v))}
              label="Shift"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={am.basePeriod}
              min={0}
              max={512}
              onChange={(v) => upd('basePeriod', Math.round(v))}
              label="Base Amp"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── ENVELOPE TAB ── */}
      {activeTab === 'envelope' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="ATTACK 1" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.attackTarget}
              min={-256}
              max={256}
              onChange={(v) => upd('attackTarget', Math.round(v))}
              label="Target"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={am.attackRate}
              min={0}
              max={128}
              onChange={(v) => upd('attackRate', Math.round(v))}
              label="Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="ATTACK 2" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.attack2Target}
              min={-256}
              max={256}
              onChange={(v) => upd('attack2Target', Math.round(v))}
              label="Target"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={am.attack2Rate}
              min={0}
              max={128}
              onChange={(v) => upd('attack2Rate', Math.round(v))}
              label="Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="DECAY" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.decayTarget}
              min={-256}
              max={256}
              onChange={(v) => upd('decayTarget', Math.round(v))}
              label="Target"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={am.decayRate}
              min={0}
              max={128}
              onChange={(v) => upd('decayRate', Math.round(v))}
              label="Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="SUSTAIN" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.sustainCount}
              min={0}
              max={999}
              onChange={(v) => upd('sustainCount', Math.round(v))}
              label="Length"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <SectionHeading text="RELEASE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.releaseRate}
              min={0}
              max={128}
              onChange={(v) => upd('releaseRate', Math.round(v))}
              label="Rate"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── VIBRATO TAB ── */}
      {activeTab === 'vibrato' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={am.vibFreqStep}
              min={0}
              max={500}
              onChange={(v) => upd('vibFreqStep', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={Math.abs(am.vibAmplitude)}
              min={0}
              max={256}
              onChange={(v) => upd('vibAmplitude', Math.round(v) * (am.vibAmplitude < 0 ? -1 : 1))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
