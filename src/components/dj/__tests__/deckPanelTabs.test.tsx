/**
 * DECK-TABS: the deck's lower panel is four tabs (Pads, Scratch, Loop & Cue, Mix),
 * one open per deck, remembered in useDJStore; the pattern view above it keeps the
 * freed height. One reachability test for the wiring, then the layout properties
 * that make the 499 px deck panel fit (jsdom has no layout engine: the pixel
 * heights and scrollWidth are measured live through the MCP, see the ledger).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../DeckFXPads', () => ({ DeckFXPads: () => <div data-testid="pads" /> }));
vi.mock('../DeckCuePoints', () => ({ DeckCuePoints: () => <div data-testid="cues" /> }));
vi.mock('../DeckLoopControls', () => ({ DeckLoopControls: () => <div data-testid="loops" /> }));
vi.mock('../DeckQuantize', () => ({ DeckQuantize: () => <div data-testid="quantize" /> }));
vi.mock('../DeckQuickEQ', () => ({ DeckQuickEQ: () => <div data-testid="eq" /> }));
vi.mock('../DeckStemControls', () => ({ DeckStemControls: () => <div data-testid="stems" /> }));
vi.mock('../DeckChannelToggles', () => ({ DeckChannelToggles: () => <div data-testid="channels" /> }));
// DeckScratch stays real for the layout test; the tab test only needs it to mount.
vi.mock('@/engine/dj/DJActions', () => ({
  playDeckPattern: () => {}, finishDeckPatternCycle: () => {}, stopDeckPattern: () => {},
  startDeckFaderLFO: () => {}, stopDeckFaderLFO: () => {},
}));
vi.mock('@/engine/drumpad/DjFxActions', () => ({ fireDjFx: () => true, releaseDjFx: () => {} }));

import { DeckPanelTabs } from '../DeckPanelTabs';
import { DeckScratch } from '../DeckScratch';
import { useDJStore } from '@/stores/useDJStore';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';

afterEach(() => {
  cleanup();
  for (const d of ['A', 'B', 'C'] as const) useDJStore.getState().setDeckPanelTab(d, 'pads');
});

const EXPECTED: Record<string, string[]> = {
  Pads: ['pads'],
  Scratch: [],
  'Loop & Cue': ['cues', 'loops', 'quantize'],
  Mix: ['eq', 'stems', 'channels'],
};
const ALL_IDS = ['pads', 'cues', 'loops', 'quantize', 'eq', 'stems', 'channels'];

describe('deck lower panel tabs', () => {
  it('each of the four tabs renders its components and only its components', () => {
    const { getByRole, getAllByRole, queryByTestId, container } = render(<DeckPanelTabs deckId="A" />);
    expect(getAllByRole('tab').map((t) => t.textContent)).toEqual(Object.keys(EXPECTED));
    for (const [label, ids] of Object.entries(EXPECTED)) {
      fireEvent.click(getByRole('tab', { name: label }));
      expect(getByRole('tab', { name: label }).getAttribute('aria-selected')).toBe('true');
      for (const id of ALL_IDS) expect(!!queryByTestId(id), `${label}: ${id}`).toBe(ids.includes(id));
      if (label === 'Scratch') {
        const body = container.querySelector('[data-deck-panel-body]') as HTMLElement;
        expect(within(body).getAllByRole('button').length).toBeGreaterThanOrEqual(SCRATCH_PATTERNS.length);
      }
    }
  });

  it('remembers the open tab per deck, in the store', () => {
    const a = render(<DeckPanelTabs deckId="A" />);
    fireEvent.click(a.getByRole('tab', { name: 'Mix' }));
    expect(useDJStore.getState().deckPanelTab).toMatchObject({ A: 'mix', B: 'pads' });
    a.unmount();
    const again = render(<DeckPanelTabs deckId="A" />);
    expect(again.getByRole('tab', { name: 'Mix' }).getAttribute('aria-selected')).toBe('true');
    const b = render(<DeckPanelTabs deckId="B" />);
    expect(within(b.container).getByRole('tab', { name: 'Pads' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('the deck panel fits a 499 px deck', () => {
  it('the panel body never scrolls sideways and has a fixed height', () => {
    const { container } = render(<DeckPanelTabs deckId="A" />);
    const body = container.querySelector('[data-deck-panel-body]') as HTMLElement;
    expect(body.className).toMatch(/\bmin-w-0\b/);
    expect(body.className).toMatch(/\boverflow-x-hidden\b/);
    expect(body.className).toMatch(/\bh-\d+\b/);
  });

  it('every scratch pattern is a wrapping grid cell, none in a non-wrapping row', () => {
    const { container } = render(<DeckScratch deckId="A" />);
    const grid = container.querySelector('button[title]')!.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toMatch(/^repeat\(auto-fill,/);
    expect(grid.children.length).toBe(SCRATCH_PATTERNS.length);
    expect(container.innerHTML).not.toMatch(/whitespace-nowrap|flex-nowrap/);
  });

  it('the pattern view keeps the freed height: DJDeck no longer stacks the controls under it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../DJDeck.tsx'), 'utf8');
    for (const gone of ['DeckFXPads', 'DeckScratch', 'DeckQuickEQ', 'DeckStemControls', 'DeckCuePoints', 'DeckLoopControls']) {
      expect(src, gone).not.toMatch(new RegExp(`<${gone}\\b`));
    }
    expect(src).toMatch(/<DeckPanelTabs\b/);
    expect(src).toMatch(/flex gap-2 flex-1 min-h-0/); // the pattern/vinyl/visualizer row still grows
  });
});
