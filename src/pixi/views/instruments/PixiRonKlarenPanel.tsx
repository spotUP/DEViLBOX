/**
 * PixiRonKlarenPanel -- GL-native Ron Klaren Sound Module instrument editor.
 *
 * Mirrors src/components/instruments/controls/RonKlarenControls.tsx 1:1:
 *   - Three tabs: Oscillator, Envelope, Waveform
 *   - Oscillator tab: phaseSpeed, phaseLengthInWords, phaseValue, phasePosition
 *     knobs + phaseDirection toggle + isSample badge
 *   - Vibrato section: vibratoDelay, vibratoSpeed, vibratoDepth knobs
 *   - Envelope tab: 4-point ADSR with point (Level) + increment (Rate) knobs
 *   - Waveform tab: info label (no GL canvas waveform draw -- read-only display)
 *
 * Mutations flow via onUpdate(instrumentId, { ronKlaren: { ...prev, ...changes } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton, PixiToggle } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { RonKlarenConfig } from '@/types/instrument/exotic';

const KNOB_SIZE = 'sm' as const;

type RKTab = 'main' | 'adsr' | 'waveform';

const ADSR_LABELS = ['Attack', 'Decay', 'Sustain', 'Release'];

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

export const PixiRonKlarenPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const rk = instrument.ronKlaren!;
  const [activeTab, setActiveTab] = useState<RKTab>('main');

  const rkRef = useRef(rk);
  useEffect(() => { rkRef.current = rk; }, [rk]);
  const idRef = useRef(instrument.id);
  useEffect(() => { idRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof RonKlarenConfig>(key: K, value: RonKlarenConfig[K]) => {
      onUpdate(idRef.current, {
        ronKlaren: { ...rkRef.current, [key]: value },
      });
    },
    [onUpdate],
  );

  const updateAdsrEntry = useCallback(
    (index: number, field: 'point' | 'increment', value: number) => {
      const newAdsr = rkRef.current.adsr.map((e, i) =>
        i === index ? { ...e, [field]: value } : { ...e },
      );
      onUpdate(idRef.current, {
        ronKlaren: { ...rkRef.current, adsr: newAdsr },
      });
    },
    [onUpdate],
  );

  const tabs: { id: RKTab; label: string }[] = [
    { id: 'main', label: 'Oscillator' },
    { id: 'adsr', label: 'Envelope' },
    { id: 'waveform', label: 'Waveform' },
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
        <PixiLabel text="Ron Klaren" size="sm" weight="bold" color="custom" customColor={0x66BBFF} />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
        <layoutContainer layout={{ flex: 1 }} />
        <layoutContainer
          layout={{
            paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2,
            borderRadius: 3,
            backgroundColor: theme.bgTertiary.color,
          }}
        >
          <PixiLabel
            text={rk.isSample ? 'Sample mode' : 'Synthesis mode'}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
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

      {/* ── OSCILLATOR TAB ── */}
      {activeTab === 'main' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="OSCILLATOR / PHASE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={rk.phaseSpeed}
              min={0} max={255} step={1}
              onChange={(v) => upd('phaseSpeed', Math.round(v))}
              label="Phase Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={rk.phaseLengthInWords}
              min={0} max={255} step={1}
              onChange={(v) => upd('phaseLengthInWords', Math.round(v))}
              label="Phase Length"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={rk.phaseValue}
              min={-128} max={127} step={1}
              onChange={(v) => upd('phaseValue', Math.round(v))}
              label="Phase Value"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={rk.phasePosition}
              min={0} max={255} step={1}
              onChange={(v) => upd('phasePosition', Math.round(v))}
              label="Phase Pos"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <PixiToggle
              label="Reverse Direction"
              value={rk.phaseDirection}
              onChange={(v) => upd('phaseDirection', v)}
            />
          </layoutContainer>

          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={rk.vibratoDelay}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={rk.vibratoSpeed}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={rk.vibratoDepth}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── ENVELOPE TAB ── */}
      {activeTab === 'adsr' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="4-POINT ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            {rk.adsr.map((entry, i) => (
              <layoutContainer
                key={i}
                layout={{ flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <PixiLabel
                  text={ADSR_LABELS[i] ?? `Stage ${i + 1}`}
                  size="xs"
                  weight="bold"
                  color="custom"
                  customColor={0x66BBFF}
                />
                <PixiKnob
                  value={entry.point}
                  min={0} max={255} step={1}
                  onChange={(v) => updateAdsrEntry(i, 'point', Math.round(v))}
                  label="Level"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
                <PixiKnob
                  value={entry.increment}
                  min={0} max={255} step={1}
                  onChange={(v) => updateAdsrEntry(i, 'increment', Math.round(v))}
                  label="Rate"
                  size={KNOB_SIZE}
                  defaultValue={0}
                />
              </layoutContainer>
            ))}
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ── WAVEFORM TAB ── */}
      {activeTab === 'waveform' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          <SectionHeading text="WAVEFORM DATA (READ-ONLY)" />
          <layoutContainer
            layout={{
              padding: 12,
              borderRadius: 4,
              backgroundColor: theme.bg.color,
              borderWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <PixiLabel
              text={
                rk.waveformData && rk.waveformData.length > 0
                  ? `${rk.waveformData.length} bytes (${rk.phaseLengthInWords} words)`
                  : 'No waveform data'
              }
              size="sm"
              color="textMuted"
            />
          </layoutContainer>
          <PixiLabel
            text="Waveform visualization available in DOM mode."
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
