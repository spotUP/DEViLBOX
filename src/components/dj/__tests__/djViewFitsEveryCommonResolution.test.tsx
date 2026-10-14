/**
 * DJ-VIEW-RESOLUTIONS reachability test (one per feature): the real <DJView /> is
 * mounted at the eight common screen sizes, on two and three decks, and the DOM it
 * renders must be the solver's output (src/lib/dj/djLayout.ts) - the grid columns,
 * the waveform heights, the deck panel mode, the mixer extras, no NavBar - with
 * the budgets of the rendered bands adding up to no more than the row.
 *
 * jsdom has no layout engine: this proves the WIRING and the arithmetic. Whether a
 * band's real content is taller than its budget is a real-browser fact, checked by
 * tools/dj-layout-sweep.ts (test-data/dj-layout-fit.json).
 *
 * Mocked: only what jsdom cannot run - the engine, workers, canvases, the WebGL
 * overlay and the heavy leaf widgets that need them. DJView, DJDeck, DJMixer,
 * DeckPanelTabs, DeckAudioWaveform, the layout hook and the solver are real.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const { deepStub, leaf } = vi.hoisted(() => {
  const make = (): unknown => new Proxy(function stub() { /* callable */ }, {
    get: (_t, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : make()),
    apply: () => make(),
  });
  return { deepStub: make, leaf: (name: string) => () => ({ [name]: () => null }) };
});

// Engine, audio and worker seams
vi.mock('tone', async (importOriginal) => ({ ...(await importOriginal<typeof import('tone')>()), start: () => Promise.resolve() }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => deepStub(),
  disposeDJEngine: () => undefined,
  loadChannelScopeRerender: () => undefined,
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => deepStub() }));
vi.mock('@/lib/playback/oneProgrammeAtATime', () => ({ handOverToDJ: () => Promise.resolve() }));
vi.mock('@/engine/dj/DJPlaylistAnalyzer', () => ({ reanalyzeOutdatedTracks: () => Promise.resolve() }));
vi.mock('@/engine/dj/DJPipeline', () => ({ getDJPipeline: () => deepStub() }));
vi.mock('@/engine/dj/DJTrackLoader', () => ({ loadRenderToDeck: () => Promise.resolve() }));
vi.mock('@/engine/dj/DJBeatDetector', () => ({ detectBPM: () => ({ bpm: 120 }) }));
vi.mock('@/engine/dj/DJSongCache', () => ({ cacheSong: () => undefined, clearSongCache: () => undefined }));
vi.mock('@/engine/dj/DJAutoSync', () => ({ getPhaseInfo: () => null }));
vi.mock('@/engine/dj/DJUADEPrerender', () => ({ loadUADEToDeck: () => Promise.resolve() }));
vi.mock('@/lib/import/formats/UADEParser', () => ({ isUADEFormat: () => false }));
vi.mock('@/lib/song/openSong', () => ({ openDeckTrack: () => Promise.resolve({}) }));
vi.mock('@/workers/dj-waveform.worker.ts?worker', () => ({ default: class { postMessage() { /* none */ } terminate() { /* none */ } } }));
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  OffscreenBridge: class { post() { /* none */ } dispose() { /* none */ } },
}));

// Leaf widgets that need a canvas, a worker or WebGL
vi.mock('../DeckTurntable', leaf('DeckTurntable'));
vi.mock('../DeckCssTurntable', leaf('DeckCssTurntable'));
vi.mock('../DeckScopes', leaf('DeckScopes'));
vi.mock('../DeckVisualizer', leaf('DeckVisualizer'));
vi.mock('../DeckPatternDisplay', leaf('DeckPatternDisplay'));
vi.mock('../DeckTrackOverview', leaf('DeckTrackOverview'));
vi.mock('../DeckBeatGrid', leaf('DeckBeatGrid'));
vi.mock('../DeckFXPads', leaf('DeckFXPads'));
vi.mock('../DeckScratch', leaf('DeckScratch'));
vi.mock('../DeckScratchLanes', leaf('DeckScratchLanes'));
vi.mock('../DeckCScratchLanes', leaf('DeckCScratchLanes'));
vi.mock('../DJ3DOverlay', leaf('DJ3DOverlay'));
vi.mock('../DJCratePanel', leaf('DJCratePanel'));
vi.mock('../DJPlaylistModal', leaf('DJPlaylistModal'));
vi.mock('../DJFxQuickPresets', leaf('DJFxQuickPresets'));
vi.mock('../DJControllerSelector', leaf('DJControllerSelector'));
vi.mock('../DJVocoderControl', leaf('DJVocoderControl'));
vi.mock('../DJRemoteControlButton', leaf('DJRemoteControlButton'));
vi.mock('../DJSetBrowser', leaf('DJSetBrowser'));
vi.mock('../DJAutoDJPanel', leaf('DJAutoDJPanel'));
vi.mock('../DJAutoMixNowButton', leaf('DJAutoMixNowButton'));
vi.mock('../DJKeyboardHandler', () => ({ useDJKeyboardHandler: () => undefined }));
vi.mock('../CamelotWheel', leaf('CamelotWheel'));
vi.mock('../MixerVUMeter', leaf('MixerVUMeter'));
vi.mock('../MixerTransition', leaf('MixerTransition'));
vi.mock('../MixerMaster', leaf('MixerMaster'));
vi.mock('../MixerCueSection', leaf('MixerCueSection'));
vi.mock('../MixerCrossfader', leaf('MixerCrossfader'));
vi.mock('../MixerChannelStrip', leaf('MixerChannelStrip'));
vi.mock('../DJSetRecordButton', leaf('DJSetRecordButton'));
vi.mock('../DJMicControl', leaf('DJMicControl'));
vi.mock('../DJVideoExport', leaf('DJVideoExport'));
vi.mock('../DJStreamControl', leaf('DJStreamControl'));
vi.mock('@components/dub/AutoDubPanel', leaf('AutoDubPanel'));
vi.mock('@components/dialogs/SettingsModal', leaf('SettingsModal'));
vi.mock('@/hooks/dj/useDJHealth', () => ({ useDJHealth: () => null }));
vi.mock('@/hooks/dj/useDeckStateSync', () => ({ useDeckStateSync: () => undefined }));

// Sentinel (reachability gate 3b): the real solver, observed.
vi.mock('@/lib/dj/djLayout', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/dj/djLayout')>();
  return { ...real, djLayout: vi.fn(real.djLayout) };
});

import { DJView } from '../DJView';
import { useDJStore } from '@/stores/useDJStore';
import { useUIStore } from '@/stores/useUIStore';
import { djLayout, DJ_SIZES, type DjLayout } from '@/lib/dj/djLayout';

const BROWSER_CHROME = 100;
const STATUS_BAR = 30;

interface Box { width: number; height: number; bar: number }
let box: Box = { width: 1920, height: 1000, bar: 43 };

beforeAll(() => {
  class FakeResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(): void { this.cb([], this as unknown as ResizeObserver); }
    unobserve(): void { /* none */ }
    disconnect(): void { /* none */ }
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

  const isRoot = (el: HTMLElement): boolean => el.hasAttribute('data-dj-view');
  const isBar = (el: HTMLElement): boolean => !!el.parentElement && isRoot(el.parentElement) && el.className.includes('shrink-0') && el.className.includes('border-b');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return isRoot(this) ? box.width : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get(this: HTMLElement) { return isRoot(this) ? box.height : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isBar(this) ? box.bar : 0; } });
});

afterEach(() => {
  cleanup();
  vi.mocked(djLayout).mockClear();
});

const SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440],
];

interface Cell { label: string; w: number; h: number; decks: 2 | 3; deckCTrack: boolean }
const CELLS: Cell[] = [
  ...SCREENS.flatMap(([w, h]): Cell[] => [
    { label: `${w}x${h} 2 decks`, w, h, decks: 2, deckCTrack: false },
    { label: `${w}x${h} 3 decks (Deck C scratch)`, w, h, decks: 3, deckCTrack: false },
  ]),
  { label: '1280x720 3 decks (Deck C track)', w: 1280, h: 720, decks: 3, deckCTrack: true },
  { label: '1920x1080 3 decks (Deck C track)', w: 1920, h: 1080, decks: 3, deckCTrack: true },
];

function setup(cell: Cell): void {
  const bar = cell.w < DJ_SIZES.topBar.contentWidth ? DJ_SIZES.topBar.wrapped : DJ_SIZES.topBar.single;
  box = { width: cell.w, height: cell.h - BROWSER_CHROME - STATUS_BAR, bar };
  const peaks = new Float32Array(64).fill(0.5);
  const s = useDJStore.getState();
  s.setThirdDeckActive(cell.decks === 3);
  for (const d of ['A', 'B', 'C'] as const) {
    s.setDeckState(d, { waveformPeaks: peaks, fileName: d === 'C' && !cell.deckCTrack ? null : `${d}.wav` });
  }
  s.setDeckViewMode('visualizer');
  useUIStore.getState().setActiveView('dj');
}

// DJView's import graph is the whole DJ engine: the first import is slow.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

describe('DJView at the common screen resolutions', () => {
  it.each(CELLS)('$label: the DOM is the solver output, and the budgets fit the row', (cell) => {
    setup(cell);
    const { container } = render(<DJView />);

    // Sentinel: the solver RAN, with this cell's box and deck count.
    const calls = vi.mocked(djLayout).mock.calls.map((c) => c[0]);
    const measured = calls.find((i) => i.width === cell.w && i.height === box.height - box.bar && i.deckCount === cell.decks);
    expect(measured, 'djLayout was never called with the cell box').toBeDefined();
    const expected: DjLayout = djLayout(measured!);

    const grid = container.querySelector<HTMLElement>('[data-dj-grid]')!;
    expect(grid.getAttribute('data-dj-scale')).toBe(expected.scale);
    expect(grid.getAttribute('data-dj-steps')).toBe(expected.steps.join(' '));
    expect(grid.getAttribute('data-dj-floor')).toBe('false');
    expect(grid.style.gridTemplateColumns).toBe(expected.columns);
    expect(grid.style.gridTemplateColumns).toContain('auto');

    // Every waveform strip (A, B and C when on) has the solved height.
    const waves = Array.from(container.querySelectorAll<HTMLElement>('[data-dj-band="waveform"]'));
    expect(waves).toHaveLength(cell.decks);
    for (const w of waves) expect(w.style.height).toBe(`${expected.waveformHeight}px`);

    // The deck lower panel runs in the solved mode on every deck that has one.
    const panels = Array.from(container.querySelectorAll<HTMLElement>('[data-deck-panel-tabs]'));
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) expect(p.getAttribute('data-deck-panel-mode')).toBe(expected.deck.panel);

    // Mixer extras: inline rows, or behind the More button.
    const camelot = container.querySelector('[data-dj-band="camelot"]');
    const more = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'More');
    if (expected.mixer.extras === 'inline') {
      expect(camelot).not.toBeNull();
      expect(more).toBeUndefined();
    } else {
      expect(camelot).toBeNull();
      expect(more).toBeDefined();
    }

    // No NavBar in the DJ view (AppLayout hides it); the DJ view carries the view switcher itself.
    expect(container.querySelector('[data-navbar]')).toBeNull();

    // The spec numbers: no floor, and per column the rendered bands' budgets fit the row.
    expect(expected.floor.scroll).toBe(false);
    for (const col of Array.from(container.querySelectorAll<HTMLElement>('[data-dj-region]'))) {
      const budgets = Array.from(col.querySelectorAll<HTMLElement>('[data-dj-band][data-dj-budget]'))
        .filter((b) => b.dataset.djBand !== 'waveform')
        .reduce((sum, b) => sum + Number(b.dataset.djBudget), 0);
      expect(budgets, `${col.dataset.djRegion} bands`).toBeLessThanOrEqual(expected.rowHeight);
    }
  });
});
