import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every route into the UADE parser hands over the companion files.
 *
 * Thirty-three call sites did not (2026-09-22). A DynamicSynthesizer module
 * arrived with `smp.starball title` found, sent and decoded, and the `dns.`
 * route called parseUADEFile without it; the 68k player asked for
 * `SMP.starball title`, the file was never in the filesystem, and UADE
 * refused the module — the same symptom as a format that does not work.
 * The resolver can find a companion; only the route can lose it.
 */
const files = [
  'src/lib/import/parsers/AmigaFormatParsers.ts',
  'src/lib/import/parseModuleToSong.ts',
  'src/lib/import/parsers/withFallback.ts',
];

/** Each `parseUADEFile(` call with its full argument text, across lines. */
function callsIn(src: string): Array<{ n: number; text: string }> {
  const out: Array<{ n: number; text: string }> = [];
  const re = /parseUADEFile\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 40), m.index);
    if (/import\s*\{[^}]*$/.test(before) || /function\s*$/.test(before)) continue;
    const end = src.indexOf(');', m.index);
    out.push({ n: src.slice(0, m.index).split('\n').length, text: src.slice(m.index, end) });
  }
  return out;
}

describe('parseUADEFile call sites', () => {
  for (const file of files) {
    it(`${file}: every call passes companionFiles`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf-8');
      const dropping = callsIn(src).filter(c => !/companionFiles/.test(c.text));
      expect(dropping.map(c => `${c.n}: ${c.text.replace(/\s+/g, ' ').trim()}`)).toEqual([]);
    });
  }
});
