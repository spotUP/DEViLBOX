/** Own WASM replayer vs UADE on one song: levels, non-silent share, envelope correlation.
 * Usage: npx tsx tools/nuade/ownVsUade.ts <ownRender row id> <song path> [seconds] */
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderOwn } from './ownRender';
import { renderFileToSamples } from '../uade-audit/uadeRenderCore';
import { ROOT, levelOf, envelope20, bestLagCorrelation } from './nuadeCompare';
const [rowId, song] = process.argv.slice(2);
if (!rowId || !song) throw new Error('usage: ownVsUade.ts <row id> <song path> [seconds]');
const secs = Number(process.argv[4] ?? 20);
const own = await renderOwn(rowId, song, secs);
const bytes = new Uint8Array(readFileSync(join(ROOT, song)));
const uade = await renderFileToSamples(bytes, basename(song), { sampleRate: 48000, seconds: secs });
const w = Math.floor(secs * 1000 / 20) - 60;
const o = own!.samples, u = uade.samples;
const eo = envelope20(o, 48000), eu = envelope20(u, 48000);
const nz = (e: number[]) => e.filter((x) => x > 1e-3).length / e.length;
console.log(JSON.stringify({ ownErr: own!.error, own: levelOf(o), uade: levelOf(u), nonSilentOwn: nz(eo), nonSilentUade: nz(eu), corr: bestLagCorrelation(eo, eu, w) }));
// first 2s envelope per 0.25s
const bin = (e: number[]) => Array.from({ length: 8 }, (_, i) => +(e.slice(i * 12, i * 12 + 12).reduce((a, b) => a + b, 0) / 12).toFixed(3));
console.log('own', bin(eo).join(' ')); console.log('uade', bin(eu).join(' '));
