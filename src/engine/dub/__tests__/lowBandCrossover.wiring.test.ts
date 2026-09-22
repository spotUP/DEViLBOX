import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The BASS crossover is REACHED by the BASS control.
 *
 * A DubBus cannot be constructed under happy-dom (no AudioWorklet registry),
 * so the graph is pinned at the source: the crossover is built, the low band
 * lifted and saturated, the sum fed to the punch, and driven from the master
 * tone method. `lowBandCrossover.test.ts` covers the mapping itself.
 */

const source = readFileSync(join(process.cwd(), 'src/engine/dub/DubBus.ts'), 'utf-8');

function methodBody(signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `method not found: ${signature}`).toBeGreaterThan(-1);
  const next = source.indexOf('\n  private ', start + signature.length);
  const nextPublic = source.indexOf('\n  }\n\n  ', start + signature.length);
  const end = Math.min(...[next, nextPublic].filter(i => i > -1));
  return source.slice(start, end);
}

describe('the BASS crossover', () => {
  // Linear lift raised the low band's peaks by the dB it added; at a fixed
  // ceiling only ~1.5 of 12 dB fit with the mids untouched (2026-09-22).
  it('splits the master with an LR4 at the corner, both bands into one sum', () => {
    expect(source).toContain('this.masterHpf.connect(this.xoLowA);');
    expect(source).toContain('this.xoLowA.connect(this.xoLowB);');
    expect(source).toContain('this.masterHpf.connect(this.xoHighA);');
    expect(source).toContain('this.xoHighA.connect(this.xoHighB);');
    expect(source).toContain('this.xoHighB.connect(this.lowSum);');
    expect(source).toContain('this.lowOut.connect(this.lowSum);');
    expect(source).toContain('f.Q.value = Math.SQRT1_2;');
  });

  it('lifts and saturates the low band only: drive -> fixed curve -> ceiling', () => {
    expect(source).toContain('this.xoLowB.connect(this.lowDrive);');
    expect(source).toContain('this.lowDrive.connect(this.lowSat);');
    expect(source).toContain('this.lowSat.connect(this.lowOut);');
    expect(source).toContain('this.lowSat.curve = makeSoftClipCurve(8192, LOW_SAT_KNEE);');
  });

  it('feeds the sum into the punch, so the clipper sees the total', () => {
    expect(source).toContain('this.lowSum.connect(this.masterBassPunch);');
    expect(source).toContain('this.masterBassPunch.connect(this.masterLowMidDip);');
    expect(source).toContain('this.masterLowMidDip.connect(this.masterSafetyClip);');
    expect(source).toContain('this.masterSafetyClip.connect(this.masterMidScoop);');
  });

  it('is driven from the master tone method, off the ride-spent BASS', () => {
    const body = methodBody('private _applyMasterInsertTone(');
    expect(body).toContain('const { bassDb, punchDb } = this._resolveMasterLowEnd(safeBassGain, m);');
    expect(body).toContain('const low = lowBandGainsFor(bassDb);');
    expect(body).toContain('this.lowDrive.gain, masterActive ? low.drive : 1');
    expect(body).toContain('this.lowOut.gain, masterActive ? low.ceiling : 1');
    // Every crossover section follows the corner setting.
    expect(body).toContain('for (const f of [this.xoLowA, this.xoLowB, this.xoHighA, this.xoHighB])');
    // Punch spent before bass, ceiling from the REQUESTED bass.
    const resolve = methodBody('private _resolveMasterLowEnd(');
    expect(resolve).toContain('spendRide(safeBassGain, safeMasterPunch, this._trimRide.db)');
    expect(resolve).toContain('MASTER_LOW_CEILING_DB - Math.max(0, safeBassGain)');
    expect(resolve).toContain('costDb: bassDb + punchDb');
  });

  it('dips the low mids as the low end goes up — heavy but clean', () => {
    const body = methodBody('private _applyMasterInsertTone(');
    expect(body).toContain('this.masterLowMidDip.frequency, m.bassShelfFreqHz * 2');
    expect(body).toContain('this.masterLowMidDip.gain, masterActive ? lowMidDipDbFor(bassDb) : 0');
  });

  it('goes transparent, not silent, when the insert comes out', () => {
    const i = source.indexOf('rampBiquadParam(this.masterBassPunch.gain, 0, now);');
    expect(i).toBeGreaterThan(-1);
    const around = source.slice(i - 200, i + 200);
    expect(around).toContain('this._settle(this.lowDrive.gain, 1, now, 0.02);');
    expect(around).toContain('this._settle(this.lowOut.gain, 1, now, 0.02);');
    expect(around).toContain('rampBiquadParam(this.masterLowMidDip.gain, 0, now);');
  });

  it('leaves no trace of the parallel band or the shelf', () => {
    expect(source).not.toContain('lowBandGain.');
    expect(source).not.toContain('this.masterBassShelf');
    expect(source).not.toContain('lowBandWeightFor');
  });
});

describe('the trim meters the programme before the insert', () => {
  it('taps the insert source when the insert point is registered', () => {
    const body = methodBody('registerMasterInsertPoint(source: AudioNode, dest: AudioNode): void {');
    expect(body).toContain('source.connect(probe);');
    expect(body).toContain('this._preInsertProbe = probe;');
  });

  it('feeds that reading to the trim, not the post-insert reference', () => {
    const body = methodBody('private _applyMasterTrim(');
    expect(body).toContain('shelfTrimDb(costDb, this._programmeBeforeInsert())');
    expect(source).not.toContain('shelfTrimForProgramme(');
  });

  it('re-reads the trim while the insert is active, and stops when it is not', () => {
    // A slider set during a quiet passage kept its trim into the loud one —
    // "it clips/distorts" (2026-09-22).
    const wire = methodBody('async wireMasterInsert(');
    expect(wire).toContain('this._startTrimWatch();');
    const unwire = methodBody('unwireMasterInsert(): void {');
    expect(unwire).toContain('this._stopTrimWatch();');
    expect(methodBody('dispose(): void {')).toContain('this._stopTrimWatch();');
    const watch = methodBody('private _startTrimWatch(');
    expect(watch).toContain('this._applyMasterInsertTone();');
    expect(watch).toContain('if (!this.masterInsertActive || this._disposed) { this._stopTrimWatch(); return; }');
  });

  it('releases the tap on dispose', () => {
    const body = methodBody('dispose(): void {');
    expect(body).toContain('this._releasePreInsertProbe();');
  });
});

describe('the dub return skips the low-end stages', () => {
  // Echo tails came back bass-boosted and saturated with the dry mix —
  // "everything gets muddled" with AutoDub and the BASS control up.
  it('sums the return once, behind a node the splice can move', () => {
    expect(source).toContain('this.clubDry.connect(this.returnSum);');
    expect(source).toContain('this.clubWet.connect(this.returnSum);');
    expect(source).toContain('this.returnSum.connect(this.master);');
    expect(source).not.toContain('this.clubDry.connect(this.master);');
  });

  it('joins the insert at the clipper — past shelf, punch and band — while spliced', () => {
    const join = methodBody('private _joinReturnAtInsert(');
    expect(join).toContain('this.returnSum.disconnect(this.master)');
    // Through the return's own copy of the trim, so it is paid for like the dry.
    expect(join).toContain('this.returnSum.connect(this.returnTrim)');
    expect(source).toContain('this.returnTrim.connect(this.masterSafetyClip);');
    expect(methodBody('private _applyMasterTrim(')).toContain('this._settle(this.returnTrim.gain, trim * Math.pow(10, this._returnGovernor.db / 20), now, TRIM_RAMP_SEC);');
    // The clipper sits after the band sum and before the scoop/width stages,
    // so the return still gets the clipper, the scoop and the width.
    expect(source).toContain('this.lowSum.connect(this.masterBassPunch);');
    expect(source).toContain('this.masterBassPunch.connect(this.masterLowMidDip);');
    expect(source).toContain('this.masterLowMidDip.connect(this.masterSafetyClip);');
    expect(source).toContain('this.masterSafetyClip.connect(this.masterMidScoop);');
    const wire = methodBody('async wireMasterInsert(');
    expect(wire).toContain('this._joinReturnAtInsert();');
  });

  it('goes back to the master whenever the direct path is restored', () => {
    const restore = methodBody('private _restoreMasterInsertPassthrough(');
    expect(restore).toContain('this._joinReturnAtMaster();');
    const back = methodBody('private _joinReturnAtMaster(');
    expect(back).toContain('this.returnSum.disconnect(this.returnTrim)');
    expect(back).toContain('this.returnSum.connect(this.master)');
  });
});

describe('the trim is ridden from the clipper input', () => {
  // The predictive trim was short on a tune whose energy is all under the
  // corner; the clipper paid — "clips/dists" (2026-09-22).
  it('meters both clipper feeds in one analyser, over a whole tick', () => {
    expect(source).toContain('this.masterLowMidDip.connect(this._clipInProbe);');
    expect(source).toContain('this.returnTrim.connect(this._clipInProbe);');
    expect(source).toContain('this._clipInProbe.fftSize = 32768;');
  });

  it('steps the ride only from the watch, never from a settings write', () => {
    const watch = methodBody('private _startTrimWatch(');
    expect(watch).toContain('this._trimRide = rideTrim(this._trimRide, this._clipInputPeak(), this._clipReferencePeak());');
    // The reference: the same sum without the shelf — dry before the shelf
    // plus the return — so the ride answers only for what the boost adds.
    expect(source).toContain('this.masterHpf.connect(this._clipRefProbe);');
    expect(source).toContain('this.returnTrim.connect(this._clipRefProbe);');
    expect(methodBody('private _applyMasterTrim(')).not.toContain('rideTrim(');
  });

  it('adds the ride to the predicted trim, and clears it when the insert comes out', () => {
    expect(methodBody('private _applyMasterTrim(')).toContain('+ rideRemainderDb');
    expect(methodBody('private _stopTrimWatch(')).toContain('this._trimRide = RIDER_REST;');
  });
});

describe('the return is governed against the programme', () => {
  // Send 0.028 RMS, return 0.261: the echo came back louder than the song and
  // the sum clipped — "clips/dists" (2026-09-22).
  it('steps the governor from the watch, against the smoothed pre-insert programme', () => {
    const watch = methodBody('private _startTrimWatch(');
    expect(watch).toContain('this._returnGovernor = governReturn(');
    expect(watch).toContain('this._returnRms(), programme.rms, programme.valid');
    expect(watch).toContain('const programme = this._programmeBeforeInsert();');
  });

  it('applies it on the return trim only, on top of the shared trim', () => {
    const apply = methodBody('private _applyMasterTrim(');
    expect(apply).toContain('trim * Math.pow(10, this._returnGovernor.db / 20)');
    expect(apply).toContain('this._settle(this.masterToneTrim.gain, trim, now, TRIM_RAMP_SEC);');
  });

  it('clears with the watch', () => {
    expect(methodBody('private _stopTrimWatch(')).toContain('this._returnGovernor = RIDER_REST;');
  });
});

describe('the riders move like a hand on a fader', () => {
  // "it sounds very artificially sidechained" (2026-09-22): full attack per
  // tick and a fast release is a sidechain.
  it('ramps trim moves over most of a tick, not in 20 ms', () => {
    expect(source).toContain('const TRIM_RAMP_SEC = 0.08;');
    expect(methodBody('private _applyMasterTrim(')).not.toContain('now, 0.02)');
  });
});

describe('the ride spends the boost before it touches the mix', () => {
  // "the bass kills all other audio" (2026-09-22): -6 dB on everything else
  // against +6 on the lows, from a ride spent on the trim alone.
  it('takes the shelf from spendRide, and gives the trim only the remainder', () => {
    const tone = methodBody('private _applyMasterInsertTone(');
    expect(tone).toContain('this.lowDrive.gain, masterActive ? low.drive : 1');
    const trim = methodBody('private _applyMasterTrim(');
    expect(trim).toContain('const { costDb, rideRemainderDb } = this._resolveMasterLowEnd(safeBassGain, m);');
    expect(trim).not.toContain('+ this._trimRide.db');
  });
});
