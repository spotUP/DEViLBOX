/**
 * N14 reachability: loading a format through the product path (parse a New Song
 * template, then applyEditorMode as applySong does) locks instrument creation to
 * that format's allowed set, through BOTH the MCP handler and the store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ preloadInstruments: vi.fn(), disposeInstrument: vi.fn(), invalidateInstrument: vi.fn() }) }));
import '@lib/formats/EditableFormatRegistry.builtins';
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { createInstrument } from '@/bridge/handlers/writeHandlers';
import { parseAs, readFixture } from '@lib/export/__tests__/exporterHarness.shared';

describe('format load locks the instrument types', () => {
  beforeEach(() => {
    useFormatStore.getState().reset();
    useInstrumentStore.getState().reset();
  });

  it('ProTracker project refuses TB303, accepts Sampler; generic project is unlocked', async () => {
    const song = await parseAs('templates/protracker.mod', readFixture('public/templates/protracker.mod'));
    useFormatStore.getState().applyEditorMode(song);
    expect(useFormatStore.getState().activeFormatId).toBe('mod');

    const before = useInstrumentStore.getState().instruments.length;
    const refused = createInstrument({ synthType: 'TB303', name: 'x' });
    expect(refused.ok).toBe(false);
    expect(String(refused.error)).toMatch(/cannot hold TB303/);
    expect(useInstrumentStore.getState().createInstrument({ synthType: 'TB303' })).toBe(-1);
    expect(useInstrumentStore.getState().instruments.length).toBe(before);

    expect(createInstrument({ synthType: 'Sampler', name: 'ok' }).ok).toBe(true);
    expect(useInstrumentStore.getState().instruments.length).toBe(before + 1);

    useFormatStore.getState().reset();
    expect(useFormatStore.getState().activeFormatId).toBeNull();
    expect(createInstrument({ synthType: 'TB303', name: 'free' }).ok).toBe(true);
  });
});
