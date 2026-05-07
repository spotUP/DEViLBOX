/**
 * useNKSLibraryStore — NKS preset library browser state
 *
 * Reads from the server-side /api/nks/* endpoints which query the
 * komplete.db3 database maintained by Komplete Kontrol / Maschine.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NKSProduct {
  name: string;
  brand: string;
  presetCount: number;
  artworkUrl: string | null;
  logoUrl: string | null;
}

export interface NKSPreset {
  id: number;
  name: string;
  vendor: string;
  product: string;
  bank: string | null;
  subbank: string | null;
  types: string | null;
  character: string | null;
  deviceType: number;
  fileName: string;
  fileExt: string;
}

export interface NKSStatus {
  dbExists: boolean;
  presetCount: number;
  productCount: number;
  niResourcesProducts: number;
}

interface NKSLibraryState {
  // Status
  status: NKSStatus | null;
  statusLoading: boolean;

  // Products
  products: NKSProduct[];
  productsLoading: boolean;
  selectedProduct: string | null;

  // Presets
  presets: NKSPreset[];
  presetsLoading: boolean;
  presetsTotal: number;
  presetsOffset: number;
  presetsLimit: number;

  // Filters
  searchQuery: string;
  filterBrand: string;
  filterType: string;
  filterCharacter: string;

  // Types / characters for filter dropdowns
  types: string[];
  characters: string[];
}

interface NKSLibraryActions {
  loadStatus: () => Promise<void>;
  loadProducts: () => Promise<void>;
  loadPresets: (append?: boolean) => Promise<void>;
  loadTypes: () => Promise<void>;
  loadCharacters: () => Promise<void>;

  selectProduct: (product: string | null) => void;
  setSearch: (q: string) => void;
  setFilterBrand: (brand: string) => void;
  setFilterType: (type: string) => void;
  setFilterCharacter: (character: string) => void;

  resetFilters: () => void;
}

type NKSLibraryStore = NKSLibraryState & NKSLibraryActions;

// ── Store ─────────────────────────────────────────────────────────────────────

const API = '/api/nks';

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NKS API ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const useNKSLibraryStore = create<NKSLibraryStore>()(
  immer((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────────
    status: null,
    statusLoading: false,
    products: [],
    productsLoading: false,
    selectedProduct: null,
    presets: [],
    presetsLoading: false,
    presetsTotal: 0,
    presetsOffset: 0,
    presetsLimit: 50,
    searchQuery: '',
    filterBrand: '',
    filterType: '',
    filterCharacter: '',
    types: [],
    characters: [],

    // ── Actions ────────────────────────────────────────────────────────────────

    loadStatus: async () => {
      set(s => { s.statusLoading = true; });
      try {
        const data = await apiFetch<NKSStatus & Record<string, unknown>>(`${API}/status`);
        set(s => { s.status = data; s.statusLoading = false; });
      } catch (e) {
        console.warn('[NKSStore] status error', e);
        set(s => { s.statusLoading = false; });
      }
    },

    loadProducts: async () => {
      set(s => { s.productsLoading = true; });
      try {
        const data = await apiFetch<NKSProduct[]>(`${API}/products`);
        set(s => { s.products = data; s.productsLoading = false; });
      } catch (e) {
        console.warn('[NKSStore] products error', e);
        set(s => { s.productsLoading = false; });
      }
    },

    loadPresets: async (append = false) => {
      const { selectedProduct, searchQuery, filterBrand, filterType, filterCharacter, presetsOffset, presetsLimit } = get();
      set(s => { s.presetsLoading = true; });

      const params = new URLSearchParams();
      if (searchQuery)    params.set('q',         searchQuery);
      if (selectedProduct) params.set('product',  selectedProduct);
      if (filterBrand)    params.set('brand',     filterBrand);
      if (filterType)     params.set('type',      filterType);
      if (filterCharacter) params.set('character', filterCharacter);
      params.set('offset', String(append ? presetsOffset : 0));
      params.set('limit',  String(presetsLimit));

      try {
        const data = await apiFetch<{ total: number; presets: NKSPreset[] }>(`${API}/presets?${params}`);
        set(s => {
          s.presetsLoading = false;
          s.presetsTotal = data.total;
          if (append) {
            s.presets = [...s.presets, ...data.presets];
            s.presetsOffset = presetsOffset + data.presets.length;
          } else {
            s.presets = data.presets;
            s.presetsOffset = data.presets.length;
          }
        });
      } catch (e) {
        console.warn('[NKSStore] presets error', e);
        set(s => { s.presetsLoading = false; });
      }
    },

    loadTypes: async () => {
      try {
        const data = await apiFetch<string[]>(`${API}/types`);
        set(s => { s.types = data; });
      } catch { /* ok */ }
    },

    loadCharacters: async () => {
      try {
        const data = await apiFetch<string[]>(`${API}/characters`);
        set(s => { s.characters = data; });
      } catch { /* ok */ }
    },

    selectProduct: (product) => {
      set(s => {
        s.selectedProduct = product;
        s.presetsOffset = 0;
      });
      void get().loadPresets();
    },

    setSearch: (q) => {
      set(s => { s.searchQuery = q; s.presetsOffset = 0; });
      void get().loadPresets();
    },

    setFilterBrand: (brand) => {
      set(s => { s.filterBrand = brand; s.presetsOffset = 0; });
      void get().loadPresets();
    },

    setFilterType: (type) => {
      set(s => { s.filterType = type; s.presetsOffset = 0; });
      void get().loadPresets();
    },

    setFilterCharacter: (character) => {
      set(s => { s.filterCharacter = character; s.presetsOffset = 0; });
      void get().loadPresets();
    },

    resetFilters: () => {
      set(s => {
        s.searchQuery = '';
        s.filterBrand = '';
        s.filterType = '';
        s.filterCharacter = '';
        s.selectedProduct = null;
        s.presetsOffset = 0;
      });
      void get().loadPresets();
    },
  })),
);
