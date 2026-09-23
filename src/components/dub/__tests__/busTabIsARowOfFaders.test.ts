import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "the sliders in the dub deck in the bus tab are full width that makes them
 * hard to control put more sliders side by side and make the page less tall"
 * (2026-09-22).
 *
 * The tab stacked five raw `<input type="range">` one per row. It is now one
 * row of design-system `<Fader>`s in two labelled groups, so the tab is one
 * fader tall and nothing in it is a raw range input (component allowlist).
 */
const DECK = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');
const start = DECK.indexOf("{activeTab === 'bus' && (");
const TAB = DECK.slice(start, DECK.indexOf('\n      )}', start));

describe('the BUS tab is one row of faders', () => {
  it('exists', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('uses the design-system Fader for every continuous control, never a raw range input', () => {
    expect(TAB).not.toContain('type="range"');
    expect((TAB.match(/<Fader\s+label=/g) ?? []).length, "one Fader per continuous control").toBe(5);
  });

  it('keeps the master and wet-bus groups, side by side', () => {
    expect(TAB).toContain('Master — shapes the whole mix');
    expect(TAB).toContain('Wet bus — echo and spring return only');
    // Groups are siblings in one flex row, each holding a row of faders.
    expect((TAB.match(/className="flex items-end gap-4 px-1"/g) ?? []).length).toBe(2);
  });

  it('labels in full English words', () => {
    for (const label of ['BASS', 'MID', 'WIDTH', 'SWEEP', 'RATE']) {
      expect(TAB).toContain(`label="${label}"`);
    }
  });
});
