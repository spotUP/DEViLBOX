/**
 * test-parser.ts — Validate Furnace .fur file parsing
 *
 * Loads each .fur file through our parser and reports successes/failures.
 *
 * Usage:
 *   npx tsx tools/furnace-audit/test-parser.ts [category]
 *   npx tsx tools/furnace-audit/test-parser.ts gameboy
 *   npx tsx tools/furnace-audit/test-parser.ts          # all demos
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Import the parser
import { parseFurnaceSong, type FurnaceModule } from '../../src/lib/import/formats/FurnaceSongParser';

const DEMOS_DIR = '/Users/spot/Code/Reference Code/furnace-master/demos';

function findFurFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFurFiles(fullPath));
    } else if (entry.name.endsWith('.fur')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

interface ParseResult {
  file: string;
  success: boolean;
  error?: string;
  channels?: number;
  patterns?: number;
  instruments?: number;
  samples?: number;
  version?: number;
  systems?: string[];
}

async function testFile(furPath: string): Promise<ParseResult> {
  const relPath = relative(DEMOS_DIR, furPath);
  try {
    const buffer = readFileSync(furPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const song = await parseFurnaceSong(arrayBuffer);

    const sub = song.subsongs[0];
    return {
      file: relPath,
      success: true,
      channels: sub?.channels?.length ?? 0,
      patterns: sub?.patterns?.length ?? 0,
      instruments: song.instruments?.length ?? 0,
      samples: song.samples?.length ?? 0,
      version: song.version ?? 0,
      systems: song.systems?.map(s => String(s)) ?? [],
    };
  } catch (e) {
    return {
      file: relPath,
      success: false,
      error: (e as Error).message,
    };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filter = process.argv[2] || '';
  let searchDir = DEMOS_DIR;

  if (filter) {
    const filterPath = join(DEMOS_DIR, filter);
    try {
      if (statSync(filterPath).isDirectory()) {
        searchDir = filterPath;
      } else if (statSync(filterPath).isFile()) {
        const result = await testFile(filterPath);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      }
    } catch {
      console.error(`Not found: ${filterPath}`);
      process.exit(1);
    }
  }

  const files = findFurFiles(searchDir);
  console.log(`Testing ${files.length} .fur files from ${relative(DEMOS_DIR, searchDir) || 'all categories'}...\n`);

  const results: ParseResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const furPath of files) {
    const result = await testFile(furPath);
    results.push(result);

    if (result.success) {
      passed++;
      console.log(`  PASS  ${result.file} (${result.channels}ch, ${result.patterns}pat, ${result.instruments}ins, ${result.samples}smp)`);
    } else {
      failed++;
      console.log(`  FAIL  ${result.file}: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`  PARSER TEST: ${passed} PASS / ${failed} FAIL / ${files.length} TOTAL`);
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('\nFailed files:');
    for (const r of results.filter(r => !r.success)) {
      console.log(`  ${r.file}: ${r.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
