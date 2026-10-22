/**
 * The client side of the module genre lookup: the uade key must match the one
 * HippoPlayer and the server use (reference values from xxh32sum), and only a
 * tagged ModArchive reply may replace the audio model's genre.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { xxh32, computeUadeKey, lookupModuleGenre, applyModuleGenre } from '../moduleGenre';
import type { GenreResult } from '@/stores/useTrackerAnalysisStore';

const text = (s: string) => new TextEncoder().encode(s);
const pattern = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 255);

const CED: GenreResult = {
  primary: 'Electronic', subgenre: 'Techno', confidence: 0.4, mood: 'Driving', energy: 0.7,
  danceability: 0.6, bpm: 125, bpmConfidence: 0.9, musicalKey: 'A minor', keyConfidence: 0.5,
};

describe('xxh32', () => {
  it('matches the reference implementation (xxh32sum)', () => {
    expect(xxh32(text(''))).toBe(0x02cc5d05);
    expect(xxh32(text('a'))).toBe(0x550d7456);
    expect(xxh32(text('abc'))).toBe(0x32d153ff);
    expect(xxh32(text('Nobody inspects the spammish repetition'))).toBe(0xe2293b2f);
    expect(xxh32(pattern(37))).toBe(0xba3f318f);
  });
});

describe('computeUadeKey', () => {
  it('hashes only the first 256 KB and appends the low 16 bits of the size', () => {
    // xxh32sum of the first 262144 bytes = 703c20f7; 300000 & 0xFFFF = 0x93e0.
    expect(computeUadeKey(pattern(300000))).toBe('703c20f793e0');
  });

  it('zero pads both parts', () => {
    expect(computeUadeKey(text('a'))).toMatch(/^[0-9a-f]{8}0001$/);
  });
});

describe('lookupModuleGenre', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const reply = (status: number, body: unknown) =>
    vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));

  it('sends key, name, size and md5, and returns a ModArchive tag', async () => {
    const fetchMock = reply(200, { key: 'x', genre: 'Electronic - Ambient', source: 'modarchive', modarchiveId: 1 });
    vi.stubGlobal('fetch', fetchMock);
    const bytes = text('abc');
    expect(await lookupModuleGenre(bytes, 'chemical_emotion.mod')).toBe('Electronic - Ambient');
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname.endsWith(`/genre/${computeUadeKey(bytes)}`)).toBe(true);
    expect(url.searchParams.get('name')).toBe('chemical_emotion.mod');
    expect(url.searchParams.get('size')).toBe('3');
    expect(url.searchParams.get('md5')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('returns null for untagged, missing and failed lookups', async () => {
    vi.stubGlobal('fetch', reply(200, { key: 'x', genre: null, source: 'untagged', modarchiveId: 1 }));
    expect(await lookupModuleGenre(text('abc'), 'a.mod')).toBeNull();
    vi.stubGlobal('fetch', reply(503, { error: 'busy' }));
    expect(await lookupModuleGenre(text('abc'), 'a.mod')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await lookupModuleGenre(text('abc'), 'a.mod')).toBeNull();
  });
});

describe('applyModuleGenre', () => {
  it('splits "primary - subgenre" and keeps the audio measurements', () => {
    expect(applyModuleGenre(CED, 'Electronic - Ambient')).toEqual({ ...CED, subgenre: 'Ambient', confidence: 1 });
  });

  it('a tag without a subgenre is the primary alone', () => {
    const genre = applyModuleGenre(CED, 'Chiptune');
    expect([genre.primary, genre.subgenre]).toEqual(['Chiptune', '']);
  });
});
