/**
 * A mute that outlives the move that applied it.
 *
 * Measured live on 2026-09-21 while chasing "the music is mutet for a pattern
 * or two and only effects fire": channels 0-3 sat `muted: true` with NO
 * transient open on any of them. Both existing rescues — `releaseAll` and
 * `reapOrphans` — walk OPEN transients, so a mute that escaped its transient
 * was invisible to both. Nothing in the registry could even say the mute had
 * been ours.
 *
 * The registry therefore records WHOSE a mute is, and reports the ones with no
 * owner left. It records the claim only; the value stays in the store, because
 * a remembered copy of a live value is the exact divergence this file exists
 * to prevent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DubSendBaselines } from '../channelSendBaseline';

/** A live-store stand-in: which channels are muted right now. */
const mutedNow = (...ids: number[]) => (id: number) => ids.includes(id);

describe('a move mute with nothing holding it', () => {
  it('is quiet while a transient is still holding the channel', () => {
    const b = new DubSendBaselines();
    b.begin(2, { dubSend: 0, muted: false });
    b.noteMoveMute(2, true);
    // The mute has an owner and an end. Nothing to report.
    expect(b.strandedMoveMutes(mutedNow(2))).toEqual([]);
  });

  it('reports a move mute that no transient ever covered', () => {
    // The live shape: muted by a move, depth zero, nothing able to restore it.
    // A mute applied outside a begin/end pair, or one that survived its own
    // restore because the baseline had already absorbed a previous leak.
    const b = new DubSendBaselines();
    b.noteMoveMute(2, true);
    expect(b.strandedMoveMutes(mutedNow(2))).toEqual([2]);
  });

  it('says nothing about a channel the user muted', () => {
    const b = new DubSendBaselines();
    b.noteUserMute(4, true);
    expect(b.strandedMoveMutes(mutedNow(4))).toEqual([]);
  });

  it('hands the mute back to the user the moment the user touches it', () => {
    const b = new DubSendBaselines();
    b.noteMoveMute(1, true);
    expect(b.strandedMoveMutes(mutedNow(1))).toEqual([1]);
    b.noteUserMute(1, true);          // user mutes it deliberately
    expect(b.strandedMoveMutes(mutedNow(1))).toEqual([]);
  });

  it('does not report a mute the move already lifted', () => {
    const b = new DubSendBaselines();
    b.noteMoveMute(0, true);
    b.noteMoveMute(0, false);
    expect(b.strandedMoveMutes(mutedNow())).toEqual([]);
  });

  it('reads the live store rather than a remembered value', () => {
    // The channel was unmuted by something else — a panic, the user, a reload.
    // Nothing is wrong any more, so nothing is reported.
    const b = new DubSendBaselines();
    b.noteMoveMute(5, true);
    expect(b.strandedMoveMutes(mutedNow())).toEqual([]);
  });

  it('drops the claim when the transient closes normally', () => {
    const b = new DubSendBaselines();
    b.begin(3, { dubSend: 0.2, muted: false });
    b.noteMoveMute(3, true);
    expect(b.end(3)).toEqual({ dubSend: 0.2, muted: false });
    expect(b.strandedMoveMutes(mutedNow(3))).toEqual([]);
  });

  it('survives the restore of a channel the user had ALREADY muted', () => {
    // The trap: `endDubTransient` restores through a transient write, which
    // would re-claim the mute as the move's. A user mute would then be
    // reported stranded and unmuted by the watchdog — a repair that breaks the
    // state it is guarding.
    const b = new DubSendBaselines();
    b.begin(6, { dubSend: 0, muted: true });     // user had it muted
    b.noteMoveMute(6, true);
    const baseline = b.end(6);
    expect(baseline).toEqual({ dubSend: 0, muted: true });
    b.noteMoveMute(6, baseline!.muted);          // what the restore write does
    b.clearMoveMute(6);                          // what endDubTransient adds
    expect(b.strandedMoveMutes(mutedNow(6))).toEqual([]);
  });

  it('forgets every claim when everything is released', () => {
    const b = new DubSendBaselines();
    b.noteMoveMute(1, true);
    b.releaseAll();
    expect(b.strandedMoveMutes(mutedNow(1))).toEqual([]);
  });

  it('reports several stranded channels in channel order', () => {
    const b = new DubSendBaselines();
    for (const id of [3, 0, 2, 1]) b.noteMoveMute(id, true);
    // The shape actually measured live.
    expect(b.strandedMoveMutes(mutedNow(0, 1, 2, 3))).toEqual([0, 1, 2, 3]);
  });
});

/**
 * One reachability test: the report exists only if something calls it.
 *
 * A registry nothing consults is the same as no registry, and the previous
 * attempt at this feature was described in a commit message without ever
 * reaching the code at all.
 */
describe('the report is wired to the performer', () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', '..', ...p), 'utf8');
  const autoDub = read('engine', 'dub', 'AutoDub.ts');
  const transient = read('lib', 'dub', 'dubChannelTransient.ts');
  const mixer = read('stores', 'useMixerStore.ts');

  it('claims the mute on every move write, and only on move writes', () => {
    expect(mixer).toMatch(/if \(opts\?\.transient\) dubSendBaselines\.noteMoveMute\(ch, muted\)/);
    expect(mixer).toMatch(/else dubSendBaselines\.noteUserMute\(ch, muted\)/);
  });

  it('frees stranded mutes on the same bar tick that reaps orphans', () => {
    expect(autoDub).toContain('releaseStrandedDubMutes()');
    const tick = autoDub.match(/reapOrphanedDubTransients\(\);[\s\S]{0,400}?_lastBar = bar;/);
    expect(tick, 'bar tick block not found').not.toBeNull();
    expect(tick![0]).toContain('releaseStrandedDubMutes()');
  });

  it('puts the stranded channels in the diagnostics the fire log carries', () => {
    expect(autoDub).toMatch(/diag\.strandedMutes = /);
  });

  it('hands the claim back after every restore, so a user mute is never reaped', () => {
    // Three restore sites: end, release-all, reap. Each must drop the claim
    // that its own transient write just re-created.
    expect((transient.match(/clearMoveMute\(channelId\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(3);
  });
});
