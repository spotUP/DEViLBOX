import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNKSLibraryStore } from '../useNKSLibraryStore';
import { resetStore } from './_harness';

const fetchMock = vi.fn<typeof fetch>();

describe('useNKSLibraryStore — Devilbox preset browser', () => {
  beforeEach(() => {
    resetStore(useNKSLibraryStore);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('loads Devilbox synth products from the preset API', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      {
        id: 'helm',
        name: 'Helm',
        vendor: 'Matt Tytel',
        presetCount: 274,
        synth: 'helm',
        category: 'Instrument',
      },
    ])));

    await useNKSLibraryStore.getState().loadDevilboxProducts();

    expect(useNKSLibraryStore.getState().devilboxProducts).toEqual([
      {
        id: 'helm',
        name: 'Helm',
        vendor: 'Matt Tytel',
        presetCount: 274,
        synth: 'helm',
        category: 'Instrument',
      },
    ]);
  });

  it('queries Devilbox presets with synth, category, and search filters', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      {
        id: 'helm:lead/brass',
        name: 'Brass Stack',
        category: 'Lead',
        synth: 'helm',
        path: 'third-party/helm-master/patches/Factory Presets/Lead/Brass Stack.helm',
        tags: ['Lead'],
      },
    ])));

    await useNKSLibraryStore.getState().loadDevilboxPresets('helm', 'Lead', 'brass');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/devilbox-presets/presets?synth=helm&category=Lead&search=brass&limit=500&offset=0',
    );
    expect(useNKSLibraryStore.getState().devilboxPresets[0]?.name).toBe('Brass Stack');
  });

  it('setSearch updates store state without kicking the NKS API while a Devilbox synth is selected', () => {
    useNKSLibraryStore.getState().setSelectedDevilboxSynth('helm');

    useNKSLibraryStore.getState().setSearch('chip');

    expect(useNKSLibraryStore.getState().searchQuery).toBe('chip');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
