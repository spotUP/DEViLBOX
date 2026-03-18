#!/usr/bin/env tsx
/**
 * wav-compare-audit.ts — Full Furnace WAV comparison audit with live tracker updates
 *
 * Pipeline:
 *   1. Render reference WAVs via Furnace CLI (render-reference.sh, skips existing)
 *   2. For each chip: render DEViLBOX WAVs (render-devilbox.ts --batch <chip>)
 *   3. Compare pairs via envelope correlation and POST results to localhost:4444
 *
 * Usage:
 *   npx tsx tools/furnace-audit/wav-compare-audit.ts [--chip <name>] [--skip-ref] [--compare-only]
 *
 * Flags:
 *   --chip <name>    Only process one chip directory (e.g. --chip gameboy)
 *   --skip-ref       Skip rendering reference WAVs (assume they exist)
 *   --compare-only   Skip all rendering, just compare existing WAVs and post
 */

import { spawnSync } from 'child_process';
import { readdirSync, existsSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { envelopeCorrelation } from './compare-wavs.js';

// ─── Config ────────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, '../..');
const DEMOS_DIR = join(PROJECT_ROOT, 'public/data/songs/furnace');
const REF_DIR = join(PROJECT_ROOT, 'test-data/furnace-ref');
const DBX_DIR = join(PROJECT_ROOT, 'test-data/furnace-devilbox');
const TRACKER_URL = 'http://localhost:4444';
const PASS_THRESHOLD = 0.90;

// ─── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const chipFilter = args.includes('--chip') ? args[args.indexOf('--chip') + 1] : null;
const skipRef = args.includes('--skip-ref');
const compareOnly = args.includes('--compare-only');

// ─── Key mapping ───────────────────────────────────────────────────────────

function fileToKey(chip: string, filename: string): string {
  const song = basename(filename, '.wav').toLowerCase().replace(/[\s\-_]/g, '');
  return `fur-${chip}-${song}`;
}

// ─── Tracker update ────────────────────────────────────────────────────────

async function postUpdate(key: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${TRACKER_URL}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: key, ...data }),
    });
  } catch {
    // Tracker not running — continue silently
  }
}

// ─── Step 1: Render reference WAVs ─────────────────────────────────────────

function renderReference(chip: string | null): void {
  const scriptPath = join(SCRIPT_DIR, 'render-reference.sh');
  const filterArg = chip ?? '';
  console.log(`\n[step 1] Rendering reference WAVs${chip ? ` (chip: ${chip})` : ''} ...`);

  const result = spawnSync('bash', [scriptPath, ...(filterArg ? [filterArg] : [])], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
  });

  if (result.status !== 0 && result.status !== null) {
    // Non-zero but not null means it ran and reported failures — that's OK (some files may fail)
    console.log(`[step 1] render-reference.sh exited with status ${result.status} (some renders may have failed)`);
  }
}

// ─── Step 2: Render DEViLBOX WAVs for one chip ─────────────────────────────

function renderDevilbox(chip: string): boolean {
  const scriptPath = join(SCRIPT_DIR, 'render-devilbox.ts');
  console.log(`\n[step 2] Rendering DEViLBOX WAVs for chip: ${chip} ...`);

  const result = spawnSync('npx', ['tsx', scriptPath, '--batch', chip], {
    stdio: 'inherit',
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  return result.status === 0 || result.status === null;
}

// ─── Step 3: Compare WAVs for one chip ─────────────────────────────────────

async function compareChip(chip: string): Promise<{ pass: number; fail: number; missing: number }> {
  const refChipDir = join(REF_DIR, chip);
  const dbxChipDir = join(DBX_DIR, chip);

  if (!existsSync(refChipDir)) {
    console.log(`  [compare] No reference dir for ${chip} — skipping`);
    return { pass: 0, fail: 0, missing: 0 };
  }

  const refWavs = existsSync(refChipDir)
    ? readdirSync(refChipDir).filter(f => f.endsWith('.wav')).sort()
    : [];

  let pass = 0, fail = 0, missing = 0;

  for (const wavFile of refWavs) {
    const key = fileToKey(chip, wavFile);
    const refPath = join(refChipDir, wavFile);
    const dbxPath = join(dbxChipDir, wavFile);
    const songName = basename(wavFile, '.wav');

    if (!existsSync(dbxPath)) {
      missing++;
      process.stdout.write(`  ${key} ... MISSING\n`);
      await postUpdate(key, {
        chip,
        song: songName,
        consoleAuditStatus: 'crashes',
        envCorr: 0,
        rmsDbDiff: null,
        notes: 'DEViLBOX render missing',
      });
      continue;
    }

    let envCorr = 0;
    let rmsDbDiff: number | null = null;
    let status: 'works' | 'crashes' = 'crashes';

    try {
      envCorr = envelopeCorrelation(refPath, dbxPath);
      status = envCorr >= PASS_THRESHOLD ? 'works' : 'crashes';
      const icon = status === 'works' ? '✓' : '✗';
      process.stdout.write(`  ${key} ... ${icon} envCorr=${envCorr.toFixed(4)}\n`);
    } catch (e) {
      process.stdout.write(`  ${key} ... ERROR: ${(e as Error).message}\n`);
    }

    if (status === 'works') pass++; else fail++;

    await postUpdate(key, {
      chip,
      song: songName,
      consoleAuditStatus: status,
      envCorr,
      rmsDbDiff,
    });
  }

  return { pass, fail, missing };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // Enumerate chips
  const allChips = readdirSync(DEMOS_DIR)
    .filter(d => statSync(join(DEMOS_DIR, d)).isDirectory())
    .filter(d => !chipFilter || d === chipFilter)
    .sort();

  console.log(`[wav-compare-audit] Chips: ${allChips.join(', ')}`);

  // Step 1: Render reference WAVs (all at once — script skips existing)
  if (!skipRef && !compareOnly) {
    renderReference(chipFilter);
  } else {
    console.log('[wav-compare-audit] Skipping reference render (--skip-ref or --compare-only)');
  }

  // Step 2+3: For each chip — render DEViLBOX then compare
  let totalPass = 0, totalFail = 0, totalMissing = 0;

  for (const chip of allChips) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[chip] ${chip}`);

    // Render DEViLBOX WAVs for this chip
    if (!compareOnly) {
      renderDevilbox(chip);
    } else {
      console.log(`[step 2] Skipping DEViLBOX render (--compare-only)`);
    }

    // Compare and post results
    const counts = await compareChip(chip);
    totalPass += counts.pass;
    totalFail += counts.fail;
    totalMissing += counts.missing;

    console.log(`  [${chip}] pass=${counts.pass} fail=${counts.fail} missing=${counts.missing}`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[done] pass=${totalPass}  fail=${totalFail}  missing=${totalMissing}`);
  console.log(`       total=${totalPass + totalFail + totalMissing}`);
}

main().catch(e => {
  console.error('[wav-compare-audit] Fatal:', e);
  process.exit(1);
});
