import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { vgmToXgm } from '../xgmtoolWasm';

describe('xgmtool WASM', () => {
  it('converts a Mega Drive VGM to an XGM with the XGM magic', async () => {
    const vgm = new Uint8Array(gunzipSync(readFileSync('public/data/songs/vgm/sparkster - continue.vgz')));
    // @ts-expect-error generated JS module, no types
    const { default: create } = await import('../../../../../public/xgmtool/xgmtool.js');
    const { xgm } = await vgmToXgm(vgm, create, { locateFile: (f) => resolve('public/xgmtool', f) });
    expect(new TextDecoder().decode(xgm.subarray(0, 4))).toBe('XGM ');
    expect(xgm.length).toBeGreaterThan(1000);
  }, 60000);
});
