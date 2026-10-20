/**
 * renderSongCached (plan 2026-10-20 O6k1) over the cases of songRenderMatchesTheReference: a cold cache equals
 * renderSong, a warm one renders no section, one edited note re-renders one section, and a section that gains or loses
 * a bar shifts every later bseed so every later section re-renders. renderSectionMix is spied on the module namespace
 * the cache module imports it from, which counts the host's section renders.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/song_render.json';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import * as songRender from '../songRender';
import { renderSong, songRenderOptions } from '../songRender';
import { renderSongCached, sectionKey, type SectionMixCache } from '../songRenderCache';

const TOL = 1e-9;
const cases = (fixture as unknown as { cases: { name: string; doc: SongFileDoc }[] }).cases;
const maxErr = (a: Float64Array, b: Float64Array): number => {
  let m = a.length === b.length ? 0 : Infinity;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};
// the smallest case with at least three sections that has a melody note outside the first section
const pick = cases
  .map((c) => ({ c, ev: songFileToBarEvents(c.doc) }))
  .filter(({ ev }) => ev.sections.length >= 3 && ev.sections.some((s, i) => i > 0 && s.melody.some((m) => m !== null)))
  .sort((a, b) => a.ev.sections.reduce((n, s) => n + s.drums.length, 0) - b.ev.sections.reduce((n, s) => n + s.drums.length, 0))[0]!;

afterEach(() => { vi.restoreAllMocks(); });

describe('renderSongCached', () => {
  const options = songRenderOptions(pick.c.doc);
  const sectionCount = pick.ev.sections.filter((s) => s.drums.length > 0).length;
  const full = renderSong(pick.ev, options);

  it('a cold cache renders every section and equals renderSong', () => {
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    const out = renderSongCached(pick.ev, options, new Map());
    expect(spy).toHaveBeenCalledTimes(pick.ev.sections.length);
    expect(maxErr(out, full)).toBeLessThan(TOL);
  });

  it('a warm cache with no edit renders no section and gives the same output', () => {
    const cache: SectionMixCache = new Map();
    renderSongCached(pick.ev, options, cache);
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    const out = renderSongCached(pick.ev, options, cache);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(maxErr(out, full)).toBeLessThan(TOL);
  });

  it('one edited note re-renders exactly its section and equals a fresh full render', () => {
    const cache: SectionMixCache = new Map();
    renderSongCached(pick.ev, options, cache);
    const edited = structuredClone(pick.ev);
    const s = edited.sections.findIndex((sec, i) => i > 0 && sec.melody.some((m) => m !== null));
    const bar = edited.sections[s]!.melody.find((m) => m !== null)!;
    bar[0]![0] += 2;
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    const out = renderSongCached(edited, options, cache);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe(s);
    const fresh = renderSong(edited, options);
    expect(maxErr(fresh, full), 'the edit is audible').toBeGreaterThan(1e-6);
    expect(maxErr(out, fresh)).toBeLessThan(TOL);
  });

  it('a section that gains a bar re-renders every later section (the bseed shifts)', () => {
    const cache: SectionMixCache = new Map();
    renderSongCached(pick.ev, options, cache);
    const doc = structuredClone(pick.c.doc);
    const first = doc.sections[0]!;
    first.bars.push({ ...structuredClone(first.bars[first.bars.length - 1]!), order: [] });
    first.header.bars = first.bars.length;
    for (const cells of Object.values(first.lanes)) cells.push(...new Array(16).fill(null));
    // the file records each section's seed (hit_seed = header.seed + bar), so the later sections' seeds move with the bar
    doc.sections.slice(1).forEach((sec) => { sec.header.seed = (sec.header.seed as number) + 1; });
    const edited = songFileToBarEvents(doc);
    const spy = vi.spyOn(songRender, 'renderSectionMix');
    const out = renderSongCached(edited, options, cache);
    expect(spy).toHaveBeenCalledTimes(sectionCount);
    expect(maxErr(out, renderSong(edited, options))).toBeLessThan(TOL);
  });

  it('the key moves with the starting bseed alone (a valid file also carries it in each bar\'s hit_seed)', () => {
    expect(sectionKey(pick.ev, 1, 10, options)).not.toBe(sectionKey(pick.ev, 1, 11, options));
  });
});
