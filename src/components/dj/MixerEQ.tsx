/**
 * MixerEQ - 3-band EQ with kill switches for one DJ deck
 *
 * Vertical stack: High, Mid, Low knobs (top to bottom, like a real mixer).
 * Each band has a kill switch button that mutes the frequency range.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerEQProps {
  deckId: 'A' | 'B';
}

interface EQKillState {
  high: boolean;
  mid: boolean;
  low: boolean;
}

const BANDS = [
  { key: 'high' as const, label: 'HI', color: '#00d4ff' },
  { key: 'mid' as const, label: 'MID', color: '#cccccc' },
  { key: 'low' as const, label: 'LO', color: '#ff8800' },
] as const;

export const MixerEQ: React.FC<MixerEQProps> = ({ deckId }) => {
  // Read display values from store
  const eqHigh = useDJStore((s) => s.decks[deckId].eqHigh);
  const eqMid = useDJStore((s) => s.decks[deckId].eqMid);
  const eqLow = useDJStore((s) => s.decks[deckId].eqLow);
  const eqHighKill = useDJStore((s) => s.decks[deckId].eqHighKill);
  const eqMidKill = useDJStore((s) => s.decks[deckId].eqMidKill);
  const eqLowKill = useDJStore((s) => s.decks[deckId].eqLowKill);

  const eqValues = { high: eqHigh, mid: eqMid, low: eqLow };
  const killState: EQKillState = { high: eqHighKill, mid: eqMidKill, low: eqLowKill };

  // Ref for kill state used in toggle callbacks (avoids stale closure)
  const killRef = useRef(killState);
  useEffect(() => {
    killRef.current = killState;
  }, [eqHighKill, eqMidKill, eqLowKill]);

  const handleEQChange = useCallback((band: 'low' | 'mid' | 'high', dB: number) => {
    useDJStore.getState().setDeckEQ(deckId, band, dB);
    getDJEngine().getDeck(deckId).setEQ(band, dB);
  }, [deckId]);

  const handleKillToggle = useCallback((band: 'low' | 'mid' | 'high') => {
    const current = killRef.current[band];
    useDJStore.getState().setDeckEQKill(deckId, band, !current);
    getDJEngine().getDeck(deckId).setEQKill(band, !current);
  }, [deckId]);

  const formatEQ = useCallback((val: number) => {
    if (val === 0) return '0';
    return `${val > 0 ? '+' : ''}${val.toFixed(0)}`;
  }, []);

  return (
    <div className="flex flex-col items-center gap-0.5">
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
          />
          <button
            onClick={() => handleKillToggle(key)}
            className={`
              w-3.5 h-3.5 rounded-sm border transition-colors flex-shrink-0
              ${
                killState[key]
                  ? 'bg-red-600 border-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : 'bg-dark-bgTertiary border-dark-borderLight hover:border-dark-border'
              }
            `}
            title={`Kill ${label}`}
          />
        </div>
      ))}
    </div>
  );
};
