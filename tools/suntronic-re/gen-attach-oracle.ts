/**
 * gen-attach-oracle.ts — bake the Paula volume-attach structural fixture.
 *
 * sound12.tn drives Paula volume-attach (opcode 0x91) on voice 1: hardware mutes
 * voice 1 and overwrites voice 2's per-sample volume with voice 1's DMA word
 * (custom.c:508, audio.c:506) → voice 2 becomes an amplitude-modulated carrier that
 * rails to full scale, voice 1 goes silent. All four voices are synth (no companion
 * PCM), so the fixture is just the module bytes; the test renders natively and
 * asserts the structural signature (modulator muted, carrier rails) that the attach
 * model produces and a revert (modulator audible, carrier at normal 0.25 ceiling)
 * breaks.
 *
 *   TSX_TSCONFIG_PATH=tsconfig.app.json npx tsx tools/suntronic-re/gen-attach-oracle.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { CORPUS_DIR, rms } from './suntronicLib';
import { parseSunTronicV13Score } from '../../src/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../../src/engine/suntronic/SunTronicNativeRender';
import { peak } from './audio-oracle';

const NAME = 'sound12.tn';
const MODULATOR = 1, CARRIER = 2;
const OUT = join(process.cwd(), 'src/engine/suntronic/__fixtures__/suntronicAttachOracle.json');

const data = new Uint8Array(readFileSync(join(CORPUS_DIR, NAME)));
const score = parseSunTronicV13Score(data);
const mix = renderSunTronicMix(score, [], { seconds: 2 });
const modRms = rms(mix.ch[MODULATOR]);
const carRms = rms(mix.ch[CARRIER]);
const carPeak = peak(mix.ch[CARRIER]);
console.log(`${NAME}: modulator v${MODULATOR} rms=${modRms.toFixed(4)}  carrier v${CARRIER} rms=${carRms.toFixed(4)} peak=${carPeak.toFixed(4)}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generated: 'gen-attach-oracle.ts',
  name: NAME, modulator: MODULATOR, carrier: CARRIER,
  bytesB64: Buffer.from(data).toString('base64'),
  seconds: 2,
}, null, 1));
console.log(`wrote ${OUT}`);
