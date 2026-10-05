/**
 * The parser must not import the file loader. parseModuleToSong pulled in
 * UnifiedFileLoader to read one extension list, and with it the app's
 * largest module graph: a cold parse spent 30-40 s importing, and the push
 * gate timed out on it (2026-10-05). The loader imports the parser, never the
 * other way round.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src/lib/import');

describe('import layering', () => {
  it('parseModuleToSong and the format router do not import UnifiedFileLoader', () => {
    for (const f of ['parseModuleToSong.ts', 'parsers/AmigaFormatParsers.ts', 'parsers/UADEPrefixParsers.ts', 'parsers/ChipDumpParsers.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).not.toMatch(/['"]@lib\/file\/UnifiedFileLoader['"]|lib\/file\/UnifiedFileLoader['"]/);
    }
  });
});
