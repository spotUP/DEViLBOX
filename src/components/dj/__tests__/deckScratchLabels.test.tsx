/**
 * SCR-P1.12: the DeckScratch buttons and the default scratch pads show the
 * gesture's full English name (CLAUDE.md "Full English words in UI labels");
 * the legacy `shortName` abbreviations are rendered nowhere.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/engine/dj/DJActions', () => ({
  playDeckPattern: () => {}, finishDeckPatternCycle: () => {}, stopDeckPattern: () => {},
  startDeckFaderLFO: () => {}, stopDeckFaderLFO: () => {},
}));

import { DeckScratch } from '../DeckScratch';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';
import { getGesture } from '@/engine/dj/scratch/scratchGestureCatalog';
import { DEFAULT_SCRATCH_PADS } from '@/constants/djPadModeDefaults';

/** The legacy `shortName` abbreviations (not words): must appear on no label. */
const ABBREVIATIONS = ['Trans', 'Hydro', 'Scrbl', 'Twdl', '8Crb', '3Flr', 'Phasr', 'Vibr'];

afterEach(cleanup);

describe('scratch UI labels are full English words', () => {
  it('every DeckScratch pattern button shows the gesture name, never an abbreviation', () => {
    const { container } = render(<DeckScratch deckId="A" />);
    const names = new Set(SCRATCH_PATTERNS.map((p) => p.name));
    const buttons = Array.from(container.querySelectorAll('button[title]')).filter((b) => names.has(b.getAttribute('title') ?? ''));
    expect(buttons).toHaveLength(SCRATCH_PATTERNS.length);
    for (const button of buttons) {
      const label = button.textContent?.trim() ?? '';
      const pattern = SCRATCH_PATTERNS.find((p) => p.name === button.getAttribute('title'))!;
      expect(pattern).toBeDefined();
      expect(label).toBe(getGesture(pattern.gestureId).name);
      expect(ABBREVIATIONS, label).not.toContain(label);
      expect(label).not.toMatch(/\d[A-Za-z]/);   // "8Crb", "3Flr"
      expect(label).toMatch(/^[A-Z][A-Za-z-]+( [A-Z][A-Za-z-]+)*$/);
    }
    // the guard has teeth: the abbreviations are the real legacy short names
    const shortNames = new Set(SCRATCH_PATTERNS.map((p) => p.shortName));
    for (const a of ABBREVIATIONS) expect(shortNames, a).toContain(a);
  });

  it('the default scratch pads carry full names', () => {
    const forbidden = new Set([...ABBREVIATIONS, 'Transform', 'Hydro', '8-Crab', '3-Flare']);
    for (const pad of DEFAULT_SCRATCH_PADS) {
      expect(forbidden, pad.label).not.toContain(pad.label);
      expect(pad.label).not.toMatch(/\d[A-Za-z]/);
    }
    expect(DEFAULT_SCRATCH_PADS.map((p) => p.label)).toEqual(expect.arrayContaining(['Hydroplane', 'Eight-Finger Crab', 'Three-Click Flare', 'Transformer']));
  });
});
