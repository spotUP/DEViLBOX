/**
 * A David Whittaker voice with no position list (its header pointer is zero, or the loader refused its track) used to
 * hang the replayer: the voice stood on the one-byte empty track whose end-of-track command wraps to the same empty
 * track, so reading it never reached a command that ends the row and the tick never returned (a dropped file froze the
 * app). The replayer now leaves a voice without a track alone. A hung walk cannot be interrupted in-process; run the
 * file under an external timeout to see the failure with the fix reverted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkDavidWhittaker } from '../DavidWhittakerWasmExtractor';
import { installDwNodeFetch } from '../../__tests__/helpers/dwNodeFetch';

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

const ab = (b: Uint8Array) => b.slice().buffer as ArrayBuffer;

describe('David Whittaker: a voice with no track', () => {
  it('walks the other voices and returns when one voice of subsong 0 has a zero position-list pointer', async () => {
    const file = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/data/songs/david-whittaker/garfield2+.dw')));
    const base = await walkDavidWhittaker(ab(file), undefined, 0);
    const word = (i: number) => (file[i] << 8) | file[i + 1];
    let header = -1;
    for (let i = 2; i + 8 <= file.length && header < 0; i++) {
      if (file[i - 2] !== base.speed || file[i - 1] !== 0) continue;
      let all = true;
      for (let k = 0; k < base.channels; k++) if (!base.layout.entries.some((x) => x.at === word(i + k * 2))) all = false;
      if (all) header = i;
    }
    expect(header).toBeGreaterThan(0);
    const voice = base.channels - 1;
    const cut = new Uint8Array(file);
    cut[header + voice * 2] = 0; cut[header + voice * 2 + 1] = 0;

    const t0 = Date.now();
    const walk = await walkDavidWhittaker(ab(cut), undefined, 0);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(walk.events.some((e) => e.channel === voice)).toBe(false);
    for (let ch = 0; ch < voice; ch++) {
      expect(walk.events.filter((e) => e.channel === ch).length).toBe(base.events.filter((e) => e.channel === ch).length);
    }
  }, 20000);
});
