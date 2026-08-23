/**
 * espeakBundle.test.ts — the stripped eSpeak-NG bundle must actually speak.
 *
 * The 2026-03 strip kept 117 novelty voices but dropped the lang/ directory —
 * the files that define the languages themselves — so set_voice('en') was a
 * silent no-op and the first text_to_phonemes call aborted the wasm. The app
 * caught the abort, disabled eSpeak and silently fell back to SAM rules for
 * everything, which meant the "better G2P" path never ran for anyone.
 *
 * Guards both layers: the manifest must carry the en-US voice definition, and
 * the wasm must convert real text end to end.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BUNDLE_JS = join(ROOT, 'public/espeak-ng.js');

describe('espeak-ng stripped bundle', () => {
  it('carries the language definitions the voices need', () => {
    const js = readFileSync(BUNDLE_JS, 'utf8');
    for (const path of [
      'espeak-ng-data/lang/gmw/en',
      'espeak-ng-data/lang/gmw/en-US',
      'espeak-ng-data/phontab',
      'espeak-ng-data/phonindex',
      'espeak-ng-data/phondata',
      'espeak-ng-data/en_dict',
    ]) {
      expect(js.includes(path), `${path} missing from bundle manifest`).toBe(true);
    }
  });

  it('converts text to IPA without aborting', async () => {
    // Import the node_modules copy (patched from public/ by postinstall) so the
    // emscripten loader can find its sibling .data file.
    const modPath = join(ROOT, 'node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js');
    const { default: EspeakModule } = await import(/* @vite-ignore */ modPath);
    const mod = await EspeakModule();
    const worker = new mod.eSpeakNGWorker();
    worker.set_voice('en-us');
    const result = worker.convert_to_phonemes('hello world', true);
    const ptr = (result && typeof result === 'object' && 'ptr' in result) ? result.ptr : result;
    expect(typeof ptr).toBe('number');
    const heap: Uint8Array = mod.HEAPU8;
    let end = ptr;
    while (end < heap.length && heap[end] !== 0) end++;
    const ipa = new TextDecoder().decode(heap.slice(ptr, end));
    // American hello: h ə l ˈoʊ (espeak writes the diphthong as oʊ).
    expect(ipa).toContain('l_ˈoʊ');
  }, 30000);
});
