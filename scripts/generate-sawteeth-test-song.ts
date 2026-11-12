/**
 * Writes public/data/songs/sawteeth/TEST-all-effects-okolaNUKE.st from okolaNUKE.st (left untouched) through the
 * product parser and exporter: npx tsx scripts/generate-sawteeth-test-song.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSawteethEffectTestSong } from '../src/lib/import/formats/SawteethTestSong';
import { exportSawteeth } from '../src/lib/export/SawteethExporter';

const dir = 'public/data/songs/sawteeth/';
const song = buildSawteethEffectTestSong(new Uint8Array(readFileSync(`${dir}okolaNUKE.st`)));
const { data, warnings } = await exportSawteeth(song);
writeFileSync(`${dir}TEST-all-effects-okolaNUKE.st`, new Uint8Array(await data.arrayBuffer()));
console.log('written', data.size, 'bytes', warnings);
