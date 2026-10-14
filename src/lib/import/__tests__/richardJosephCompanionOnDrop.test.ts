/**
 * RJP-COMPANION-ON-DROP (owner 2026-10-14): a dropped `rjp.<tune>` never got its sample bank.
 * `rjp` was not a role word, so the resolver found no companion and the bank stayed out.
 *
 * Rule mirrors the UADE eagleplayer (Richard Joseph Player_v2.asm: Prefix 'RJP.', ExtLoad
 * tries 'SMP.<tune>', then SampleName 'SMP.set'): exact pair first, else the shared smp.set,
 * never another tune's bank.
 *
 * One reachability test: folder-drop picker -> parseModuleToSong (the real import entry) -> samples.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCompanionsFromDrop } from '../companionDrop';
import { expectedCompanionNames } from '../companionResolver';
import { needsCompanionPrompt } from '../../song/importChoice';
import { parseModuleToSong } from '../../../lib/import/parseModuleToSong';

const DIR = join(process.cwd(), 'public/data/songs/richard-joseph');
const song = readFileSync(join(DIR, 'cannon fodder (intro).sng'));
const bank = readFileSync(join(DIR, 'cannon fodder (intro).ins'));
const other = new Uint8Array(bank.length).fill(0x11);   // another tune's bank: must never be picked

function file(name: string, bytes: Uint8Array, folder = 'game'): File {
  const f = new File([bytes as BlobPart], name);
  Object.defineProperty(f, 'webkitRelativePath', { value: `${folder}/${name}` });
  return f;
}

async function importDrop(main: string, names: Record<string, Uint8Array>, expectKeys?: string[]): Promise<number> {
  const mainFile = file(main, song);
  const dropped = Object.entries(names).map(([n, b]) => file(n, b));
  const picked = pickCompanionsFromDrop(mainFile, dropped);
  if (expectKeys) expect(picked.files.map(p => p.key)).toEqual(expectKeys);
  const companions = new Map<string, ArrayBuffer>();
  for (const p of picked.files) companions.set(p.key, await p.file.arrayBuffer());
  const s = await parseModuleToSong(mainFile, 0, undefined, undefined, companions);
  return s.instruments.filter(i => i.sample?.audioBuffer || i.type === 'sample').length;
}

describe('rjp.<tune> drop carries its sample bank', () => {
  it('exact pair: rjp.world_1 + smp.world_1 imports with sample data, ignoring other tunes banks', async () => {
    const n = await importDrop('rjp.world_1', {
      'smp.world_1': new Uint8Array(bank), 'smp.title': other, 'rjp.title': song, 'smp.world_2': other,
    }, ['smp.world_1']);
    expect(n).toBeGreaterThan(0);
  });

  it('shared bank: rjp.ingame_3 + the folder smp.set imports with sample data', async () => {
    const n = await importDrop('rjp.ingame_3', { 'smp.set': new Uint8Array(bank), 'rjp.bonus': song, 'rjp.title': song }, ['smp.set']);
    expect(n).toBeGreaterThan(0);
  });

  it('several banks and no exact match: no other tune bank is taken', async () => {
    const n = await importDrop('rjp.ingame_3', { 'smp.title': new Uint8Array(bank), 'smp.world_1': new Uint8Array(bank) });
    expect(n).toBe(0);
  });

  it('a lone rjp.<tune> drop asks for the bank instead of loading silent', () => {
    expect(needsCompanionPrompt('rjp.title', 0)).toBe(true);
    expect(needsCompanionPrompt('rjp.title', 1)).toBe(false);
    expect(expectedCompanionNames('rjp.title')).toEqual(['smp.title', 'smp.set']);
  });
});
