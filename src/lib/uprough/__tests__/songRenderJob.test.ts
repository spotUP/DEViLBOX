/**
 * runRenderJob partials (R2f-33a): one pre-master section mix per section, in order, `start` = running sample sum, and
 * asking for them never changes the final mix.
 */
import { describe, expect, it } from 'vitest';
import fixture from '@engine/uprough/__tests__/fixtures/song_render.json';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import { songRenderOptions } from '@engine/uprough/songRender';
import type { SectionMixCache } from '@engine/uprough/songRenderCache';
import { runRenderJob, type PartialMix } from '../songRenderJob';

const cases = (fixture as unknown as { cases: { name: string; doc: SongFileDoc }[] }).cases;
const pick = cases
  .map((c) => ({ c, ev: songFileToBarEvents(c.doc) }))
  .filter(({ ev }) => ev.sections.length >= 3)
  .sort((a, b) => a.ev.sections.reduce((n, s) => n + s.drums.length, 0) - b.ev.sections.reduce((n, s) => n + s.drums.length, 0))[0]!;
const options = songRenderOptions(pick.c.doc);

describe('runRenderJob partials', () => {
  it('posts one partial per section in order with the section length', () => {
    const partials: PartialMix[] = [];
    const cache: SectionMixCache = new Map();
    const withCb = runRenderJob(pick.ev, options, cache, () => undefined, undefined, (p) => partials.push(p));
    expect(partials.map((p) => p.section)).toEqual(pick.ev.sections.map((_, i) => i));
    let at = 0;
    for (const p of partials) { expect(p.start).toBe(at); at += p.mix.length; }
    expect(at).toBe(withCb.length); // texture and master bus keep the joined length
    // a warm run (all sections cached) still reports every section
    const again: PartialMix[] = [];
    runRenderJob(pick.ev, options, cache, () => undefined, undefined, (p) => again.push(p));
    expect(again).toHaveLength(partials.length);
    // the callback never changes the output
    const without = runRenderJob(pick.ev, options, new Map(), () => undefined);
    expect(Buffer.from(withCb.buffer).equals(Buffer.from(without.buffer))).toBe(true);
  }, 120000);
});
