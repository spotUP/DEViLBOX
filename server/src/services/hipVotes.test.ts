import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createHipVoteTables } from '../db/database';
import { createHipVoteService, HipVoteError } from './hipVotes';

const T1 = 'a'.repeat(32);
const T2 = 'b'.repeat(32);
const KEY = '0123456789ab';

function make(opts: Parameters<typeof createHipVoteService>[0] = {}) {
  const db = new Database(':memory:');
  createHipVoteTables(db);
  let t = 1_000_000;
  const svc = createHipVoteService({ db, now: () => t, ...opts });
  return { db, svc, advance: (ms: number) => { t += ms; } };
}

describe('hip votes service', () => {
  it('sets a like idempotently, counts per token and removes with r=0', () => {
    const { svc, db } = make();
    expect(svc.vote({ token: T1, key: KEY, rating: 5, name: 'a.mod', player: 'ProTracker', ip: '1' })).toEqual({ count: 1, yours: 5 });
    expect(svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' })).toEqual({ count: 1, yours: 5 });
    expect(svc.vote({ token: T2, key: KEY, rating: 5, ip: '2' })).toEqual({ count: 2, yours: 5 });
    expect(svc.read(KEY, T1)).toEqual({ count: 2, yours: 5 });
    expect(svc.read(KEY)).toEqual({ count: 2, yours: 0 });
    expect(svc.vote({ token: T1, key: KEY, rating: 0, ip: '1' })).toEqual({ count: 1, yours: 0 });
    expect(svc.vote({ token: T1, key: KEY, rating: 0, ip: '1' })).toEqual({ count: 1, yours: 0 });
    expect(db.prepare('SELECT name, player FROM hip_module_names').all()).toEqual([{ name: 'a.mod', player: 'ProTracker' }]);
  });

  it('stores only a hash of the token', () => {
    const { svc, db } = make();
    svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' });
    const rows = JSON.stringify([db.prepare('SELECT * FROM hip_tokens').all(), db.prepare('SELECT * FROM hip_votes').all()]);
    expect(rows).not.toContain(T1);
  });

  it('counts only ratings >= 4', () => {
    const { svc, db } = make();
    svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' });
    db.prepare("UPDATE hip_votes SET rating = 3").run();
    expect(svc.read(KEY, T1)).toEqual({ count: 0, yours: 0 });
  });

  it('limits votes to 60 per hour per token and recovers', () => {
    const { svc, advance } = make();
    for (let i = 0; i < 60; i++) svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' });
    expect(() => svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' })).toThrow(HipVoteError);
    advance(3600_001);
    expect(svc.vote({ token: T1, key: KEY, rating: 5, ip: '1' }).yours).toBe(5);
  });

  it('limits votes to 300 per hour per IP', () => {
    const { svc } = make({ newTokensPerIpPerDay: 10_000 });
    for (let i = 0; i < 300; i++) svc.vote({ token: i.toString(16).padStart(32, '0'), key: KEY, rating: 5, ip: '9' });
    expect(() => svc.vote({ token: 'f'.repeat(32), key: KEY, rating: 5, ip: '9' })).toThrow(/rate/);
    expect(svc.vote({ token: 'f'.repeat(32), key: KEY, rating: 5, ip: '8' }).yours).toBe(5);
  });

  it('limits new tokens to 20 per day per IP', () => {
    const { svc, advance } = make();
    for (let i = 0; i < 20; i++) svc.vote({ token: i.toString(16).padStart(32, '0'), key: KEY, rating: 5, ip: '9' });
    expect(() => svc.vote({ token: 'e'.repeat(32), key: KEY, rating: 5, ip: '9' })).toThrow(/rate/);
    // a known token still works
    expect(svc.vote({ token: '0'.padStart(32, '0'), key: KEY, rating: 5, ip: '9' }).yours).toBe(5);
    advance(24 * 3600_000 + 1);
    expect(svc.vote({ token: 'e'.repeat(32), key: KEY, rating: 5, ip: '9' }).yours).toBe(5);
  });
});
