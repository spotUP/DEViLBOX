/**
 * Move ids the DubRouter registers, read from its source rather than imported,
 * so this stays a pure test with no engine in it. Kept in a fixture file so
 * the parsing lives in one place.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const routerSrc = readFileSync(
  join(__dirname, '..', '..', '..', 'engine', 'dub', 'DubRouter.ts'),
  'utf8',
);

const block = routerSrc.slice(
  routerSrc.indexOf('const MOVES'),
  routerSrc.indexOf('};', routerSrc.indexOf('const MOVES')),
);

export const MOVES_FOR_TEST: readonly string[] = Array.from(
  block.matchAll(/^\s{2}([a-zA-Z0-9_]+),$/gm),
).map(m => m[1]);
