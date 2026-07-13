/**
 * extract-template.ts — regenerate src/generated/sunTronicV13Template.ts from the
 * reference module (mule.src). Committed artifact; guarded by the golden test
 * src/generated/__tests__/sunTronicV13Template.test.ts.
 *
 * Usage: npx tsx tools/suntronic-re/extract-template.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CORPUS_DIR } from './suntronicLib';
import { deriveSunTronicV13Template, renderTemplateSource } from './templateDerive';

const OUT = join(process.cwd(), 'src/generated/sunTronicV13Template.ts');

function main(): void {
  const mule = new Uint8Array(readFileSync(join(CORPUS_DIR, 'mule.src')));
  const template = deriveSunTronicV13Template(mule);
  writeFileSync(OUT, renderTemplateSource(template));
  console.log(`[extract-template] wrote ${OUT}`);
  console.log(`  module bytes=${mule.length} instruments=${template.instrumentNames.length} blocks=${template.layout.blockCount}`);
}

main();
