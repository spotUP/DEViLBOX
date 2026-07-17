/**
 * Contract test: extensionless SunTronic V1.3 songs must load, not fall through
 * to "Unsupported song format".
 *
 * BUG: Four independent NAME-based gates rejected loadable songs before any
 * content routing ran. `loadSongFile` (UnifiedFileLoader.ts) was the live one
 * the user hit: `paradroid.1`, `paradroid.final`, `newest_play`, `mule.10`,
 * `tank` and every other V1.3 "Delirium" rip ships WITHOUT a recognised
 * extension, so `isSupportedModule(filename)` returned false and the function
 * returned `Unsupported song format: <name>` — even though the DELIRIUM header
 * magic is unambiguous and the native engine can play it.
 *
 * FIX: before that reject, `loadSongFile` sniffs the header via
 * `isSupportedByHeader` and, on a match, imports DIRECTLY through the canonical
 * apply path (`importTrackerModule` → parseModuleToSong → native engine),
 * bypassing the name-gated import dialog.
 *
 * This pins the wiring at the source level (the loader touches the Tone engine
 * and ~8 stores, so it can't be booted headlessly — same reason
 * preloadRace.contract.test.ts reads the source). Reverting the header fallback
 * strands every extensionless V1.3 song and this fails.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SunTronic header-detected load (contract)', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../UnifiedFileLoader.ts'),
    'utf-8',
  );
  const lines = source.split('\n');

  it('loadSongFile sniffs the header before returning "Unsupported song format"', () => {
    const rejectIdx = lines.findIndex((l) => l.includes('Unsupported song format:'));
    expect(rejectIdx).toBeGreaterThan(-1);

    // The header fallback must live in the ~40 lines immediately before the
    // reject and must route through the canonical apply path.
    const window = lines.slice(Math.max(0, rejectIdx - 40), rejectIdx).join('\n');
    expect(window).toContain('isSupportedByHeader');
    expect(window).toContain('importTrackerModule(');
  });
});
