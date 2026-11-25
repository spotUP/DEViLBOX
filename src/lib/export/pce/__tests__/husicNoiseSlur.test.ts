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
    const block = src.match(/call\t_set_vol\nLLN1:\n((?:;[^\n]*\n|\t[^\n]*\n)*?)\t__ldb\t_ch_nowbank\n\t  call\t_chg_cbank\n\t__lbra\tLL60\nLL89:/);
    expect(block).not.toBeNull();
    const body = (block?.[1] ?? '').split('\n').filter((l) => l.startsWith('\t')).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(body).toEqual(['__ldwi _ch_efx', '__addw_s 10', '__pushw', '__ldb_p', '__pushw', '__ldwi 1', '__comw', '__andws', '__stbps']);
  });

  // A duty-macro noise switch mid-note is exported as a slurred noise note. Restarting the volume envelope there made
  // the ROM decay end ~3 ticks after Furnace's (pcengineasdmo ch5 ticks 53-55, Ma-Da-Ra ch5 every 112 ticks).
  it('main.s skips set_vol on a slurred noise key-on, as the tone path does', () => {
    const src = readFileSync(join(husic, 'hescode/main.s'), 'utf8');
    const block = src.match(/call\t_poke\.2\n((?:;[^\n]*\n|\t[^\n]*\n)*?)\t  call\t_set_vol\nLLN1:\n/);
    expect(block).not.toBeNull();
    const body = (block?.[1] ?? '').split('\n').filter((l) => l.startsWith('\t')).map((l) => l.trim().replace(/\s+/g, ' '));
    expect(body.slice(0, 7)).toEqual(['__ldwi _ch_efx', '__addw_s 10', '__ldb_p', '__andwi 1', '__notw', '__tstw', '__lbeq LLN1']);
    expect(readFileSync(join(husic, 'src/husic/hus.c'), 'utf8')).toMatch(/if \(!\(ch_efx\[ch\] & EFX_SLAR\)\)\n\s*set_vol\(ch, ch_vol\[ch\]\);/);
  });

  it('public/pce/player.pce is built from the current driver source', () => {
    const files = ['hescode', 'stub'].flatMap((d) => readdirSync(join(husic, d)).sort().map((f) => join(husic, d, f)));
    const hash = createHash('sha1').update(Buffer.concat(files.map((f) => readFileSync(f)))).digest('hex').slice(0, 12);
    const meta = JSON.parse(readFileSync(join(root, 'public/pce/player.json'), 'utf8')) as { sourceHash: string };
    expect(meta.sourceHash).toBe(hash);
  });
});
