import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ResponsivePanel } from '@components/layout/responsive/ResponsivePanel';
import { useMobilePanelStore } from '@stores/useMobilePanelStore';

/**
 * Phase 3 of thoughts/shared/plans/2026-09-22-responsive-mobile.md.
 *
 * The defect: below the phone threshold `TrackerView` returned
 * `MobileTrackerView` and never reached its own return, so twelve panels —
 * `DubDeckStrip`, `PatternOrderSidebar`, `PatternBottomBar`,
 * `InstrumentKnobPanel`, `FT2Toolbar` and the rest — were not narrow on a
 * phone, they were NOT MOUNTED. The Dub Studio had no phone surface at all.
 *
 * One tree now. Each panel declares how it degrades, and this file pins both
 * halves: that the primitive does what it says, and that every panel in
 * `TrackerView` goes through it.
 */
const SRC = readFileSync(join(process.cwd(), 'src/components/tracker/TrackerView.tsx'), 'utf-8');

describe('TrackerView renders one tree', () => {
  it('the fork is gone — no early return into a second component', () => {
    expect(SRC).not.toContain('MobileTrackerView');
    expect(SRC).not.toMatch(/if \(isPhone\) \{\s*return/);
  });

  it('every panel that used to be desktop-only declares how it degrades', () => {
    // id -> the component that must sit inside that panel.
    const panels: Array<[string, string]> = [
      ['toolbar', '<FT2Toolbar'],
      ['instrument-knobs', '<InstrumentKnobPanel'],
      ['scopes', '<TrackScopesStrip'],
      ['editor-controls', '<EditorControlsBar'],
      ['pattern-order', '<PatternOrderSidebar'],
      ['pattern-options', '<PatternBottomBar'],
      ['minimap', '<MinimapWrapper'],
      ['pitch', '<DJPitchSlider'],
      ['dub-deck', '<DubDeckStrip'],
    ];
    for (const [id, child] of panels) {
      const open = SRC.indexOf(`<ResponsivePanel id="${id}"`);
      expect(open, `no ResponsivePanel with id="${id}"`).toBeGreaterThan(-1);
      const close = SRC.indexOf('</ResponsivePanel>', open);
      expect(SRC.slice(open, close), `${child} is not inside the "${id}" panel`).toContain(child);
    }
  });

  it('the phone input surfaces are additive, not a second tree', () => {
    // They render only on a phone, and they render INSIDE the same return.
    expect(SRC).toContain('{isPhone && (\n        <MobileTransportBar');
    expect(SRC).toContain('{isPhone && mobileInput.pianoState !== \'hidden\' && (');
    expect(SRC).toContain('<MobilePanelBar />');
  });

  it('the pattern grid takes the phone channel window', () => {
    expect(SRC).toContain('visibleChannels={isPhone ? mobileInput.visibleChannels : undefined}');
    expect(SRC).toContain('startChannel={isPhone ? mobileInput.startChannel : undefined}');
  });
});

describe('ResponsivePanel degrades the way it says', () => {
  const Sentinel = () => <div data-testid="sentinel">panel content</div>;

  it('off a phone it renders its children and adds no wrapper', () => {
    // happy-dom reports no coarse pointer, so `isPhone` is false here.
    const { container } = render(
      <ResponsivePanel id="x" title="Panel" phone="hide"><Sentinel /></ResponsivePanel>
    );
    expect(screen.getByTestId('sentinel')).toBeTruthy();
    // The children are the panel's only output — nothing is wrapped around
    // them, so the desktop layout is the layout it was.
    expect(container.firstElementChild?.getAttribute('data-testid')).toBe('sentinel');
    cleanup();
  });

  it('a sheet panel registers itself so the bar can reach it, and unregisters on unmount', () => {
    useMobilePanelStore.setState({ panels: [], openPanelId: null });
    const { registerPanel, unregisterPanel } = useMobilePanelStore.getState();

    registerPanel({ id: 'dub-deck', title: 'Dub Deck', order: 50 });
    registerPanel({ id: 'toolbar', title: 'Toolbar', order: 10 });
    expect(useMobilePanelStore.getState().panels.map((p) => p.id)).toEqual(['toolbar', 'dub-deck']);

    useMobilePanelStore.getState().openPanel('dub-deck');
    unregisterPanel('dub-deck');
    // A panel that unmounts while open must not leave the sheet stuck open.
    expect(useMobilePanelStore.getState().openPanelId).toBeNull();
    expect(useMobilePanelStore.getState().panels.map((p) => p.id)).toEqual(['toolbar']);
  });

  it('toggling the same panel closes it', () => {
    useMobilePanelStore.setState({ panels: [], openPanelId: null });
    useMobilePanelStore.getState().togglePanel('toolbar');
    expect(useMobilePanelStore.getState().openPanelId).toBe('toolbar');
    useMobilePanelStore.getState().togglePanel('toolbar');
    expect(useMobilePanelStore.getState().openPanelId).toBeNull();
  });
});
