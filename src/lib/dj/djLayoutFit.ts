/**
 * djLayoutFit - the real-browser "is anything clipped" probe for the DJ view.
 *
 * jsdom has no layout, so whether a DJ column or band is cut off can only be
 * read from a real browser. This walks the DJ view's `data-dj-region` columns
 * and `data-dj-band` rows and reports, per region, whether its content is
 * taller or wider than its box (scrollHeight/scrollWidth over client size) and,
 * per band, the height it was budgeted (`data-dj-budget`) against the height
 * it actually has. Elements marked `data-dj-scrolls` scroll by design and are
 * never reported as clipped. Exposed over MCP as `get_dj_layout_fit`.
 */

export interface DjFitRegion {
  region: string;
  clientHeight: number;
  scrollHeight: number;
  clientWidth: number;
  scrollWidth: number;
  clipped: boolean;
}

export interface DjFitBand {
  band: string;
  region: string;
  budgeted: number | null;
  actual: number;
}

export interface DjLayoutFit {
  tier: string | null;
  steps: string[];
  input: { width: number; height: number };
  regions: DjFitRegion[];
  bands: DjFitBand[];
  clipped: boolean;
}

/** Tolerance in px: sub-pixel rounding between scroll* and client* is not clipping. */
const CLIP_TOLERANCE = 1;

export function readDjLayoutFit(root: HTMLElement): DjLayoutFit {
  const grid = root.querySelector<HTMLElement>('[data-dj-scale]');
  const regions: DjFitRegion[] = [];
  const bands: DjFitBand[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-dj-region]'))) {
    const region = el.dataset.djRegion ?? '';
    if (el.dataset.djScrolls !== undefined) continue;
    // The column wrapper clips (overflow-hidden) its single child, so the child's
    // scroll size is what shows content that does not fit; take the larger.
    const inner = el.firstElementChild as HTMLElement | null;
    const scrollHeight = Math.max(el.scrollHeight, inner?.scrollHeight ?? 0);
    const scrollWidth = Math.max(el.scrollWidth, inner?.scrollWidth ?? 0);
    const clipped =
      scrollHeight > el.clientHeight + CLIP_TOLERANCE || scrollWidth > el.clientWidth + CLIP_TOLERANCE;
    regions.push({
      region,
      clientHeight: el.clientHeight,
      scrollHeight,
      clientWidth: el.clientWidth,
      scrollWidth,
      clipped,
    });
    for (const b of Array.from(el.querySelectorAll<HTMLElement>('[data-dj-band]'))) {
      const budget = b.dataset.djBudget;
      bands.push({
        band: b.dataset.djBand ?? '',
        region,
        budgeted: budget === undefined ? null : Number(budget),
        actual: Math.round(b.offsetHeight),
      });
    }
  }
  for (const b of Array.from(root.querySelectorAll<HTMLElement>('[data-dj-band="waveform"]'))) {
    if (b.closest('[data-dj-region]')) continue;
    const budget = b.dataset.djBudget;
    bands.push({
      band: 'waveform',
      region: 'waveforms',
      budgeted: budget === undefined ? null : Number(budget),
      actual: Math.round(b.offsetHeight),
    });
  }
  return {
    tier: grid?.dataset.djScale ?? null,
    steps: (grid?.dataset.djSteps ?? '').split(' ').filter(Boolean),
    input: { width: root.clientWidth, height: root.clientHeight },
    regions,
    bands,
    clipped: regions.some((r) => r.clipped),
  };
}
