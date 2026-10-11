/**
 * A channel card's sound-shaping slot: which effect shapes the channel's dub
 * send (Off, High Pass, Low Pass, Ring Mod, Lo-fi, Wobble, Saturation), and
 * that effect's one main parameter as a knob. Replaced the filter dropdown and
 * cutoff slider (owner, 2026-10-06: "add the sound shaping ones per channel").
 *
 * Everything about the kinds — labels, units, ranges, defaults — comes from
 * `lib/dub/channelShape.ts`; this component only presents it.
 */
import React, { useCallback, useRef } from 'react';
import { useMixerStore } from '@/stores/useMixerStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { Knob } from '@components/controls/Knob';
import {
  CHANNEL_SHAPE_KINDS,
  CHANNEL_SHAPES,
  describeChannelShape,
  isChannelShapeKind,
  type ChannelShapeKind,
} from '@/lib/dub/channelShape';

const SHAPE_OPTIONS = CHANNEL_SHAPE_KINDS.map((k) => ({ value: k, label: CHANNEL_SHAPES[k].label }));

export interface ChannelShapeSlotProps {
  channel: number;
  disabled: boolean;
}

/** The dropdown: lives in the card's role row. */
export const ChannelShapeSelect: React.FC<ChannelShapeSlotProps> = React.memo(({ channel, disabled }) => {
  const kind = useMixerStore((s) => s.channels[channel]?.dubShape ?? 'off');
  const onChange = useCallback((v: string) => {
    if (isChannelShapeKind(v)) useMixerStore.getState().setChannelDubShape(channel, v);
  }, [channel]);
  return (
    <CustomSelect
      value={kind}
      onChange={onChange}
      options={SHAPE_OPTIONS}
      disabled={disabled}
      className={
        'flex-1 min-w-0 text-[9px] font-mono rounded border ' +
        (kind !== 'off'
          ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
          : 'bg-dark-bgTertiary border-dark-borderLight text-text-muted')
      }
      title={`Ch ${channel + 1} sound shaping — one effect on this channel's dub send, before it joins the bus. Echo, spring, plate, sweep and width stay on the bus.`}
    />
  );
});
ChannelShapeSelect.displayName = 'ChannelShapeSelect';

/** The knob for the chosen effect's main parameter; nothing when Off. */
export const ChannelShapeKnob: React.FC<ChannelShapeSlotProps> = React.memo(({ channel, disabled }) => {
  const kind = useMixerStore((s) => s.channels[channel]?.dubShape ?? 'off');
  const value = useMixerStore((s) => s.channels[channel]?.dubShapeValue ?? 0);
  // The ref pattern (docs/CONTROL_PATTERNS.md): the callback reads the current
  // kind, so a knob turned right after a kind change never writes the old one.
  const kindRef = useRef<ChannelShapeKind>(kind);
  kindRef.current = kind;
  const onChange = useCallback((v: number) => {
    useMixerStore.getState().setChannelDubShape(channel, kindRef.current, v);
  }, [channel]);
  if (kind === 'off') return null;
  const spec = CHANNEL_SHAPES[kind];
  return (
    <Knob
      value={value}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      logarithmic={spec.logarithmic}
      defaultValue={spec.defaultValue}
      onChange={onChange}
      label={spec.paramLabel}
      unit={spec.unit}
      size="sm"
      disabled={disabled}
      formatValue={kind === 'saturation' ? (v) => `${Math.round(v * 100)}%` : undefined}
      title={`Ch ${channel + 1} ${describeChannelShape(kind, value)}`}
    />
  );
});
ChannelShapeKnob.displayName = 'ChannelShapeKnob';
