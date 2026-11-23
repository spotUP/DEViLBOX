/**
 * pxtone editability stage 1: the wasm harness exposes the event list and
 * pxtnService::write. Loaded headless in node (web bundle + node env).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const FIXTURE = join(ROOT, 'public/data/songs/piston-collage/obj1263-1.ptcop');

interface PxModule {
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  _pxtone_init: (p: number, n: number) => number;
  _pxtone_stop: () => void;
  _pxtone_get_event_count: () => number;
  _pxtone_get_event: (i: number, out: number) => number;
  _pxtone_add_event: (clock: number, unit: number, kind: number, value: number) => number;
  _pxtone_remove_event: (clock: number, unit: number, kind: number) => number;
  _pxtone_set_event: (clock: number, unit: number, kind: number, value: number) => number;
  _pxtone_write: () => number;
  _pxtone_write_data: () => number;
}

let b: WebBundle<PxModule>;
const src = new Uint8Array(readFileSync(FIXTURE));

function load(data: Uint8Array): void {
  const m = b.module;
  const p = m._malloc(data.length);
  b.heap().set(data, p);
  expect(m._pxtone_init(p, data.length)).toBe(0);
  m._free(p);
}
function events(): number[][] {
  const m = b.module;
  const out = m._malloc(16);
  const list: number[][] = [];
  for (let i = 0, n = m._pxtone_get_event_count(); i < n; i++) {
    m._pxtone_get_event(i, out);
    list.push([...new Int32Array(b.heap().buffer, out, 4)]);
  }
  m._free(out);
  return list;
}
function written(): Uint8Array {
  const n = b.module._pxtone_write();
  expect(n).toBeGreaterThan(0);
  return new Uint8Array(b.heap().buffer, b.module._pxtone_write_data(), n).slice();
}

beforeAll(async () => {
  b = await loadWebBundle<PxModule>(join(ROOT, 'public/pxtone/Pxtone.js'), join(ROOT, 'public/pxtone/Pxtone.wasm'), 'createPxtone');
}, 60_000);

describe('pxtone write round trip', () => {
  it('reads events and writes with no edit', () => {
    load(src);
    expect(events().length).toBeGreaterThan(0);
    const out = written();
    // Not byte-identical by design: the fixture is PTCOLLAGE-060930A (old layout), write() emits the
    // current v5 layout (071119A); only the container header and event encoding differ, the event list is equal.
    expect(Buffer.from(out.slice(0, 10)).toString()).toBe('PTCOLLAGE-');
    // the re-read of our own output must give the same event list
    const before = events();
    load(out);
    expect(events()).toEqual(before);
  });

  it('add / set / remove reach the written file', () => {
    load(src);
    const base = events();
    expect(b.module._pxtone_add_event(1, 0, 6, 12345)).toBe(0);
    expect(events().length).toBe(base.length + 1);
    expect(b.module._pxtone_set_event(1, 0, 6, 777)).toBeGreaterThan(0);
    load(written());
    expect(events().find((e) => e[0] === 1 && e[1] === 0 && e[2] === 6)?.[3]).toBe(777);
    expect(b.module._pxtone_remove_event(1, 0, 6)).toBeGreaterThan(0);
    expect(events().length).toBe(base.length);
  });
});

describe('pxtone stage 2: beat clock and live set_events', () => {
  it('reads the beat clock and swaps the event list', () => {
    load(src);
    const m = b.module as PxModule & {
      _pxtone_get_beat_clock: () => number; _pxtone_get_beat_num: () => number;
      _pxtone_set_events: (p: number, n: number) => number;
    };
    expect(m._pxtone_get_beat_clock()).toBeGreaterThan(0);
    expect(m._pxtone_get_beat_num()).toBeGreaterThan(0);
    const base = events();
    const edited = base.map((e) => [...e]);
    const ei = edited.findIndex((e) => e[2] === 6 /* PORTAMENT */) >= 0 ? edited.findIndex((e) => e[2] === 6) : 0;
    edited[ei][3] += 1;
    edited.push([1, 0, 6, 4242]);
    edited.sort((a, c) => a[0] - c[0]);
    const flat = new Int32Array(edited.flat());
    const p = m._malloc(flat.byteLength);
    new Int32Array(b.heap().buffer, p, flat.length).set(flat);
    expect(m._pxtone_set_events(p, edited.length)).toBe(edited.length);
    m._free(p);
    const after = events();
    expect(after.length).toBe(base.length + 1);
    expect(after).not.toEqual(base);
    expect(after.some((e) => e[0] === 1 && e[3] === 4242)).toBe(true);
    load(written());
    expect(events().length).toBe(after.length);
  });
});
