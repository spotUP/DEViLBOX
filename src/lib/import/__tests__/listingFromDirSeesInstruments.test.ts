/**
 * The UADE reference render listed only the song's own directory, so a SMUS
 * never got its Instruments/ files and the render failed (ret=-1). The
 * listing goes one level deep, like the app's folder drop.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { listingFromDir } from '../../../../tools/uade-audit/listingFromDir';
import { resolveCompanions } from '../companionResolver';

const dir = join(__dirname, '../../../../public/data/songs/iff-smus/Petri Alanko/Radiokomppi');

describe('listingFromDir', () => {
  it('hands a SMUS its Instruments/ files', () => {
    const wanted = resolveCompanions('Radiokomppi.smus', listingFromDir(dir)).companions;
    expect(wanted).toContain('Instruments/BassDrum.instr');
    expect(wanted).toContain('Instruments/SnareDrum.ss');
  });
});
