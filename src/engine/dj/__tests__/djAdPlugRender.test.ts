/**
 * DJR-ADLIB: an AdLib song renders on a DJ deck through the tracker's own AdPlug build (AdPlugPlayer.js +
 * AdPlugPlayer.wasm), with per-OPL-channel scopes and mono stems from fmopl.c's scope capture.
 *
 * Before: the render worker threw "AdLib/OPL formats not yet supported in DJ renderer" for every isAdLibFormat file.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { servePublicToFetch } from '@/test/audio/realWebAudio';
import { renderWithAdPlug } from '@/workers/dj-render/adlibRender';

const RAD = resolve(__dirname, '../../../../public/data/songs/ad-lib/Reality AdLib Tracker/Void (AU)/waterfall.rad');

const peak = (a: ArrayLike<number>): number => { let p = 0; for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); return p; };

describe('an AdLib song renders on a DJ deck through AdPlug', () => {
  beforeAll(() => { servePublicToFetch(); });

  it('renders waterfall.rad to non-silent stereo with sounding per-channel stems', async () => {
    const b = readFileSync(RAD);
    const r = await renderWithAdPlug(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'waterfall.rad', 0, () => {}, 6, true);
    expect(r.sampleRate).toBe(44100);
    expect(r.left.length).toBeGreaterThan(44100 * 5);
    expect(Math.max(peak(r.left), peak(r.right))).toBeGreaterThan(0.001);
    // waterfall.rad is OPL2 (chip 0 only): both channels carry it, not the left alone.
    expect(peak(r.right)).toBeGreaterThan(0.001);
    expect(peak(r.right)).toBeCloseTo(peak(r.left), 3);
    expect(r.channelScopes).toBeDefined();
    const sounding = (r.monoStems ?? []).filter((s) => peak(s.mono) > 32);
    expect(sounding.length).toBeGreaterThan(0);
    const clipped = (a: ArrayLike<number>): number => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] >= 32767 / 32768 || a[i] <= -1) n++; return n; };
    console.log(`[djAdPlugRender] peak L ${peak(r.left).toFixed(4)} R ${peak(r.right).toFixed(4)}, clipped L ${clipped(r.left)} R ${clipped(r.right)} of ${r.left.length}, ${sounding.length} sounding stems`);
  }, 120_000);
});
