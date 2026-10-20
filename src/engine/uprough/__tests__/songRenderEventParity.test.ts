/**
 * R2e: the render-stage event stream of the TS renderer equals the host's, in order and keys, for the same song file.
 * The fixture is made by the host (Up_Rough_Demo_System tools/r2_parity_fixture.py: song_file.new, then
 * render_events of to_events(doc)); regenerate it with
 *   /opt/homebrew/bin/python3.11 tools/r2_parity_fixture.py --out <this dir>/fixtures/r2_event_parity.json
 * `decide` and `scratchplan` exist only on the host generate path, so render mode carries neither.
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/r2_event_parity.json';
import { songFileToBarEvents } from '@/lib/uprough/barEvents';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import type { R2Event } from '../r2Events';
import { renderSong, songRenderOptions } from '../songRender';

type Row = (string | string[])[];
const hostAll = fixture as unknown as { doc: SongFileDoc; shape: Row[]; hatpool_variants: number[] };
/**
 * Protocol M7: the host emits `bus sample` whenever the sample lane has content (the song's chops), and the TS renderer has
 * no chops yet (plan O6m, locked layers). That row is the one documented host-only event; everything else must match.
 * The test pins the exemption: only `bus sample` rows are dropped, and the fixture must hold at least one.
 */
const isSampleBus = (r: Row): boolean => r[0] === 'bus' && r[1] === 'sample';
const host = { ...hostAll, shape: hostAll.shape.filter((r) => !isSampleBus(r)) };

/** The same row as host tools/r2_events.py event_shape: type, voice/stage/lane/bus when present, then the sorted keys. */
export function eventShape(events: readonly R2Event[]): Row[] {
  return events.map((e) => {
    const rec = e as unknown as Record<string, unknown>;
    const row: Row = [e.type];
    for (const k of ['voice', 'stage', 'lane', 'bus']) if (k in rec) row.push(String(rec[k]));
    row.push(Object.keys(rec).sort());
    return row;
  });
}

describe('host vs TS render events (same song file)', () => {
  const ev = songFileToBarEvents(host.doc);
  const events: R2Event[] = [];
  renderSong(ev, { ...songRenderOptions(host.doc), onEvent: (e) => events.push(e) });
  const ts = eventShape(events);

  it('has the same events in the same order with the same keys', () => {
    expect(ts.length).toBe(host.shape.length);
    const firstDiff = ts.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(host.shape[i]));
    expect(firstDiff === -1 ? null : { at: firstDiff, ts: ts[firstDiff], host: host.shape[firstDiff] }).toBeNull();
  });
  it('exempts only the host-only sample bus (M7, chops are not ported)', () => {
    expect(hostAll.shape.filter(isSampleBus).length).toBeGreaterThan(0);
    expect(hostAll.shape.length - host.shape.length).toBe(hostAll.shape.filter(isSampleBus).length);
  });
  it('builds the hat pool at the host size (the pool knob is not part of the song file)', () => {
    const sizes = events.flatMap((e) => (e.type === 'hatpool' ? [e.variants.length] : []));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes).toEqual(host.hatpool_variants);
  });
  it('is not vacuous: the fixture holds banks, lanes and buses (render count sentinel)', () => {
    const types = new Set(host.shape.map((r) => r[0]));
    for (const t of ['bank', 'attach', 'section', 'hatpool', 'lane', 'bus', 'mix', 'join', 'texture', 'master', 'done']) expect(types.has(t)).toBe(true);
    expect(events.length).toBe(host.shape.length);
  });
});
