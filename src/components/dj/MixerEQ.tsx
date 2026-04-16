/**
 * MixerEQ - Filter + 3-band EQ with kill switches for one DJ deck
 *
 * Horizontal layout: knobs laid out in rows across both decks.
 * Each EQ band has a kill switch button that mutes the frequency range.
 */

import React, { useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import * as DJActions from '@/engine/dj/DJActions';

interface MixerEQProps {
  deckId: 'A' | 'B' | 'C';
}

/** Single filter knob for one deck */
export const MixerFilterKnob: React.FC<MixerEQProps> = ({ deckId }) => {
  const filterPosition = useDJStore((s) => s.decks[deckId].filterPosition);

  const handleChange = useCallback((value: number) => {
    DJActions.setDeckFilter(deckId, value);
  }, [deckId]);

  const formatFilter = useCallback((val: number) => {
    if (Math.abs(val) < 0.01) return 'OFF';
    if (val < 0) return 'HPF';
    return 'LPF';
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';

  return (
    <Knob
      value={filterPosition}
      min={-1}
      max={1}
      onChange={handleChange}
      label="FLT"
      size="sm"
      color="#aa44ff"
      bipolar
      defaultValue={0}
      formatValue={formatFilter}
      hideValue
      title={`Deck ${deckNum} Filter — left: high-pass, center: off, right: low-pass`}
    />
  );
};

/** Single EQ band knob + kill switch for one deck */
export const MixerEQBandKnob: React.FC<{
  deckId: 'A' | 'B' | 'C';
  band: 'high' | 'mid' | 'low';
  label: string;
  color: string;
  side: 'left' | 'right';
}> = ({ deckId, band, label, color, side }) => {
  const eqValue = useDJStore((s) => s.decks[deckId][`eq${band.charAt(0).toUpperCase() + band.slice(1)}` as 'eqHigh' | 'eqMid' | 'eqLow']);
  const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqHighKill' | 'eqMidKill' | 'eqLowKill';
  const killActive = useDJStore((s) => s.decks[deckId][killKey]);

  const handleChange = useCallback((dB: number) => {
    DJActions.setDeckEQ(deckId, band, dB);
  }, [deckId, band]);

  const handleKillDown = useCallback(() => {
    DJActions.setDeckEQKill(deckId, band, true);
  }, [deckId, band]);

  const handleKillUp = useCallback(() => {
    DJActions.setDeckEQKill(deckId, band, false);
  }, [deckId, band]);

  const formatEQ = useCallback((val: number) => {
    if (val === 0) return '0';
    return `${val > 0 ? '+' : ''}${val.toFixed(0)}`;
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';
  const bandDesc = band === 'high' ? 'treble' : band === 'low' ? 'bass' : 'mid';

  const killButton = (
    <button
      onPointerDown={handleKillDown}
      onPointerUp={handleKillUp}
      onPointerLeave={handleKillUp}
      className={`
        w-4 h-4 rounded-sm text-[7px] font-black leading-none
        flex items-center justify-center flex-shrink-0
        transition-all duration-75
        ${
          killActive
            ? 'bg-red-600 text-text-primary shadow-[0_0_6px_rgba(220,38,38,0.5)]'
            : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover border border-dark-border'
        }
      `}
      title={`Hold to kill ${label}`}
    >
      K
    </button>
  );

  return (
    <div className="flex items-center gap-0.5">
      {side === 'left' && killButton}
      <Knob
        value={eqValue}
        min={-12}
        max={12}
        onChange={handleChange}
        label={label}
        size="sm"
        color={color}
        bipolar
        defaultValue={0}
        formatValue={formatEQ}
        hideValue
        title={`Deck ${deckNum} EQ ${label} — ${bandDesc} (-12 to +12 dB)`}
      />
      {side === 'right' && killButton}
    </div>
  );
};

/** Full EQ column (legacy — kept for backward compat if needed) */
export const MixerEQ: React.FC<MixerEQProps> = ({ deckId }) => {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <MixerFilterKnob deckId={deckId} />
      <MixerEQBandKnob deckId={deckId} band="high" label="HI" color="#00d4ff" side={deckId === 'A' ? 'left' : 'right'} />
      <MixerEQBandKnob deckId={deckId} band="mid" label="MID" color="#cccccc" side={deckId === 'A' ? 'left' : 'right'} />
      <MixerEQBandKnob deckId={deckId} band="low" label="LO" color="#ff8800" side={deckId === 'A' ? 'left' : 'right'} />
    </div>
  );
};
