import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// HuSIC key-on skips reset_te/ne/pe when EFX_SLAR is set. The tone path clears the flag at LL96, but the
// noise path returned before that, so one slurred noise note left the flag stuck and every later noise
// note kept its old pitch envelope (pcengineasdmo ch5 snare at ticks 566/607: noise reg stuck at 0x98).
const root = join(__dirname, '../../../../..');
const husic = join(root, 'third-party/husic');

describe('HuSIC noise key-on clears the slur flag', () => {
  it('main.s clears EFX_SLAR in the noise key-on path, before the bank switch back', () => {
    const src = readFileSync(join(husic, 'hescode/main.s'), 'utf8');
    const block = src.match(/call\t_set_vol\n((?:;[^\n]*\n|\t[^\n]*\n)*?)\t__ldb\t_ch_nowbank\n\t  call\t_chg_cbank\n\t__lbra\tLL60\nLL89:/);
    expect(block).not.toBeNull();
    const body = (block?.[1] ?? '').split('\n').filter((l) => l.startsWith('\t')).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(body).toEqual(['__ldwi _ch_efx', '__addw_s 10', '__pushw', '__ldb_p', '__pushw', '__ldwi 1', '__comw', '__andws', '__stbps']);
  });

  it('public/pce/player.pce is built from the current driver source', () => {
    const files = ['hescode', 'stub'].flatMap((d) => readdirSync(join(husic, d)).sort().map((f) => join(husic, d, f)));
    const hash = createHash('sha1').update(Buffer.concat(files.map((f) => readFileSync(f)))).digest('hex').slice(0, 12);
    const meta = JSON.parse(readFileSync(join(root, 'public/pce/player.json'), 'utf8')) as { sourceHash: string };
    expect(meta.sourceHash).toBe(hash);
  });
});
