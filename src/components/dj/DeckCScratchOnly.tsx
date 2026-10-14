/**
 * DeckCScratchOnly - Deck C while it is the scratch deck (no track loaded on it): label, BPM readout, platter,
 * the strokes' Scratch Fader and Slip lanes, a WAV phrase drop hint and the scratch pads on the selected crate
 * record. Every control that acts on DeckEngine('C') (transport, pitch, loops, EQ, stems, FX, dub) is not
 * rendered: the scratch bus does not pass through them (census thoughts/shared/research/2026-10-14_deck-c-controls.md).
 * Tempo is not editable here: useDJStore.followSetTempo writes decks.C.effectiveBPM from the master deck.
 */

import React from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { DeckTurntable } from './DeckTurntable';
import { DeckCssTurntable } from './DeckCssTurntable';
import { DeckCScratchLanes } from './DeckCScratchLanes';
import { DeckScratch } from './DeckScratch';
import { useDJLayoutContext } from './DJLayoutContext';

interface DeckCScratchOnlyProps {
  deckNum: string;
  deckColor: string;
}

export const DeckCScratchOnly: React.FC<DeckCScratchOnlyProps> = ({ deckNum, deckColor }) => {
  const bpm = useDJStore((s) => s.decks.C.effectiveBPM);
  const deckViewMode = useDJStore((s) => s.deckViewMode);
  const layout = useDJLayoutContext();

  return (
    <div className="flex flex-col min-w-0 flex-1 min-h-0" style={{ gap: layout.deck.gap }} data-deck-c-scratch-only>
      <div className="flex items-start gap-2" data-dj-band="header" data-dj-budget={layout.budgets.scratchHeader}>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-mono font-bold tracking-[0.3em] uppercase ${deckColor} opacity-60 mb-1`}>
            Deck {deckNum}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-text-primary">
              {bpm > 0 ? bpm.toFixed(1) : '---.-'}
            </span>
            <span className="text-xs text-text-muted uppercase tracking-wider">BPM</span>
          </div>
          <div className="text-[10px] font-mono text-text-muted mt-1 truncate" title="Drop a WAV file here to use it as a scratch phrase">Drop a WAV file here to use it as a scratch phrase</div>
        </div>
        {deckViewMode === 'visualizer' && <DeckTurntable deckId="C" />}
      </div>
      {deckViewMode === 'vinyl' && (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <DeckCssTurntable deckId="C" />
        </div>
      )}
      <div data-dj-band="lanes" data-dj-budget={layout.budgets.lanes}>
        <DeckCScratchLanes />
      </div>
      {/* The pad grid is a bounded region that scrolls inside: the deck column itself never scrolls. */}
      <div className="flex-1 min-h-0 overflow-y-auto" data-dj-scrolls>
        <DeckScratch deckId="C" />
      </div>
    </div>
  );
};
