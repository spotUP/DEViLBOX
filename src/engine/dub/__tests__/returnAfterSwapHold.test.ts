/**
 * The dub bus return lands where the bus is when an echo-engine swap's hold ends,
 * and Auto Dub gets its starting sends when a song loads under it.
 *
 * Owner, 2026-09-30: "i still hear almost none of the dub moves and dub bus
 * stuff". Measured: the bus enabled and fed, returnGainNode 0 against a stored
 * 0.9. At boot the bus swaps to the saved echo engine while still off; the swap
 * scheduled its return ramp with THAT state (0); the enable arrived during the
 * hold and the replayed settings did not touch an unchanged returnGain. And
 * Auto Dub's sends were seeded only by a click in its panel, so after a reload
 * the performer worked from whatever the song carried.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('dub bus after a swap hold', () => {
  it('the hold end ramps the return to the current target, unless a move owns it', () => {
    const bus = src('engine/dub/DubBus.ts');
    expect(bus).toMatch(/_returnGainTarget\(\): number \{\n\s*return this\.enabled && !this\._draining \? this\.settings\.returnGain : 0;/);
    const hold = bus.slice(bus.indexOf('this._muteHoldActive = false;\n          // The return'), bus.indexOf('// Replay any settings that were suppressed during the hold'));
    expect(hold).toContain("if (!this._ownedSettingKeys.has('returnGain'))");
    expect(hold).toContain('this.return_.gain.linearRampToValueAtTime(this._returnGainTarget(), t + RAMP_SEC);');
  });

  it('a song loaded while Auto Dub runs gets its starting sends', () => {
    expect(src('lib/song/applySong.ts')).toMatch(/if \(isAutoDubRunning\(\)\) \(await import\('@\/lib\/dub\/seedAutoDubSends'\)\)\.seedAutoDubSends\(\);/);
  });
});
