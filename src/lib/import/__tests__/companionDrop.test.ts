import { describe, it, expect } from 'vitest';
import { pickCompanionsFromDrop } from '../companionDrop';

function f(name: string, rel?: string): File {
  const file = new File([new Uint8Array([1])], name.split('/').pop() ?? name);
  if (rel) Object.defineProperty(file, 'webkitRelativePath', { value: rel });
  return file;
}

describe('pickCompanionsFromDrop', () => {
  it('a folder of SynthPack tunes registers the one smp.set, not the other seven songs', () => {
    const main = f('dyter07 title.osp', 'Dyter-07/dyter07 title.osp');
    const others = ['dyter07 hiscore.osp', 'dyter07 mainfx.osp', 'dyter07 ongame01.osp', 'smp.set']
      .map(n => f(n, `Dyter-07/${n}`));
    const picked = pickCompanionsFromDrop(main, others);
    expect(picked.files.map(p => p.key)).toEqual(['smp.set']);
    expect(picked.keptAll).toBe(false);
  });

  it('the discriminating pair from one folder drop', () => {
    const dir = 'Laurens Tummers';
    const all = ['sdr.nobuddiesland end 2', 'smp.nobuddiesland end 2', 'sdr.monsterbusiness 5', 'smp.set'];
    const files = (except: string) => all.filter(n => n !== except).map(n => f(n, `${dir}/${n}`));
    expect(pickCompanionsFromDrop(f('sdr.nobuddiesland end 2', `${dir}/sdr.nobuddiesland end 2`), files('sdr.nobuddiesland end 2')).files.map(p => p.key))
      .toEqual(['smp.nobuddiesland end 2']);
    expect(pickCompanionsFromDrop(f('sdr.monsterbusiness 5', `${dir}/sdr.monsterbusiness 5`), files('sdr.monsterbusiness 5')).files.map(p => p.key))
      .toEqual(['smp.set']);
  });

  it('keeps subdirectory companions under their relative names', () => {
    const main = f('tank1.sun', 'sun/tank1.sun');
    const picked = pickCompanionsFromDrop(main, [f('perc1.x', 'sun/instr/perc1.x'), f('readme.txt', 'sun/readme.txt')]);
    expect(picked.files.map(p => p.key)).toEqual(['instr/perc1.x']);
  });

  it('keeps everything when the rules name nothing — the user chose those files', () => {
    const main = f('song.xyz', 'd/song.xyz');
    const picked = pickCompanionsFromDrop(main, [f('bank.bin', 'd/bank.bin')]);
    expect(picked.files.map(p => p.key)).toEqual(['bank.bin']);
    expect(picked.keptAll).toBe(true);
  });
});
