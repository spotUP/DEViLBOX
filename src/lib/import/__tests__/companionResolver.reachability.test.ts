import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The resolver is REACHED from every load path — one test per door.
 *
 * "Only TFMX loads, and only when both files are dropped by hand"
 * (2026-09-22): the MCP server had a rule table, the file browser a
 * four-pair table, a folder drop nothing. Each door now asks
 * `resolveCompanions`, and the old tables are gone so they cannot drift back.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('companion discovery reaches the resolver', () => {
  it('MCP load_file: lists the directory and asks the resolver; the rule table is gone', () => {
    const server = read('server/src/mcp/mcpServer.ts');
    expect(server).toContain("from '../../../src/lib/import/companionResolver.ts'");
    expect(server).toContain('const resolved = resolveCompanions(filename, listing);');
    expect(server).toContain('await listDirectoryForCompanions(dir, filename)');
    expect(server).not.toContain("['mdat.', 'smpl.'], ['smpl.', 'mdat.'],");
    expect(server).not.toContain("const suffixCompanions = ['.nt', '.as', '.l', '.n'];");
  });

  it('file browser and jukebox: one shared fetch that asks the resolver; the four-pair table is gone', () => {
    const nav = read('src/components/dialogs/useFileNavigation.ts');
    expect(nav).toContain("import { gatherCompanions } from '@lib/import/companionFetch';");
    expect(nav).not.toContain('COMPANION_PREFIXES');
    expect(nav).not.toContain('resolveCompanions(');
    const jukebox = read('src/components/jukebox/JukeboxPanel.tsx');
    expect(jukebox).toContain('await gatherCompanions(name, row.dir, bytes)');
    expect(jukebox).not.toContain('resolveCompanions(');
    const fetcher = read('src/lib/import/companionFetch.ts');
    expect(fetcher).toContain('const resolved = resolveCompanions(filename, listing);');
  });

  it('folder drop: asks the resolver over the dropped names, keeping everything only when it names nothing', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('pickCompanionsFromDrop(mainFile, companions)');
    const helpers = read('src/lib/import/companionDrop.ts');
    expect(helpers).toContain('resolveCompanions(');
    expect(helpers).toContain('listingFromRelativePaths(');
  });

  it('lone-file drop: a failed load names the file the format expects', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('expectedCompanionNames(file.name)');
  });
});
