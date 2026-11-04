/**
 * The active project tab shows the loaded song's info: name (SID title > tab name; the album is the release, tooltip only),
 * community score, authors and genre (last), with the full description as tooltip. Non-active tabs stay plain.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NavBar } from '../NavBar';
import { songTabInfo } from '@/lib/song/songTabInfo';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTabsStore } from '@/stores/useTabsStore';
import { useRatingsStore, ratingId } from '@/stores/useRatingsStore';
import { openSong } from '@/lib/song/openSong';
import { useTrackerAnalysisStore, type FullAnalysisResult } from '@/stores/useTrackerAnalysisStore';

vi.mock('@/lib/song/acquireSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/acquireSource')>();
  return { ...real, acquire: vi.fn(async () => ({ file: new File([new Uint8Array(8)], 'z.mod') })) };
});
vi.mock('@/lib/song/songBranches', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/songBranches')>();
  return { ...real, importModuleFile: vi.fn(async () => {}) };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {}, releaseSong: () => {} }) }));

// addTab runs the instrument classifier, which spawns a Web Worker jsdom does not have.
vi.stubGlobal('Worker', class { onmessage = null; postMessage(): void {} terminate(): void {} addEventListener(): void {} });

afterEach(() => {
  cleanup();
  useFormatStore.getState().clearSongInfo();
  useRatingsStore.setState({ ratings: {} });
  useTrackerAnalysisStore.setState({ currentAnalysis: null });
});

const sid = { format: 'PSID', version: 2, title: 'Commando', author: 'Rob Hubbard', copyright: '', chipModel: '8580', clockSpeed: 'PAL', subsongs: 3, defaultSubsong: 0, currentSubsong: 1, secondSID: false, thirdSID: false } as const;
const db = { authors: ['Jogeir', 'Other'], publishers: [], album: 'Fantasy Album', year: '1991', format: 'MOD', duration_ms: 1 };

describe('songTabInfo', () => {
  it('title precedence: SID title, then tab name, then Untitled; the album never becomes the title', () => {
    expect(songTabInfo({ tabName: 'Tab', songDBInfo: db, sidMetadata: { ...sid }, genre: null }).displayName).toBe('Commando');
    expect(songTabInfo({ tabName: 'Tab', songDBInfo: db, sidMetadata: null, genre: null }).displayName).toBe('Tab');
    expect(songTabInfo({ tabName: 'Tab', songDBInfo: null, sidMetadata: null, genre: null }).displayName).toBe('Tab');
    expect(songTabInfo({ tabName: '', songDBInfo: null, sidMetadata: null, genre: null }).displayName).toBe('Untitled');
  });

  it('authors: SID author, else database authors joined, else empty', () => {
    expect(songTabInfo({ tabName: '', songDBInfo: db, sidMetadata: null, genre: null }).authors).toBe('Jogeir, Other');
    expect(songTabInfo({ tabName: '', songDBInfo: db, sidMetadata: { ...sid }, genre: null }).authors).toBe('Rob Hubbard');
    expect(songTabInfo({ tabName: '', songDBInfo: null, sidMetadata: null, genre: null }).authors).toBe('');
  });

  it('tooltip: database name (year) [format] by authors', () => {
    expect(songTabInfo({ tabName: '', songDBInfo: db, sidMetadata: null, genre: null }).tooltip).toBe('Fantasy Album (1991) [MOD] by Jogeir, Other');
  });

  it('tooltip: SID fields, skipping Unknown chip and clock and single subsongs', () => {
    expect(songTabInfo({ tabName: '', songDBInfo: null, sidMetadata: { ...sid }, genre: null }).tooltip).toBe('Commando by Rob Hubbard [MOS 8580] PAL Sub 2/3');
    expect(songTabInfo({ tabName: '', songDBInfo: null, sidMetadata: { ...sid, chipModel: 'Unknown', clockSpeed: 'Unknown', subsongs: 1 }, genre: null }).tooltip).toBe('Commando by Rob Hubbard');
  });

  it('genre: "primary - subgenre" (subgenre dropped when empty or the same), last in the tooltip', () => {
    const base = { tabName: '', songDBInfo: db, sidMetadata: null };
    expect(songTabInfo({ ...base, genre: { primary: 'Electronic', subgenre: 'Techno' } }).genre).toBe('Electronic - Techno');
    expect(songTabInfo({ ...base, genre: { primary: 'Pop', subgenre: '' } }).genre).toBe('Pop');
    expect(songTabInfo({ ...base, genre: { primary: 'Pop', subgenre: 'Pop' } }).genre).toBe('Pop');
    expect(songTabInfo({ ...base, genre: null }).genre).toBe('');
    expect(songTabInfo({ ...base, genre: { primary: 'Electronic', subgenre: 'Techno' } }).tooltip).toBe('Fantasy Album (1991) [MOD] by Jogeir, Other Genre: Electronic - Techno');
  });
});

describe('tab bar song info', { timeout: 60000 }, () => {
  it('openSong of a Modland path puts score and authors in the active tab only', async () => {
    useRatingsStore.setState({ ratings: { [ratingId('modland', 'X/Y/z.mod')]: { avg: 4.5, count: 7, userRating: 0 } } as never, load: vi.fn(async () => {}) } as never);
    useTabsStore.getState().addTab?.();
    const r = await openSong({ kind: 'modland', path: 'X/Y/z.mod' }, { origin: 'modland' });
    expect(r.ok).toBe(true);
    useFormatStore.getState().setSongDBInfo(db);
    useTrackerAnalysisStore.setState({ currentAnalysis: { genre: { primary: 'Electronic', subgenre: 'Techno' } } as FullAnalysisResult });
    const { container } = render(<NavBar />);
    const { tabs, activeTabId } = useTabsStore.getState();
    expect(tabs.length).toBeGreaterThan(1);
    const buttons = Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('rounded-t-md'));
    expect(buttons.length).toBe(tabs.length);
    const active = buttons[tabs.findIndex((t) => t.id === activeTabId)];
    const others = buttons.filter((b) => b !== active);
    expect(active.textContent).toContain('4.5');
    expect(active.textContent).toContain('(7)');
    expect(active.textContent).toContain('by Jogeir, Other');
    expect(active.textContent).toContain('by Jogeir, OtherElectronic - Techno');
    expect(active.title).toBe('Fantasy Album (1991) [MOD] by Jogeir, Other Genre: Electronic - Techno');
    for (const o of others) {
      expect(o.textContent).not.toContain('(7)');
      expect(o.textContent).not.toContain('Jogeir');
      expect(o.textContent).not.toContain('Techno');
    }
  });
});
