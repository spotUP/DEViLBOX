/**
 * PixiSteveTurnerPanel — GL-native Steve Turner instrument editor.
 *
 * Mirrors the DOM editor at src/components/instruments/controls/SteveTurnerControls.tsx
 * 1:1 in structure: envelope knobs (delay, seg1/2 dur+delta, osc count/delta/loop, decay),
 * vibrato knobs (entries, delay, speed, max depth, pitch shift), and misc knobs
 * (priority, sample, chain).
 *
 * Data shape: instrument.steveTurner (SteveTurnerConfig). Mutations flow through the
 * shared onUpdate(instrumentId, { steveTurner: { ... } }) path.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { PixiKnob, PixiLabel } from '../../components';
import { usePixiTheme } from '../../theme';
import type { InstrumentConfig } from '@typedefs/instrument';

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

export const PixiSteveTurnerPanel: React.FC<Props> = ({ instrument, onUpdate }) => {
  const theme = usePixiTheme();
  const st = instrument.steveTurner!;

  const stRef = useRef(st);
  useEffect(() => { stRef.current = st; }, [st]);

  const updST = useCallback(
    (key: string, value: number) => {
      onUpdate(instrument.id, {
        steveTurner: { ...instrument.steveTurner!, [key]: value },
      });
    },
    [instrument.id, instrument.steveTurner, onUpdate],
  );

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
          text="Steve Turner"
          size="sm"
          weight="bold"
          color="custom"
          customColor={theme.accent.color}
        />
        <PixiLabel text={instrument.name} size="sm" color="textSecondary" />
      </layoutContainer>

      {/* Envelope */}
      <SectionHeading text="ENVELOPE" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
        <PixiKnob
          value={st.initDelay}
          min={0}
          max={255}
          onChange={(v) => updST('initDelay', Math.round(v))}
          label="Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.env1Duration}
          min={0}
          max={255}
          onChange={(v) => updST('env1Duration', Math.round(v))}
          label="Seg1 Dur"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.env1Delta}
          min={-128}
          max={127}
          onChange={(v) => updST('env1Delta', Math.round(v))}
          label="Seg1 Delta"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.env2Duration}
          min={0}
          max={255}
          onChange={(v) => updST('env2Duration', Math.round(v))}
          label="Seg2 Dur"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.env2Delta}
          min={-128}
          max={127}
          onChange={(v) => updST('env2Delta', Math.round(v))}
          label="Seg2 Delta"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.oscCount}
          min={0}
          max={65535}
          onChange={(v) => updST('oscCount', Math.round(v))}
          label="Osc Count"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.oscDelta}
          min={-128}
          max={127}
          onChange={(v) => updST('oscDelta', Math.round(v))}
          label="Osc Delta"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.oscLoop}
          min={0}
          max={255}
          onChange={(v) => updST('oscLoop', Math.round(v))}
          label="Osc Loop"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.decayDelta}
          min={-128}
          max={127}
          onChange={(v) => updST('decayDelta', Math.round(v))}
          label="Decay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Vibrato */}
      <SectionHeading text="VIBRATO" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
        <PixiKnob
          value={st.numVibrato}
          min={0}
          max={5}
          onChange={(v) => updST('numVibrato', Math.round(v))}
          label="Entries"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.vibratoDelay}
          min={0}
          max={255}
          onChange={(v) => updST('vibratoDelay', Math.round(v))}
          label="Vib Delay"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.vibratoSpeed}
          min={0}
          max={255}
          onChange={(v) => updST('vibratoSpeed', Math.round(v))}
          label="Vib Speed"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.vibratoMaxDepth}
          min={0}
          max={255}
          onChange={(v) => updST('vibratoMaxDepth', Math.round(v))}
          label="Vib Max"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.pitchShift}
          min={0}
          max={7}
          onChange={(v) => updST('pitchShift', Math.round(v))}
          label="Pitch Shift"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>

      {/* Misc */}
      <SectionHeading text="MISC" />
      <layoutContainer layout={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
        <PixiKnob
          value={st.priority}
          min={0}
          max={255}
          onChange={(v) => updST('priority', Math.round(v))}
          label="Priority"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.sampleIdx}
          min={0}
          max={29}
          onChange={(v) => updST('sampleIdx', Math.round(v))}
          label="Sample"
          size={KNOB_SIZE}
          defaultValue={0}
        />
        <PixiKnob
          value={st.chain}
          min={0}
          max={32}
          onChange={(v) => updST('chain', Math.round(v))}
          label="Chain"
          size={KNOB_SIZE}
          defaultValue={0}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
