/**
 * MixerEQ - 3-band EQ with kill switches for one DJ deck
 *
 * Vertical stack: High, Mid, Low knobs (top to bottom, like a real mixer).
 * Each band has a kill switch button that mutes the frequency range.
 * Kill switches snap to beat/bar boundaries when quantize is enabled.
 */

import React, { useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { quantizedEQKill, getQuantizeMode } from '@/engine/dj/DJQuantizedFX';

interface MixerEQProps {
  deckId: 'A' | 'B' | 'C';
}

const BANDS = [
  { key: 'high' as const, label: 'HI', color: '#00d4ff', killKey: 'eqHighKill' as const },
  { key: 'mid' as const, label: 'MID', color: '#cccccc', killKey: 'eqMidKill' as const },
  { key: 'low' as const, label: 'LO', color: '#ff8800', killKey: 'eqLowKill' as const },
] as const;

export const MixerEQ: React.FC<MixerEQProps> = ({ deckId }) => {
  const eqHigh = useDJStore((s) => s.decks[deckId].eqHigh);
  const eqMid = useDJStore((s) => s.decks[deckId].eqMid);
  const eqLow = useDJStore((s) => s.decks[deckId].eqLow);
  const killHigh = useDJStore((s) => s.decks[deckId].eqHighKill);
  const killMid = useDJStore((s) => s.decks[deckId].eqMidKill);
  const killLow = useDJStore((s) => s.decks[deckId].eqLowKill);

  const eqValues = { high: eqHigh, mid: eqMid, low: eqLow };
  const killValues = { high: killHigh, mid: killMid, low: killLow };

  const handleEQChange = useCallback((band: 'low' | 'mid' | 'high', dB: number) => {
    useDJStore.getState().setDeckEQ(deckId, band, dB);
    getDJEngine().getDeck(deckId).setEQ(band, dB);
  }, [deckId]);

  const handleKillToggle = useCallback((band: 'low' | 'mid' | 'high') => {
    const current = useDJStore.getState().decks[deckId][
      `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqLowKill' | 'eqMidKill' | 'eqHighKill'
    ];
    const newKill = !current;

    // Update store immediately for UI feedback
    useDJStore.getState().setDeckEQKill(deckId, band, newKill);

    // Apply via quantized system (snaps to beat boundary if quantize is on)
    if (getQuantizeMode() !== 'off') {
      quantizedEQKill(deckId, band, newKill);
    } else {
      getDJEngine().getDeck(deckId).setEQKill(band, newKill);
    }
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
        <div key={key} className="flex items-center gap-0.5">
          <Knob
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
          <button
            onClick={() => handleKillToggle(key)}
            className={`
              w-4 h-4 rounded-sm text-[7px] font-black leading-none
              flex items-center justify-center
              transition-all duration-75
              ${
                killValues[key]
                  ? 'bg-red-600 text-white shadow-[0_0_6px_rgba(220,38,38,0.5)]'
                  : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover border border-dark-border'
              }
            `}
            title={`${killValues[key] ? 'Unmute' : 'Kill'} ${label} (${getQuantizeMode() !== 'off' ? 'quantized' : 'instant'})`}
          >
            K
          </button>
        </div>
      ))}
    </div>
  );
};
