/**
 * DeckPanelTabs - the lower panel of a DJ deck: one tab open at a time.
 *
 *   Pads        DeckFXPads (FX / Beat Jump / Dub pages)
 *   Scratch     DeckScratch (every pattern as a wrapping pad grid, fader LFO)
 *   Loop & Cue  DeckCuePoints, DeckLoopControls, DeckQuantize
 *   Mix         DeckQuickEQ, DeckStemControls, DeckChannelToggles
 *
 * The open tab is remembered per deck in useDJStore (deckPanelTab). The panel has
 * a fixed height and scrolls inside, so switching tabs never resizes the pattern
 * view above it; it never scrolls sideways (min-w-0, overflow-x hidden).
 */

import React from 'react';
import { useDJStore, type DeckPanelTab } from '@/stores/useDJStore';
import { TabStrip, type TabStripTab } from '@components/ui/TabStrip';
import { DeckFXPads } from './DeckFXPads';
import { DeckScratch } from './DeckScratch';
import { DeckCuePoints } from './DeckCuePoints';
import { DeckLoopControls } from './DeckLoopControls';
import { DeckQuantize } from './DeckQuantize';
import { DeckQuickEQ } from './DeckQuickEQ';
import { DeckStemControls } from './DeckStemControls';
import { DeckChannelToggles } from './DeckChannelToggles';

interface DeckPanelTabsProps {
  deckId: 'A' | 'B' | 'C';
}

const DECK_PANEL_TABS: ReadonlyArray<TabStripTab<DeckPanelTab>> = [
  { id: 'pads', label: 'Pads', title: 'FX, beat jump and dub pads' },
  { id: 'scratch', label: 'Scratch', title: 'Scratch patterns and fader LFO' },
  { id: 'loopcue', label: 'Loop & Cue', title: 'Hot cues, loops, slip and quantize' },
  { id: 'mix', label: 'Mix', title: 'EQ presets, stems and channels' },
];

export const DeckPanelTabs: React.FC<DeckPanelTabsProps> = ({ deckId }) => {
  const tab = useDJStore((s) => s.deckPanelTab[deckId]);
  const setTab = useDJStore((s) => s.setDeckPanelTab);

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-shrink-0" data-deck-panel-tabs>
      <TabStrip tabs={DECK_PANEL_TABS} active={tab} onChange={(id) => setTab(deckId, id)} ariaLabel={`Deck ${deckId} panel`} />
      <div
        role="tabpanel"
        data-deck-panel-body
        className="h-44 min-w-0 overflow-x-hidden overflow-y-auto"
      >
        {tab === 'pads' && <DeckFXPads deckId={deckId} />}
        {tab === 'scratch' && <DeckScratch deckId={deckId} />}
        {tab === 'loopcue' && (
          <div className="flex flex-col gap-2 min-w-0">
            <DeckCuePoints deckId={deckId} />
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <DeckLoopControls deckId={deckId} />
              <DeckQuantize />
            </div>
          </div>
        )}
        {tab === 'mix' && (
          <div className="flex flex-col gap-2 min-w-0">
            <DeckQuickEQ deckId={deckId} />
            <DeckStemControls deckId={deckId} />
            <DeckChannelToggles deckId={deckId} />
          </div>
        )}
      </div>
    </div>
  );
};
