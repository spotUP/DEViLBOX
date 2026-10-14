/**
 * The DJ layout solver (DJ-VIEW-RESOLUTIONS): one pure function from the DJ view's
 * box and contents to every band size. This table runs the eight target screens
 * through it, on two and three decks, with Deck C as the scratch deck or holding a
 * track, with the dub bus off and on, and asserts that nothing needs the floor and
 * every column's budget fits the row. jsdom has no layout: whether the REAL content
 * is as tall as its budget is the real-browser sweep (tools/dj-layout-sweep.ts,
 * test-data/dj-layout-fit.json).
 */
import { describe, it, expect } from 'vitest';
import { djLayout, DJ_SIZES, type DjLayoutInput, type DjDeckCKind } from '../djLayout';
import { DJ_LAYOUT_LIMITS } from '@hooks/useBreakpoint';

const SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440],
];
const BROWSER_CHROME = 100;
const STATUS_BAR = 30;

function inputFor(w: number, h: number, decks: 2 | 3, deckC: DjDeckCKind, dubBusOn: boolean): DjLayoutInput {
  const bar = w < DJ_SIZES.topBar.contentWidth ? DJ_SIZES.topBar.wrapped : DJ_SIZES.topBar.single;
  return {
    width: w,
    height: h - BROWSER_CHROME - STATUS_BAR - bar,
    deckCount: decks,
    deckC: decks === 3 ? deckC : null,
    waveformCount: decks,
    dubBusOn,
    pointer: 'fine',
  };
}

const CELLS = SCREENS.flatMap(([w, h]) => [
  { w, h, decks: 2 as const, deckC: null, label: `${w}x${h} 2 decks` },
  { w, h, decks: 3 as const, deckC: 'scratchOnly' as const, label: `${w}x${h} 3 decks, Deck C scratch` },
  { w, h, decks: 3 as const, deckC: 'track' as const, label: `${w}x${h} 3 decks, Deck C track` },
]);

describe('djLayout: every target screen fits', () => {
  for (const dub of [false, true]) {
    for (const cell of CELLS) {
      it(`${cell.label}${dub ? ', dub bus on' : ''}: no floor, mixer and every deck kind fit the row`, () => {
        const l = djLayout(inputFor(cell.w, cell.h, cell.decks, cell.deckC, dub));
        expect(l.floor.scroll, 'the solver reached the floor').toBe(false);
        expect(l.mixer.needed).toBeLessThanOrEqual(l.rowHeight);
        expect(l.deck.need).toBeLessThanOrEqual(l.rowHeight);
        // The pattern view is drawn exactly where it keeps its minimum height (D1).
        expect(l.deck.showPattern.track).toBe(l.deck.patternHeight.track >= DJ_LAYOUT_LIMITS.patternMinPx);
        expect(l.deck.showPattern.trackC).toBe(l.deck.patternHeight.trackC >= DJ_LAYOUT_LIMITS.patternMinPx);
      });
    }
  }
});

describe('djLayout: pinned outcomes (the same ones the real-Chrome sweep found)', () => {
  // [screen, decks, deckC, scale, steps] - cross-checked against test-data/dj-layout-fit.json
  const PINNED: ReadonlyArray<[number, number, 2 | 3, DjDeckCKind, string, string[]]> = [
    [1280, 720, 2, null, 'compact', ['mixerExtrasPopover', 'shortWaveforms', 'deckPanelOnDemand', 'compact']],
    [1280, 720, 3, 'scratchOnly', 'compact', ['mixerExtrasPopover', 'shortWaveforms', 'deckPanelOnDemand', 'compact']],
    [1366, 768, 3, 'scratchOnly', 'compact', ['mixerExtrasPopover', 'shortWaveforms', 'deckPanelOnDemand', 'compact']],
    [1512, 982, 2, null, 'regular', ['mixerExtrasPopover']],
    [1728, 1117, 2, null, 'regular', []],
    [1920, 1080, 2, null, 'regular', ['mixerExtrasPopover']],
    [2560, 1440, 2, null, 'large', []],
    [2560, 1440, 3, 'scratchOnly', 'large', []],
  ];
  for (const [w, h, decks, deckC, scale, steps] of PINNED) {
    it(`${w}x${h}, ${decks} decks -> ${scale} [${steps.join(', ')}]`, () => {
      const l = djLayout(inputFor(w, h, decks, deckC, false));
      expect(l.scale).toBe(scale);
      expect([...l.steps]).toEqual(steps);
    });
  }
});

describe('djLayout: what each give-way step changes', () => {
  const roomy = djLayout(inputFor(1728, 1117, 2, null, false));
  const tight = djLayout(inputFor(1280, 720, 3, 'scratchOnly', false));

  it('a roomy screen gives way to nothing: inline extras, docked panel, regular sizes', () => {
    expect(roomy.steps).toEqual([]);
    expect(roomy.mixer.extras).toBe('inline');
    expect(roomy.deck.panel).toBe('docked');
    expect(roomy.waveformHeight).toBe(DJ_SIZES.waveform.regular);
  });

  it('a tight screen moves the extras to a popover, shortens the waveforms, opens the panel on demand and goes compact', () => {
    expect(tight.mixer.extras).toBe('popover');
    expect(tight.waveformHeight).toBe(DJ_SIZES.waveform.short);
    expect(tight.deck.panel).toBe('onDemand');
    expect(tight.mixer.knob).toBe('xs');
    expect(tight.deck.platter).toBe(DJ_SIZES.platter.compact);
    expect(tight.deck.transportButton).toBe(DJ_SIZES.transportButton.compact);
  });

  it('the mixer column is content width at every size (the 400 px fixed column is gone), 3 decks wider than 2', () => {
    expect(roomy.columns).toBe('minmax(0,1fr) auto minmax(0,1fr)');
    expect(tight.columns).toBe('minmax(0,1fr) auto minmax(0,1fr) minmax(0,1fr)');
  });

  it('2560x1440 grows the controls: large platter, scopes, mixer knobs, waveforms and panel body', () => {
    const large = djLayout(inputFor(2560, 1440, 2, null, false));
    expect(large.scale).toBe('large');
    expect(large.deck.platter).toBe(DJ_SIZES.platter.large);
    expect(large.deck.scope).toBe(DJ_SIZES.scope.large);
    expect(large.mixer.knob).toBe('md');
    expect(large.waveformHeight).toBe(DJ_SIZES.waveform.large);
    expect(large.deck.panelBodyHeight).toBe(DJ_SIZES.panelBody.large);
    expect(large.mixer.camelotWheel).toBe(DJ_SIZES.mixer.camelotWheel.large);
  });

  it('the dub bus FX WET row sits inline until the mixer goes compact, then joins the popover', () => {
    expect(djLayout(inputFor(1920, 1080, 2, null, true)).mixer.fxWet).toBe('inline');
    expect(djLayout(inputFor(1280, 720, 3, 'scratchOnly', true)).mixer.fxWet).toBe('popover');
  });

  it('a pointer type is echoed and moves no size (D5 is undecided)', () => {
    const base = inputFor(1366, 768, 2, null, false);
    const fine = djLayout({ ...base, pointer: 'fine' });
    const coarse = djLayout({ ...base, pointer: 'coarse' });
    expect(coarse.pointer).toBe('coarse');
    expect(fine.pointer).toBe('fine');
    expect({ ...coarse, pointer: 'fine', input: fine.input }).toEqual(fine);
  });

  it('a box smaller than anything the solver can fit reaches the floor: the view scrolls at a minimum height', () => {
    const l = djLayout({ width: 900, height: 300, deckCount: 3, deckC: 'scratchOnly', waveformCount: 3, dubBusOn: false, pointer: 'fine' });
    expect(l.floor.scroll).toBe(true);
    expect(l.floor.minHeight).toBeGreaterThan(300);
  });
});
