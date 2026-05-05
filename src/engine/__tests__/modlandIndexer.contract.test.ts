import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, '..', relPath), 'utf8');
}

describe('modland indexing contracts', () => {
  it('uses DEViLBOX filename support detection instead of only the stale folder whitelist', () => {
    const source = read('server/src/services/modlandIndexer.ts');
    expect(source).toContain("import('../../../src/lib/import/FormatRegistry.ts')");
    expect(source).toContain('isSupportedModlandFilename = mod.isSupportedFormat;');
    expect(source).toContain('if (!mappedExt && !isSupportedModlandFilename?.(lowerFilename)) return null;');
    expect(source).toContain('const ext = mappedExt ?? path.extname(lowerFilename).slice(1);');
  });

  it('forces a fresh index when the matching logic version changes', () => {
    const source = read('server/src/services/modlandIndexer.ts');
    expect(source).toContain("const MODLAND_INDEX_SCHEMA_VERSION = '2';");
    expect(source).toContain("const schemaVersion = getMeta('index_schema_version');");
    expect(source).toContain("if (hours < 24 && schemaVersion === MODLAND_INDEX_SCHEMA_VERSION) {");
    expect(source).toContain("setMeta('index_schema_version', MODLAND_INDEX_SCHEMA_VERSION);");
  });
});
