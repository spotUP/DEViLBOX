/**
 * probe-tables.ts — dump native player's parsed PERIODS + drin tables for two
 * modules to confirm the replayer-constant data resolves identically (i.e. deltaA
 * relocation is correct per module). NOT committed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { SunTronicPlayer } from '../../src/engine/suntronic/SunTronicPlayer';

function dump(name: string): void {
  const data = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const score = parseSunTronicV13Score(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = new SunTronicPlayer(score, { subsong: 0 }) as any;
  console.log(`\n=== ${name} deltaA=${(score.deltaA >>> 0).toString(16)} periodsOff=${(p.periodsOff >>> 0).toString(16)} ===`);
  const per: number[] = [];
  for (let i = 0x20; i < 0x40; i++) per.push(p.periods[i]);
  console.log('periods[0x20..0x40):', per.join(' '));
  const dr: number[] = [];
  for (let i = 0; i < 16; i++) dr.push(p.drin[i]);
  console.log('drin[0..16):', dr.join(' '));
}

dump(process.argv[2] ?? 'gliders.src');
dump(process.argv[3] ?? 'ballblaser.src');
