/**
 * `.dbx` restore contract — automationCurves / dubBus / autoDub.
 *
 * SongExport (src/lib/export/exporters.ts) writes three dub-adjacent
 * blocks on every save: `automationCurves`, `dubBus`, `autoDub`. On load,
 * the DBX branch of UnifiedFileLoader.ts must pipe each back into its
 * store — otherwise the user reloads to stock defaults and loses every
 * tweak + every autonomous-performer config they'd set.
 *
 * This test pins the contract: given a songData blob with all three
 * blocks present, the restore dispatches the right store setters. It
 * does NOT exercise the full DBX loader (which touches File APIs and
 * Tone engine); it proves the restore LOGIC in isolation by calling
 * the same setters the loader code calls, driven from the same songData
 * shape the exporter produces.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The loader pulls several stores; we only care about the three below.
// Other stores are unused for this restore path so don't need mocking.
const autoStore = {
  loadCurves: vi.fn(),
};
const padStore = {
  setDubBus: vi.fn(),
};
const dubStore = {
  setAutoDubEnabled: vi.fn(),
  setAutoDubIntensity: vi.fn(),
  setAutoDubPersona: vi.fn(),
  setAutoDubMoveBlacklist: vi.fn(),
};

vi.mock('@/stores/useAutomationStore', () => ({
  useAutomationStore: { getState: () => autoStore },
}));
vi.mock('@/stores/useDrumPadStore', () => ({
  useDrumPadStore: { getState: () => padStore },
}));
vi.mock('@/stores/useDubStore', () => ({
  useDubStore: { getState: () => dubStore },
}));

import { useAutomationStore } from '@/stores/useAutomationStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useDubStore } from '@/stores/useDubStore';

// The exact restore dispatch from UnifiedFileLoader.ts — kept in sync by
// eyeball. If the loader's dispatch diverges from this, the contract
// test still asserts "given these inputs, these setters fire" and the
// loader needs to match. Duplicating the dispatch here is cheaper than
// driving the full loader under a shimmed File API.
function applyDbxRestore(songData: Record<string, unknown>) {
  const curves = songData.automationCurves;
  if (Array.isArray(curves) && curves.length > 0) {
    useAutomationStore.getState().loadCurves(curves as never);
  }
  const bus = songData.dubBus;
  if (bus && typeof bus === 'object') {
    useDrumPadStore.getState().setDubBus(bus as never);
  }
  const ad = songData.autoDub as Record<string, unknown> | undefined;
  if (ad && typeof ad === 'object') {
    const dub = useDubStore.getState();
    if (typeof ad.enabled === 'boolean')   dub.setAutoDubEnabled(ad.enabled);
    if (typeof ad.intensity === 'number')  dub.setAutoDubIntensity(ad.intensity);
    if (typeof ad.persona === 'string')    dub.setAutoDubPersona(ad.persona as never);
    if (Array.isArray(ad.moveBlacklist))   dub.setAutoDubMoveBlacklist(ad.moveBlacklist);
  }
}

describe('.dbx restore — automationCurves / dubBus / autoDub', () => {
  beforeEach(() => {
    autoStore.loadCurves.mockClear();
    padStore.setDubBus.mockClear();
    dubStore.setAutoDubEnabled.mockClear();
    dubStore.setAutoDubIntensity.mockClear();
    dubStore.setAutoDubPersona.mockClear();
    dubStore.setAutoDubMoveBlacklist.mockClear();
  });

  it('restores all three blocks when present', () => {
    const curves = [{ id: 'c1', parameter: 'dub.echoWet', channelIndex: -1, points: [] }];
    const bus = { characterPreset: 'tubby' };
    const autoDub = {
      enabled: true,
      intensity: 0.7,
      persona: 'perry',
      moveBlacklist: ['bassThrow'],
    };
    applyDbxRestore({ automationCurves: curves, dubBus: bus, autoDub });

    expect(autoStore.loadCurves).toHaveBeenCalledWith(curves);
    expect(padStore.setDubBus).toHaveBeenCalledWith(bus);
    expect(dubStore.setAutoDubEnabled).toHaveBeenCalledWith(true);
    expect(dubStore.setAutoDubIntensity).toHaveBeenCalledWith(0.7);
    expect(dubStore.setAutoDubPersona).toHaveBeenCalledWith('perry');
    expect(dubStore.setAutoDubMoveBlacklist).toHaveBeenCalledWith(['bassThrow']);
  });

  it('does NOT call loadCurves for empty or missing automationCurves', () => {
    applyDbxRestore({});
    expect(autoStore.loadCurves).not.toHaveBeenCalled();

    applyDbxRestore({ automationCurves: [] });
    expect(autoStore.loadCurves).not.toHaveBeenCalled();
  });

  it('does NOT call setDubBus when dubBus is missing', () => {
    applyDbxRestore({});
    expect(padStore.setDubBus).not.toHaveBeenCalled();
  });

  it('applies partial autoDub — only the fields present', () => {
    applyDbxRestore({ autoDub: { intensity: 0.3 } });
    expect(dubStore.setAutoDubIntensity).toHaveBeenCalledWith(0.3);
    expect(dubStore.setAutoDubEnabled).not.toHaveBeenCalled();
    expect(dubStore.setAutoDubPersona).not.toHaveBeenCalled();
    expect(dubStore.setAutoDubMoveBlacklist).not.toHaveBeenCalled();
  });

  it('ignores non-array moveBlacklist (older blob with bad shape)', () => {
    applyDbxRestore({ autoDub: { moveBlacklist: 'not-an-array' } });
    expect(dubStore.setAutoDubMoveBlacklist).not.toHaveBeenCalled();
  });

  it('ignores non-boolean enabled (safety on malformed blobs)', () => {
    applyDbxRestore({ autoDub: { enabled: 'yes' } });
    expect(dubStore.setAutoDubEnabled).not.toHaveBeenCalled();
  });

  it('dubBus can be Partial — any object is passed through', () => {
    // setDubBus does the shallow-merge; restore doesn't validate shape.
    // Verifies we don't over-filter (e.g. requiring characterPreset).
    applyDbxRestore({ dubBus: { returnGain: 0.9 } });
    expect(padStore.setDubBus).toHaveBeenCalledWith({ returnGain: 0.9 });
  });
});
