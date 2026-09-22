import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The low-band weight stage is REACHED by the BASS control.
 *
 * A DubBus cannot be constructed under happy-dom (no AudioWorklet registry),
 * so the graph is pinned at the source: the band is built, wired in parallel
 * to the shelf, summed before the punch, and driven from the same method that
 * writes the shelf. `lowBandWeight.test.ts` covers the mapping itself.
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

describe('the low-band weight stage', () => {
  it('branches off the same point as the shelf and sums before the punch', () => {
    expect(source).toContain('this.masterHpf.connect(this.masterBassShelf);');
    expect(source).toContain('this.masterHpf.connect(this.lowBandLp);');
    expect(source).toContain('this.lowBandGain.connect(this.masterBassPunch);');
  });

  it('runs low-pass -> drive -> saturator -> compressor -> gain', () => {
    const order = [
      'this.lowBandLp.connect(this.lowBandDrive);',
      'this.lowBandDrive.connect(this.lowBandSat);',
      'this.lowBandSat.connect(this.lowBandComp);',
      'this.lowBandComp.connect(this.lowBandGain);',
    ];
    let last = -1;
    for (const edge of order) {
      const i = source.indexOf(edge);
      expect(i, edge).toBeGreaterThan(last);
      last = i;
    }
  });

  it('uses a 2nd-order low-pass, because the band is summed in parallel', () => {
    // An LR4 is 180 degrees at the corner and cancels the band it adds.
    expect(source).toContain('this.lowBandLp.Q.value = Math.SQRT1_2;');
  });

  it('is driven from the master tone method, off the BASS control', () => {
    const body = methodBody('private _applyMasterInsertTone(');
    expect(body).toContain('this._resolveMasterLowEnd(safeBassGain, m)');
    expect(methodBody('private _resolveMasterLowEnd(')).toContain('lowBandWeightFor(safeBassGain)');
    expect(body).toContain('this.lowBandDrive.gain, weight.drive');
    expect(body).toContain("this.lowBandGain.gain, masterActive ? weight.gain : 0");
    // Corner follows the shelf so both lift the same band.
    expect(body).toContain('this.lowBandLp.frequency, m.bassShelfFreqHz');
  });

  it('is silenced with the rest of the master tone when the insert comes out', () => {
    const i = source.indexOf('rampBiquadParam(this.masterBassPunch.gain, 0, now);');
    expect(i).toBeGreaterThan(-1);
    expect(source.slice(i, i + 200)).toContain('this._settle(this.lowBandGain.gain, 0, now, 0.02);');
  });

  it('starts silent, so an unwired insert adds nothing', () => {
    expect(source).toContain('this.lowBandGain.gain.value = 0;');
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

  it('charges the band\'s peak as well as the two shelves', () => {
    const body = methodBody('private _resolveMasterLowEnd(');
    expect(body).toContain('20 * Math.log10(1 + weight.gain)');
    expect(body).toContain('costDb: safeBassGain + safeMasterPunch + bandAddDb');
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
    expect(watch).toContain('this._applyMasterTrim(this.settings, this.context.currentTime)');
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
    expect(join).toContain('this.returnSum.connect(this.masterSafetyClip)');
    // The clipper sits after the band sum and before the scoop/width stages,
    // so the return still gets the clipper, the scoop and the width.
    expect(source).toContain('this.lowBandGain.connect(this.masterBassPunch);');
    expect(source).toContain('this.masterBassPunch.connect(this.masterSafetyClip);');
    expect(source).toContain('this.masterSafetyClip.connect(this.masterMidScoop);');
    const wire = methodBody('async wireMasterInsert(');
    expect(wire).toContain('this._joinReturnAtInsert();');
  });

  it('goes back to the master whenever the direct path is restored', () => {
    const restore = methodBody('private _restoreMasterInsertPassthrough(');
    expect(restore).toContain('this._joinReturnAtMaster();');
    const back = methodBody('private _joinReturnAtMaster(');
    expect(back).toContain('this.returnSum.disconnect(this.masterSafetyClip)');
    expect(back).toContain('this.returnSum.connect(this.master)');
  });
});
