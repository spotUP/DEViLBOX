/**
 * DeckPanelTabs - the lower panel of a DJ deck: one tab open at a time.
 *
 *   Pads        DeckFXPads (FX / Beat Jump / Dub pages)
 *   Scratch     DeckScratch (every pattern as a wrapping pad grid, fader LFO)
 *   Loop & Cue  DeckCuePoints, DeckLoopControls, DeckQuantize
 *   Mix         DeckQuickEQ, DeckStemControls (channel mutes live on the
 *               always-visible deck scopes, not here)
 *
 * The open tab is remembered per deck in useDJStore (deckPanelTab). The panel has
 * a fixed height and scrolls inside, so switching tabs never resizes the pattern
 * view above it; it never scrolls sideways (min-w-0, overflow-x hidden).
 *
 * Two modes, chosen by the DJ layout (layout.deck.panel):
 *   docked    the body sits under the tab strip and is always open.
 *   onDemand  short screens: only the tab strip takes room. A tab click opens the
 *             body as an overlay above the strip (over the pattern view, which is
 *             therefore never resized); clicking the open tab again or Escape closes it.
 */

import React, { useEffect } from 'react';
import { useDJStore, type DeckPanelTab } from '@/stores/useDJStore';
import { TabStrip, type TabStripTab } from '@components/ui/TabStrip';
import { DeckFXPads } from './DeckFXPads';
import { DeckScratch } from './DeckScratch';
import { DeckCuePoints } from './DeckCuePoints';
import { DeckLoopControls } from './DeckLoopControls';
import { DeckQuantize } from './DeckQuantize';
import { DeckQuickEQ } from './DeckQuickEQ';
import { DeckStemControls } from './DeckStemControls';
import { useDJLayoutContext } from './DJLayoutContext';

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
  const panelOpen = useDJStore((s) => s.deckPanelOpen[deckId]);
  const setPanelOpen = useDJStore((s) => s.setDeckPanelOpen);
  const layout = useDJLayoutContext();
  const onDemand = layout.deck.panel === 'onDemand';
  const open = !onDemand || panelOpen;

  const select = (id: DeckPanelTab): void => {
    if (onDemand && id === tab && panelOpen) {
      setPanelOpen(deckId, false);
      return;
    }
    setTab(deckId, id);
    if (onDemand) setPanelOpen(deckId, true);
  };

  useEffect(() => {
    if (!onDemand || !panelOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useDJStore.getState().setDeckPanelOpen(deckId, false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDemand, panelOpen, deckId]);

  const body = open && (
    <div
      role="tabpanel"
      data-deck-panel-body
      data-dj-scrolls
      className={`min-w-0 overflow-x-hidden overflow-y-auto ${
        onDemand ? 'absolute bottom-full inset-x-0 mb-1 z-20 bg-dark-bg border border-dark-border rounded' : ''
      }`}
      style={{ height: layout.deck.panelBodyHeight }}
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
        </div>
      )}
    </div>
  );

  return (
    <div
      className="relative flex flex-col gap-1 min-w-0 flex-shrink-0"
      data-deck-panel-tabs
      data-deck-panel-mode={layout.deck.panel}
      data-dj-band="panel"
      data-dj-budget={layout.budgets.panel}
    >
      <TabStrip tabs={DECK_PANEL_TABS} active={tab} onChange={select} ariaLabel={`Deck ${deckId} panel`} dense={layout.scale === 'compact'} />
      {body}
    </div>
  );
};
