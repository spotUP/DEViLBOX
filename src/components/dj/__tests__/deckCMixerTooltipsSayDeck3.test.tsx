/**
 * Deck C's mixer controls were called "Deck 2" in their tooltips: the number was
 * worked out with `deckId === 'A' ? '1' : '2'`, which turns C into 2. Every mixer
 * control asks deckNumber() now (A = 1, B = 2, C = 3).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/engine/dj/DJActions', () => ({
  setDeckFilter: () => {}, setDeckEQ: () => {}, setDeckEQKill: () => {}, setDeckVolume: () => {},
  setDeckTrimGain: () => {}, setDeckGain: () => {}, setDeckAutoGain: () => {},
}));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => { throw new Error('engine not ready'); },
}));

import { MixerFilterKnob, MixerEQBandKnob } from '../MixerEQ';
import { MixerFilter } from '../MixerFilter';
import { MixerChannelStrip } from '../MixerChannelStrip';
import { MixerVUMeter } from '../MixerVUMeter';
import { deckNumber } from '@/lib/deckIdentity';

afterEach(cleanup);

function titles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[title]')).map((e) => e.getAttribute('title') ?? '');
}

describe('mixer tooltips name the deck by its number', () => {
  it('deckNumber maps A, B and C to 1, 2 and 3', () => {
    expect([deckNumber('A'), deckNumber('B'), deckNumber('C')]).toEqual(['1', '2', '3']);
  });

  it.each([
    ['filter knob', () => <MixerFilterKnob deckId="C" />],
    ['EQ band knob', () => <MixerEQBandKnob deckId="C" band="high" label="HI" side="left" />],
    ['filter panel', () => <MixerFilter deckId="C" />],
    ['channel strip', () => <MixerChannelStrip deckId="C" />],
    ['level meter', () => <MixerVUMeter deckId="C" />],
  ])('Deck C %s says Deck 3 and never Deck 2', (_name, el) => {
    const { container } = render(el());
    const deckTitles = titles(container).filter((t) => /Deck \d/.test(t));
    expect(deckTitles.length).toBeGreaterThan(0);
    for (const t of deckTitles) {
      expect(t).toContain('Deck 3');
      expect(t).not.toContain('Deck 2');
    }
  });

  it('Deck B still says Deck 2', () => {
    const { container } = render(<MixerChannelStrip deckId="B" />);
    expect(titles(container).some((t) => t.includes('Deck 2'))).toBe(true);
  });
});
