/**
 * PixiHivelyPanel -- GL-native HivelyTracker / AHX instrument editor.
 *
 * Mirrors src/components/instruments/controls/HivelyControls.tsx:
 *   - Volume & Wave Length
 *   - Envelope ADSR (attack/decay/sustain/release times + volumes)
 *   - Vibrato (delay/speed/depth)
 *   - Square wave modulation (lower/upper/speed)
 *   - Filter modulation (lower/upper/speed)
 *   - Hard cut toggle + frames
 *   - Performance list (read-only summary)
 *
 * Mutations flow via onUpdate(id, { hively: { ...prev, field: value } }).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixiKnob, PixiLabel, PixiButton } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { HivelyConfig } from '@/types/instrument/exotic';

const KNOB_SIZE = 'sm' as const;

type HvlTab = 'params' | 'perflist';

interface Props {
  instrument: InstrumentConfig;
  onUpdate: (id: number, changes: Partial<InstrumentConfig>) => void;
}

const SectionHeading: React.FC<{ text: string }> = ({ text }) => (
  <layoutContainer layout={{ paddingTop: 2, paddingBottom: 2 }}>
    <PixiLabel text={text} size="xs" weight="bold" color="textMuted" />
  </layoutContainer>
);

const WAVE_LENGTH_LABELS = ['4', '8', '16', '32', '64', '128'];

export const PixiHivelyPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const hvl = instrument.hively!;
  const [activeTab, setActiveTab] = useState<HvlTab>('params');

  // configRef pattern for stale-closure avoidance
  const hvlRef = useRef(hvl);
  useEffect(() => { hvlRef.current = hvl; }, [hvl]);
  const idRef = useRef(instrument.id);
  useEffect(() => { idRef.current = instrument.id; }, [instrument.id]);

  const upd = useCallback(
    <K extends keyof HivelyConfig>(key: K, value: HivelyConfig[K]) => {
      onUpdate(idRef.current, {
        hively: { ...hvlRef.current, [key]: value },
      });
    },
    [onUpdate],
  );

  const updEnv = useCallback(
    (updates: Partial<HivelyConfig['envelope']>) => {
      onUpdate(idRef.current, {
        hively: {
          ...hvlRef.current,
          envelope: { ...hvlRef.current.envelope, ...updates },
        },
      });
    },
    [onUpdate],
  );

  const tabs: { id: HvlTab; label: string }[] = [
    { id: 'params', label: 'Parameters' },
    { id: 'perflist', label: 'Perf. List' },
  ];

  // Performance list effect names
  const PL_FX: Record<number, string> = {
    0x0: 'Filter', 0x1: 'Slide Up', 0x2: 'Slide Dn', 0x3: 'Square',
    0x4: 'Flt Mod', 0x5: 'Jump', 0x6: 'Raw Tri', 0x7: 'Raw Saw',
    0x8: 'Raw Sqr', 0x9: 'Raw Nse', 0xC: 'Volume', 0xF: 'Speed',
  };

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
        <PixiLabel text="HivelyTracker" size="sm" weight="bold" color="custom" customColor={0x44FF88} />
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

      {/* ---- PARAMETERS TAB ---- */}
      {activeTab === 'params' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 8 }}>
          {/* Volume & Wave Length */}
          <SectionHeading text="VOLUME & WAVE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiKnob
              value={hvl.volume}
              min={0}
              max={64}
              onChange={(v) => upd('volume', Math.round(v))}
              label="Volume"
              size={KNOB_SIZE}
              defaultValue={64}
            />
            <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
              <PixiLabel text="Wave Length" size="xs" color="textMuted" />
              <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
                {WAVE_LENGTH_LABELS.map((label, i) => (
                  <PixiButton
                    key={i}
                    label={label}
                    variant={hvl.waveLength === i ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => upd('waveLength', i)}
                  />
                ))}
              </layoutContainer>
            </layoutContainer>
          </layoutContainer>

          {/* Envelope ADSR */}
          <SectionHeading text="ENVELOPE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={hvl.envelope.aFrames}
              min={1} max={255}
              onChange={(v) => updEnv({ aFrames: Math.round(v) })}
              label="A.Time"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={hvl.envelope.aVolume}
              min={0} max={64}
              onChange={(v) => updEnv({ aVolume: Math.round(v) })}
              label="A.Vol"
              size={KNOB_SIZE}
              defaultValue={64}
            />
            <PixiKnob
              value={hvl.envelope.dFrames}
              min={1} max={255}
              onChange={(v) => updEnv({ dFrames: Math.round(v) })}
              label="D.Time"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={hvl.envelope.dVolume}
              min={0} max={64}
              onChange={(v) => updEnv({ dVolume: Math.round(v) })}
              label="D.Vol"
              size={KNOB_SIZE}
              defaultValue={32}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, flexWrap: 'wrap' }}>
            <PixiKnob
              value={hvl.envelope.sFrames}
              min={1} max={255}
              onChange={(v) => updEnv({ sFrames: Math.round(v) })}
              label="S.Time"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={hvl.envelope.rFrames}
              min={1} max={255}
              onChange={(v) => updEnv({ rFrames: Math.round(v) })}
              label="R.Time"
              size={KNOB_SIZE}
              defaultValue={1}
            />
            <PixiKnob
              value={hvl.envelope.rVolume}
              min={0} max={64}
              onChange={(v) => updEnv({ rVolume: Math.round(v) })}
              label="R.Vol"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Vibrato */}
          <SectionHeading text="VIBRATO" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={hvl.vibratoDelay}
              min={0} max={255}
              onChange={(v) => upd('vibratoDelay', Math.round(v))}
              label="Delay"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.vibratoDepth}
              min={0} max={15}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.vibratoSpeed}
              min={0} max={63}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Square Modulation */}
          <SectionHeading text="SQUARE MODULATION" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={hvl.squareLowerLimit}
              min={0} max={255}
              onChange={(v) => upd('squareLowerLimit', Math.round(v))}
              label="Lower"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.squareUpperLimit}
              min={0} max={255}
              onChange={(v) => upd('squareUpperLimit', Math.round(v))}
              label="Upper"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.squareSpeed}
              min={0} max={63}
              onChange={(v) => upd('squareSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Filter Modulation */}
          <SectionHeading text="FILTER MODULATION" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4 }}>
            <PixiKnob
              value={hvl.filterLowerLimit}
              min={0} max={127}
              onChange={(v) => upd('filterLowerLimit', Math.round(v))}
              label="Lower"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.filterUpperLimit}
              min={0} max={63}
              onChange={(v) => upd('filterUpperLimit', Math.round(v))}
              label="Upper"
              size={KNOB_SIZE}
              defaultValue={0}
            />
            <PixiKnob
              value={hvl.filterSpeed}
              min={0} max={63}
              onChange={(v) => upd('filterSpeed', Math.round(v))}
              label="Speed"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>

          {/* Hard Cut */}
          <SectionHeading text="HARD CUT" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
            <PixiButton
              label={hvl.hardCutRelease ? 'ON' : 'OFF'}
              variant={hvl.hardCutRelease ? 'primary' : 'ghost'}
              onClick={() => upd('hardCutRelease', !hvlRef.current.hardCutRelease)}
            />
            <PixiKnob
              value={hvl.hardCutReleaseFrames}
              min={0} max={7}
              onChange={(v) => upd('hardCutReleaseFrames', Math.round(v))}
              label="Frames"
              size={KNOB_SIZE}
              defaultValue={0}
            />
          </layoutContainer>
        </layoutContainer>
      )}

      {/* ---- PERFORMANCE LIST TAB (read-only summary) ---- */}
      {activeTab === 'perflist' && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingBottom: 4 }}>
            <PixiLabel text={`Speed: ${hvl.performanceList.speed}`} size="xs" color="text" />
            <PixiLabel text={`Entries: ${hvl.performanceList.entries.length}`} size="xs" color="textMuted" />
          </layoutContainer>
          {hvl.performanceList.entries.slice(0, 32).map((entry, i) => {
            const fx1Name = PL_FX[entry.fx[0]] ?? '--';
            const fx2Name = PL_FX[entry.fx[1]] ?? '--';
            const noteStr = entry.note > 0 ? entry.note.toString() : '---';
            const waveStr = `W${entry.waveform}`;
            const fixStr = entry.fixed ? 'F' : '.';
            return (
              <layoutContainer key={i} layout={{ flexDirection: 'row', gap: 6 }}>
                <PixiLabel
                  text={`${i.toString().padStart(2, '0')}: ${noteStr.padStart(3)} ${waveStr} ${fixStr} ${fx1Name.padEnd(8)} ${entry.fxParam[0].toString(16).toUpperCase().padStart(2, '0')} ${fx2Name.padEnd(8)} ${entry.fxParam[1].toString(16).toUpperCase().padStart(2, '0')}`}
                  size="xs"
                  color="text"
                />
              </layoutContainer>
            );
          })}
          {hvl.performanceList.entries.length > 32 && (
            <PixiLabel text={`... +${hvl.performanceList.entries.length - 32} more`} size="xs" color="textMuted" />
          )}

          {/* Effect reference */}
          <SectionHeading text="EFFECT REFERENCE" />
          <layoutContainer layout={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(PL_FX).map(([code, name]) => (
              <PixiLabel
                key={code}
                text={`${parseInt(code).toString(16).toUpperCase()}=${name}`}
                size="xs"
                color="textMuted"
              />
            ))}
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
