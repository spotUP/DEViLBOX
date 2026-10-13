/** Regenerates the nuade format list inside THIRD_PARTY_NOTICES.md from the table. Run after apply-verdicts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { withNuadeNoticesBlock } from '../../src/engine/nuade/nuadeCredits';

const file = new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url).pathname;
writeFileSync(file, withNuadeNoticesBlock(readFileSync(file, 'utf8')));
console.log('[OK] THIRD_PARTY_NOTICES.md nuade list rewritten');
