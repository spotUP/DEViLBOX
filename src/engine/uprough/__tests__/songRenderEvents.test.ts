/**
 * The R2 render events of renderSong / renderSongCached (spec 2026-10-20_r2a-event-protocol.md 2.2, 3.3) over the
 * smallest fixture song with three sections: the order and keys of the stream, the cache-hit stream, bankSeen, and
 * that a listener never changes the audio.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/song_render.json';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import type { R2Event } from '../r2Events';
import { renderSong, songRenderOptions } from '../songRender';
import { renderSongCached, type SectionMixCache } from '../songRenderCache';

const cases = (fixture as unknown as { cases: { name: string; doc: SongFileDoc }[] }).cases;
const pick = cases
  .map((c) => ({ c, ev: songFileToBarEvents(c.doc) }))
  .filter(({ ev }) => ev.sections.length >= 3)
  .sort((a, b) => a.ev.sections.reduce((n, s) => n + s.drums.length, 0) - b.ev.sections.reduce((n, s) => n + s.drums.length, 0))[0]!;
const baseOptions = songRenderOptions(pick.c.doc);
const VOICES = ['kick', 'snare', 'clap', 'ch', 'oh', 'rim', 'tom', 'conga', 'cowbell', 'shaker', 'tamb', 'metal', 'ride'];

function collect(run: (onEvent: (e: R2Event) => void) => Float64Array): { events: R2Event[]; out: Float64Array } {
  const events: R2Event[] = [];
  const out = run((e) => events.push(e));
  return { events, out };
}

/** The S2.2 grammar for one render: returns a list of problems (empty when the stream is well formed). */
function problems(events: R2Event[], sectionCount: number): string[] {
  const bad: string[] = [];
  events.forEach((e, i) => { if (e.seq !== i) bad.push(`seq ${e.seq} at ${i}`); });
  const types = events.map((e) => e.type);
  if (types[0] !== 'start') bad.push('first is not start');
  if (types[types.length - 1] !== 'done') bad.push('last is not done');
  if (types.slice(-4).join() !== 'join,texture,master,done') bad.push('tail is not join,texture,master,done');
  const firstSection = types.indexOf('section');
  const lastBank = Math.max(types.lastIndexOf('bank'), types.lastIndexOf('attach'));
  if (lastBank > firstSection) bad.push('bank/attach after the first section');
  for (let s = 0; s < sectionCount; s++) {
    const at = events.findIndex((e) => e.type === 'section' && e.section === s);
    const mixAt = events.findIndex((e) => e.type === 'mix' && e.section === s);
    if (at < 0 || mixAt < at) bad.push(`section ${s}: section/mix order`);
    const inner = events.slice(at + 1, mixAt).map((e) => e.type === 'lane' ? `lane_${e.lane}` : e.type === 'bus' ? `bus_${e.bus}` : e.type);
    const order = ['hatpool', 'lane_drums', 'lane_bass', 'lane_melody', 'bus_drums', 'bus_bass', 'bus_melody', 'lane_scratch'];
    const idx = inner.map((t) => order.indexOf(t));
    if (idx.includes(-1)) bad.push(`section ${s}: unexpected ${inner.join()}`);
    if (idx.some((v, k) => k > 0 && v <= idx[k - 1]!)) bad.push(`section ${s}: out of order ${inner.join()}`);
    if (inner[inner.length - 1] !== 'lane_scratch') bad.push(`section ${s}: scratch is not last before mix`);
    if (!inner.includes('bus_drums') || !inner.includes('bus_bass')) bad.push(`section ${s}: drums and bass buses are always emitted`);
  }
  return bad;
}

describe('renderSong events', () => {
  const sectionCount = pick.ev.sections.length;
  const plain = renderSong(pick.ev, baseOptions);
  const { events, out } = collect((onEvent) => renderSong(pick.ev, { ...baseOptions, onEvent }));

  it('emits the S2.2 sequence', () => {
    expect(problems(events, sectionCount)).toEqual([]);
  });
  it('start carries the song, then 13 voices of stages and bank, then both attachments', () => {
    const start = events[0]!;
    expect(start).toMatchObject({ type: 'start', mode: 'render', rate: pick.ev.params.rate, seed: pick.ev.params.seed });
    if (start.type !== 'start') throw new Error('unreachable');
    expect(start.sections.map((s) => s.bars)).toEqual(pick.ev.sections.map((s) => s.drums.length));
    const banks = events.filter((e) => e.type === 'bank');
    expect(banks.map((e) => e.type === 'bank' && e.voice)).toEqual(VOICES);
    expect(events.filter((e) => e.type === 'attach').map((e) => e.type === 'attach' && e.voice)).toEqual(['snare_accent', 'snare_ghost']);
    const kick = events.filter((e) => e.type === 'stage' && e.voice === 'kick');
    expect(kick.map((e) => e.type === 'stage' && e.index)).toEqual(kick.map((_, i) => i));
    expect(kick[0]).toMatchObject({ stage: 'pitch_env', env: { n: 64 } });
    expect(events.filter((e) => e.type === 'stage' && e.voice === 'ch').map((e) => e.type === 'stage' && e.stage))
      .toEqual(expect.arrayContaining(['metallic', 'noise', 'mix', 'body_env', 'jitter', 'tanh', 'filter', 'normalise', 'pcm_grain']));
  });
  it('emits a hatpool of 8 named variants for a drums-on section', () => {
    const pool = events.find((e) => e.type === 'hatpool');
    expect(pool).toBeDefined();
    if (pool?.type === 'hatpool') expect(pool.variants.map((v) => v.name)).toEqual(Array.from({ length: 8 }, (_, i) => `hat_${i}`));
  });
  it('a listener does not change the audio', () => {
    expect(out.length).toBe(plain.length);
    let max = 0;
    for (let i = 0; i < plain.length; i++) max = Math.max(max, Math.abs(out[i]! - plain[i]!));
    expect(max).toBe(0);
  });
  it('bankSeen suppresses stage, bank and attach only', () => {
    const seen = collect((onEvent) => renderSong(pick.ev, { ...baseOptions, onEvent, bankSeen: true })).events;
    expect(seen.some((e) => e.type === 'stage' || e.type === 'bank' || e.type === 'attach')).toBe(false);
    expect(seen.length).toBe(events.length - events.filter((e) => e.type === 'stage' || e.type === 'bank' || e.type === 'attach').length);
  });
});

describe('renderSongCached events', () => {
  const sectionCount = pick.ev.sections.length;
  const cache: SectionMixCache = new Map();
  const cold = collect((onEvent) => renderSongCached(pick.ev, { ...baseOptions, onEvent }, cache));
  const warm = collect((onEvent) => renderSongCached(pick.ev, { ...baseOptions, onEvent }, cache));

  it('a cold run streams like renderSong with cached false', () => {
    expect(problems(cold.events, sectionCount)).toEqual([]);
    expect(cold.events.filter((e) => e.type === 'section').every((e) => e.type === 'section' && !e.cached)).toBe(true);
  });
  it('a warm run emits the bank once and each section as cached, with no lane, bus or mix events (M1)', () => {
    expect(warm.events.filter((e) => e.type === 'bank')).toHaveLength(13);
    const sections = warm.events.filter((e) => e.type === 'section');
    expect(sections).toHaveLength(sectionCount);
    expect(sections.every((e) => e.type === 'section' && e.cached)).toBe(true);
    expect(warm.events.some((e) => e.type === 'lane' || e.type === 'bus' || e.type === 'mix')).toBe(false);
    expect(warm.events.map((e) => e.type).slice(-4)).toEqual(['join', 'texture', 'master', 'done']);
    expect(Array.from(warm.out)).toEqual(Array.from(cold.out));
  });
});
