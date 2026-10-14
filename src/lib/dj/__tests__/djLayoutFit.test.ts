import { describe, it, expect } from 'vitest';
import { readDjLayoutFit } from '../djLayoutFit';

/** jsdom has no layout: stub the sizes the probe reads. */
function sized(el: HTMLElement, s: { ch: number; sh: number; cw?: number; sw?: number; oh?: number }): HTMLElement {
  Object.defineProperty(el, 'clientHeight', { value: s.ch, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: s.sh, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: s.cw ?? 400, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: s.sw ?? s.cw ?? 400, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: s.oh ?? s.ch, configurable: true });
  return el;
}

function build(): HTMLElement {
  const root = sized(document.createElement('div'), { ch: 700, sh: 700, cw: 1200 });
  root.innerHTML = `
    <div data-dj-scale="regular" data-dj-steps="shortWaveforms compact"></div>
    <div data-dj-region="mixer"><div id="mixer-in"><div data-dj-band="crossfader" data-dj-budget="62"></div></div></div>
    <div data-dj-region="deckA"><div id="deck-in"></div></div>
    <div data-dj-region="deckB" data-dj-scrolls></div>`;
  sized(root.querySelector<HTMLElement>('[data-dj-region="mixer"]')!, { ch: 500, sh: 500 });
  sized(root.querySelector<HTMLElement>('#mixer-in')!, { ch: 500, sh: 850 });
  sized(root.querySelector<HTMLElement>('[data-dj-band="crossfader"]')!, { ch: 66, sh: 66 });
  sized(root.querySelector<HTMLElement>('[data-dj-region="deckA"]')!, { ch: 500, sh: 500 });
  sized(root.querySelector<HTMLElement>('#deck-in')!, { ch: 500, sh: 500 });
  sized(root.querySelector<HTMLElement>('[data-dj-region="deckB"]')!, { ch: 100, sh: 900 });
  return root;
}

describe('DJ layout fit probe', () => {
  it('reports a column whose content is taller than its box as clipped, and a fitting one as not', () => {
    const fit = readDjLayoutFit(build());
    expect(fit.regions.find((r) => r.region === 'mixer')?.clipped).toBe(true);
    expect(fit.regions.find((r) => r.region === 'deckA')?.clipped).toBe(false);
    expect(fit.clipped).toBe(true);
  });

  it('never reports an element marked as scrolling by design', () => {
    const fit = readDjLayoutFit(build());
    expect(fit.regions.some((r) => r.region === 'deckB')).toBe(false);
  });

  it('reads the tier, the give-way steps and each band budget against its real height', () => {
    const fit = readDjLayoutFit(build());
    expect(fit.tier).toBe('regular');
    expect(fit.steps).toEqual(['shortWaveforms', 'compact']);
    expect(fit.bands).toEqual([{ band: 'crossfader', region: 'mixer', budgeted: 62, actual: 66 }]);
  });
});
