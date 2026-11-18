import { readFileSync } from 'node:fs';

/**
 * Reads a JSON fixture at test run time. A static `import x from './fixtures/y.json'` makes tsc infer a literal type
 * for every value (tens of MB of fixtures -> GBs of heap in `npm run type-check`); this keeps the JSON out of the program.
 * `base` is the caller's import.meta.url, `relPath` is relative to the caller.
 */
export function loadFixture<T = unknown>(base: string, relPath: string): T {
  return JSON.parse(readFileSync(new URL(relPath, base), 'utf8')) as T;
}
