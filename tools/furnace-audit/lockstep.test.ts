/**
 * Lock-step regression tests for Furnace playback.
 *
 * Runs the existing compare-cmds.ts harness against a handful of
 * real upstream demo files, parses the "N/M ticks match" summary, and
 * fails if any fixture drops below the per-chip match threshold.
 *
 * This is the authoritative way to compare DEViLBOX's Furnace WASM
 * sequencer against upstream Furnace's output (see CLAUDE.md §
 * "Lock-Step Command Debugging"). WAV comparison is deliberately
 * NOT used — per memory/feedback_no_wav_testing.md.
 *
 * ── Prerequisites (skipped cleanly if absent) ─────────────────────────
 *   1. Upstream Furnace headless CLI at the path below.
 *   2. `third-party/furnace-master/` submodule initialised (for demos).
 *
 * Running in CI is NOT supported — both prerequisites are local to the
 * DEViLBOX author's environment today. The nightly workflow will pick
 * this up once self-hosted infra is wired (see .github/workflows/nightly.yml).
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FURNACE_CLI = '/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace';
const DEMO_ROOT = resolve(REPO_ROOT, 'third-party/furnace-master/demos');
const COMPARE = resolve(REPO_ROOT, 'tools/furnace-audit/compare-cmds.ts');

interface Fixture {
  /** Short ID for the test name. */
  id: string;
  /** Path relative to the furnace demos root. */
  rel: string;
  /** Minimum ticks-matched ratio we accept. 100 % = no regression. */
  minMatchRatio: number;
}

/**
 * Tiny representative demos, one per chip family known to match at 100 %
 * upstream per MEMORY.md (§ "Lock-step results 2026-03-22"). Keep this
 * list small — each comparison shells out to two renderers.
 */
const FIXTURES: Fixture[] = [
  { id: 'AY-3-8910 — vibe_zone',    rel: 'ay8910/vibe_zone.fur',                   minMatchRatio: 0.98 },
  { id: 'AY-3-8910 — AyMate',       rel: 'ay8910/AyMate.fur',                       minMatchRatio: 0.98 },
  { id: 'NES — smashtv',            rel: 'nes/smashtv.fur',                          minMatchRatio: 0.98 },
  { id: 'MISC — firetrucking PV1000', rel: 'misc/firetrucking_PV1000.fur',           minMatchRatio: 0.98 },
];

// Evaluate at module load — `it.runIf` reads this at collect time, before
// `beforeAll` would run.
function checkPrereqs(): { ok: boolean; reason: string } {
  if (!existsSync(FURNACE_CLI)) {
    return { ok: false, reason: `Furnace CLI missing at ${FURNACE_CLI}` };
  }
  if (!existsSync(DEMO_ROOT)) {
    return { ok: false, reason: `Furnace demos missing — did you init the submodule? (${DEMO_ROOT})` };
  }
  if (!existsSync(COMPARE)) {
    return { ok: false, reason: `compare-cmds.ts missing at ${COMPARE}` };
  }
  return { ok: true, reason: '' };
}

const { ok: prereqsOk, reason: prereqsReason } = checkPrereqs();
if (!prereqsOk) {
  // Print once per run so the skip is loud — users see WHY the suite
  // skipped, not just that it did.
  console.warn(`[furnace-lockstep] skipping whole suite: ${prereqsReason}`);
}

function parseMatchRatio(output: string): { matched: number; total: number } | null {
  const m = output.match(/(\d+)\s*\/\s*(\d+)\s+ticks match perfectly/);
  if (!m) return null;
  return { matched: Number(m[1]), total: Number(m[2]) };
}

describe('Furnace lock-step — compare-cmds against upstream CLI', () => {
  for (const fixture of FIXTURES) {
    it.runIf(prereqsOk)(
      `${fixture.id} matches >= ${(fixture.minMatchRatio * 100).toFixed(0)}% of ticks`,
      () => {
        const songPath = resolve(DEMO_ROOT, fixture.rel);
        if (!existsSync(songPath)) {
          console.warn(`[furnace-lockstep] fixture not present: ${songPath} — skipping`);
          return;
        }
        const output = execSync(
          `npx tsx "${COMPARE}" --song "${songPath}"`,
          { encoding: 'utf-8', cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const stats = parseMatchRatio(output);
        expect(stats, `could not parse match summary from compare-cmds output:\n${output}`).not.toBeNull();
        const ratio = stats!.matched / Math.max(1, stats!.total);
        expect(
          ratio,
          `${fixture.id}: ${stats!.matched}/${stats!.total} ticks matched (${(ratio * 100).toFixed(2)}%) — below threshold`,
        ).toBeGreaterThanOrEqual(fixture.minMatchRatio);
      },
    );
  }
});
