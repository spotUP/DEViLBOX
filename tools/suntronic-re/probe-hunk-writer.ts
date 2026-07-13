/**
 * probe-hunk-writer.ts — the mandated Phase 4 oracle: round-trip every corpus
 * module through parseHunks → writeHunks → parseHunks and assert the re-emitted
 * file is byte-identical to the original. This proves the hunk WRITER is a true
 * byte-inverse of the reader BEFORE the compile path is built on top of it.
 *
 * Usage: npx tsx tools/suntronic-re/probe-hunk-writer.ts [module]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR, listCorpusModules } from './suntronicLib';
import { parseHunks, writeHunks } from '../../src/lib/import/formats/SunTronicV13';

function bytesEqual(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return -2; // length mismatch sentinel
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

function main(): void {
  const only = process.argv[2];
  const files = only ? [only] : listCorpusModules();
  let ok = 0;
  const fails: string[] = [];
  for (const name of files) {
    try {
      const buf = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
      const re = writeHunks(parseHunks(buf));
      const diff = bytesEqual(buf, re);
      if (diff === -1) ok++;
      else if (diff === -2) fails.push(`${name}: length ${buf.length} -> ${re.length}`);
      else fails.push(`${name}: first byte diff at 0x${diff.toString(16)} (${buf[diff]} vs ${re[diff]})`);
    } catch (e) {
      fails.push(`${name}: ${(e as Error).message}`);
    }
  }
  console.log(`[hunk-writer oracle] ${ok}/${files.length} modules re-emit byte-identical`);
  for (const f of fails.slice(0, 20)) console.log(`  FAIL ${f}`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main();
