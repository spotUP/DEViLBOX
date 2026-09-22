/**
 * Nothing reads the pattern-granular row on its own.
 *
 * `currentGlobalRow` is only written when the PATTERN or song position changes
 * (`usePatternPlayback`, deliberately — per-row store writes were avoided
 * because the editor's RAF loop reads position directly). Alone it is stale by
 * up to a whole pattern, and every consumer that used it alone was wrong in a
 * different way:
 *
 *   the bar clock       → the performer got one decision per pattern
 *   `buildCycleInput`   → onset lookahead searched the wrong rows, so ACCENT
 *                         never matched and every bar rested
 *   `getPhrasePosition` → the phrase arc froze wherever the last pattern
 *                         change left it
 *   `riddimSection`     → the skank's return landed off its musical boundary
 *   `versionDrop`       → the drop planned its return against the wrong grid
 *
 * Five readers, five bugs, one cause — and they surfaced one at a time over a
 * day. This is the guard that makes the sixth impossible: any new consumer must
 * go through `resolveTransportRow`, which joins the coarse field with the
 * per-row one.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Files allowed to name the raw field, with the reason.
 *
 * Anything else reading it is the bug this test exists for.
 */
const ALLOWED = new Map<string, string>([
  ['src/stores/useTransportStore.ts', 'owns the field'],
  ['src/hooks/audio/usePatternPlayback.ts', 'writes it'],
  ['src/lib/dub/transportRow.ts', 'joins it with the per-row field'],
  ['src/bridge/handlers/readHandlers.ts', 'reports raw transport state for diagnostics'],
  // Names it only to hand it to `resolveTransportRow`; the row it RECORDS is
  // the resolved one. A pattern-granular row here would misreport the one
  // thing this snapshot exists to capture — where in the song the sound
  // stopped.
  ['src/bridge/diagnostics/silenceSnapshot.ts', 'passes it to resolveTransportRow'],
]);

describe('the transport row has one reader', () => {
  it('no consumer reads currentGlobalRow directly', () => {
    let hits: string[];
    try {
      hits = execSync(
        'git grep -n "currentGlobalRow" -- "src/*.ts" "src/*.tsx"',
        { cwd: ROOT, encoding: 'utf8' },
      ).trim().split('\n').filter(Boolean);
    } catch {
      hits = [];
    }

    const offenders = hits.filter(line => {
      const file = line.slice(0, line.indexOf(':'));
      if (ALLOWED.has(file)) return false;
      if (file.includes('__tests__')) return false;
      const code = line.slice(line.indexOf(':', line.indexOf(':') + 1) + 1);
      // A comment explaining the trap is fine; reading the field is not.
      if (/^\s*(\*|\/\/)/.test(code)) return false;
      // Naming it in a parameter type is how the value is PASSED to
      // `resolveTransportRow`, not a direct read.
      if (/currentGlobalRow\?:\s*number/.test(code)) return false;
      // The join itself.
      if (/resolveTransportRow\(/.test(code)) return false;
      return true;
    });

    expect(
      offenders,
      'These read the pattern-granular row directly, so they are stale by up to '
      + 'a whole pattern. Use `resolveTransportRow(globalRow, currentRow)`.',
    ).toEqual([]);
  });

  it('every dub consumer that needs a row uses the join', () => {
    const users = [
      'src/engine/dub/AutoDub.ts',
      'src/engine/dub/moves/riddimSection.ts',
      'src/engine/dub/moves/versionDrop.ts',
    ];
    for (const rel of users) {
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      expect(src, rel).toContain('resolveTransportRow(');
    }
  });

  it('AutoDub joins it everywhere it needs a row, not just in the clock', () => {
    // Bar clock, cycle input, phrase position — the three that were wrong.
    const src = readFileSync(resolve(ROOT, 'src/engine/dub/AutoDub.ts'), 'utf8');
    const uses = src.match(/resolveTransportRow\(/g) ?? [];
    expect(uses.length).toBe(3);
  });
});
