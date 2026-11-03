import { describe, it, expect } from 'vitest';
import { companionPathsIn, type ListedFile } from './modlandCompanions';

const f = (format: string, author: string, filename: string): ListedFile => ({ format, author, filename });
const P = (format: string, author: string, filename: string) => `pub/modules/${format}/${author}/${filename}`;

describe('companionPathsIn', () => {
  it('flags the sample half of a TFMX pair and keeps the song', () => {
    const out = companionPathsIn([
      f('TFMX', 'Huelsbeck', 'mdat.rocknroll'),
      f('TFMX', 'Huelsbeck', 'smpl.rocknroll'),
    ]);
    expect(out.has(P('TFMX', 'Huelsbeck', 'smpl.rocknroll'))).toBe(true);
    expect(out.has(P('TFMX', 'Huelsbeck', 'mdat.rocknroll'))).toBe(false);
  });

  it('flags files in a sample directory and a shared smp.set bank', () => {
    const out = companionPathsIn([
      f('Sonix', 'Someone', 'tune.smus'),
      f('Sonix', 'Someone', 'Instruments/Saxophone.ss'),
      f('Richard Joseph', 'Joseph', 'rjp.song'),
      f('Richard Joseph', 'Joseph', 'smp.set'),
    ]);
    expect(out.has(P('Sonix', 'Someone', 'Instruments/Saxophone.ss'))).toBe(true);
    expect(out.has(P('Sonix', 'Someone', 'tune.smus'))).toBe(false);
    expect(out.has(P('Richard Joseph', 'Joseph', 'smp.set'))).toBe(true);
    expect(out.has(P('Richard Joseph', 'Joseph', 'rjp.song'))).toBe(false);
  });

  it('keeps a .ss song that is not a sample (speedy-system/pauker rap 2.ss)', () => {
    const out = companionPathsIn([f('Speedy System', 'x', 'pauker rap 2.ss')]);
    expect(out.size).toBe(0);
  });

  it('is decided per directory: smpl.x in another author folder does not claim', () => {
    const out = companionPathsIn([
      f('TFMX', 'A', 'mdat.tune'),
      f('TFMX', 'B', 'smpl.tune'),
    ]);
    expect(out.has(P('TFMX', 'B', 'smpl.tune'))).toBe(false);
  });
});
