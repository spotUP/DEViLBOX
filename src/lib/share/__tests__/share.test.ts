import { describe, expect, it } from 'vitest';
import { packShare, unpackShare } from '../shareContainer';
import { inlineFragment, isShareHash, parseShareHash, SHARE_URL_MAX } from '../shareLink';
import { startupPolicy } from '@lib/startup/startupPolicy';

const on = { welcomeDialogEnabled: true, welcomeJingleEnabled: true };

function noise(n: number): Uint8Array {
  const b = new Uint8Array(n);
  let x = 123456789;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; }
  return b;
}

describe('share container', () => {
  it('round-trips a song with companions', () => {
    const song = { name: 'a.mod', bytes: noise(100), companions: [{ name: 'a.smp', bytes: noise(7) }] };
    const back = unpackShare(packShare(song));
    expect(back.name).toBe('a.mod');
    expect(Array.from(back.bytes)).toEqual(Array.from(song.bytes));
    expect(back.companions).toHaveLength(1);
    expect(back.companions[0].name).toBe('a.smp');
    expect(Array.from(back.companions[0].bytes)).toEqual(Array.from(song.companions[0].bytes));
  });

  it('round-trips an empty song', () => {
    const back = unpackShare(packShare({ name: 'e.dbx', bytes: new Uint8Array(0), companions: [] }));
    expect(back.bytes.length).toBe(0);
    expect(back.companions).toHaveLength(0);
  });

  it('rejects corrupt data and a wrong version with a readable error', () => {
    expect(() => unpackShare(new Uint8Array([1, 0]))).toThrow();
    const good = packShare({ name: 'a', bytes: noise(5), companions: [] });
    good[0] = 99;
    expect(() => unpackShare(good)).toThrow(/version|supported|newer/i);
  });
});

describe('share link', () => {
  it('inline link fits at the URL limit and falls back above it', () => {
    const small = packShare({ name: 'a', bytes: noise(200), companions: [] });
    const frag = inlineFragment(small);
    expect(frag).not.toBeNull();
    expect(frag!.length).toBeLessThanOrEqual(SHARE_URL_MAX);
    const parsed = parseShareHash(`#share=${frag}`);
    expect(parsed?.mode).toBe('inline');
    if (parsed?.mode === 'inline') expect(Array.from(unpackShare(parsed.container).bytes)).toEqual(Array.from(noise(200)));
    expect(inlineFragment(packShare({ name: 'a', bytes: noise(20000), companions: [] }))).toBeNull();
  });

  it('parses stored links and ignores other hashes', () => {
    expect(parseShareHash('#share=s.AbC123xy')).toEqual({ mode: 'stored', id: 'AbC123xy' });
    expect(parseShareHash('#/_view=dj')).toBeNull();
    expect(parseShareHash('')).toBeNull();
    expect(isShareHash('#share=s.x')).toBe(true);
    expect(isShareHash('#other')).toBe(false);
  });

  it('a share hash skips the welcome dialog and jingle', () => {
    expect(startupPolicy('', on, '#share=s.AbC123xy')).toEqual({ openDialog: false, runJingle: false });
  });
});
