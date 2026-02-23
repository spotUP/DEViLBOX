/**
 * MixerEQ - 3-band EQ with kill switches for one DJ deck
 *
 * Vertical stack: High, Mid, Low knobs (top to bottom, like a real mixer).
 * Each band has a kill switch button that mutes the frequency range.
 */

import React, { useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerEQProps {
  deckId: 'A' | 'B' | 'C';
}

const BANDS = [
  { key: 'high' as const, label: 'HI', color: '#00d4ff' },
  { key: 'mid' as const, label: 'MID', color: '#cccccc' },
  { key: 'low' as const, label: 'LO', color: '#ff8800' },
] as const;

export const MixerEQ: React.FC<MixerEQProps> = ({ deckId }) => {
  const eqHigh = useDJStore((s) => s.decks[deckId].eqHigh);
  const eqMid = useDJStore((s) => s.decks[deckId].eqMid);
  const eqLow = useDJStore((s) => s.decks[deckId].eqLow);

  const eqValues = { high: eqHigh, mid: eqMid, low: eqLow };

  const handleEQChange = useCallback((band: 'low' | 'mid' | 'high', dB: number) => {
    useDJStore.getState().setDeckEQ(deckId, band, dB);
    getDJEngine().getDeck(deckId).setEQ(band, dB);
  }, [deckId]);

  const formatEQ = useCallback((val: number) => {
    if (val === 0) return '0';
    return `${val > 0 ? '+' : ''}${val.toFixed(0)}`;
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';
  const bandDescriptions = {
    high: 'High frequencies (treble)',
    mid: 'Mid frequencies',
    low: 'Low frequencies (bass)',
  };

  return (
    <div className="flex flex-col items-center gap-0.5" title={`Deck ${deckNum} EQ`}>
      {BANDS.map(({ key, label, color }) => (
        <Knob
          key={key}
          value={eqValues[key]}
          min={-24}
          max={6}
          onChange={(v) => handleEQChange(key, v)}
          label={label}
          size="sm"
          color={color}
          bipolar
          defaultValue={0}
          formatValue={formatEQ}
          title={`Deck ${deckNum} EQ ${label} — ${bandDescriptions[key]} (-24 to +6 dB)`}
        />
      ))}
    </div>
  );
};
