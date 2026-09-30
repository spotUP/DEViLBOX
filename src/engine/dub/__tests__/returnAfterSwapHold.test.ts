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

  it('setSettings writes the return with _settle, clearing ramps scheduled earlier for later', () => {
    // At boot the audio clock is frozen: a swap's / splice's restore ramps sit
    // in its future and outlived a bare setTargetAtTime - the return stayed 0.
    expect(src('engine/dub/DubBus.ts')).toContain('this._settle(this.return_.gain, this.enabled ? merged.returnGain : 0, now, 0.02);');
  });

  it('the siren reaches the return directly and at the level it is asked for', () => {
    // Measured 2026-09-30: siren alone at the master -44.9 dBFS rms (the music
    // plays ~-24): only through the echo/spring, and the synth 7.7 dB under
    // the generated peak. After: -26.8 dBFS.
    const bus = src('engine/dub/DubBus.ts');
    expect(bus).toContain('this._sirenLevelGain.connect(this.return_ as unknown as AudioNode);');
    expect(bus).toContain("const peak = generatedPeak('siren') / SIREN_SYNTH_PEAK;");
  });
});
