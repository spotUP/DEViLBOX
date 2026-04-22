/**
 * Contract test: dub_siren pad action must call startSiren(), not setSirenFeedback().
 *
 * Regression guard for the bug where pressing the "Siren" pad in the drum pad
 * view produced silence because the handler only ramped echo feedback (which
 * needs existing content in the echo) instead of firing the actual siren synth.
 *
 * Fixed 2026-04-22: DUB_ACTION_HANDLERS['dub_siren'] now calls engine.startSiren().
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('dub_siren pad action', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../DubActions.ts'),
    'utf-8'
  );

  it('calls engine.startSiren(), not engine.setSirenFeedback()', () => {
    // Find the dub_siren handler block
    const sirenMatch = src.match(/dub_siren:\s*\{[^}]+\}/s);
    expect(sirenMatch).not.toBeNull();
    const block = sirenMatch![0];

    // Must call startSiren
    expect(block).toContain('startSiren');

    // Must NOT call setSirenFeedback (the old broken approach)
    expect(block).not.toContain('setSirenFeedback');
  });
});
