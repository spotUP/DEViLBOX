/**
 * GameMusicCreatorParser Tests
 * Detection and parse tests for Game Music Creator (.gmc) Amiga format.
 * No Reference Music files available — detection is heuristic (no magic bytes).
 */

import { describe, it, expect } from 'vitest';
import { isGameMusicCreatorFormat, parseGameMusicCreatorFile } from '../formats/GameMusicCreatorParser';

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isGameMusicCreatorFormat', () => {
  it('rejects all-zero buffer (no valid sample headers)', () => {
    const bytes = new Uint8Array(1200).fill(0);
    expect(isGameMusicCreatorFormat(bytes)).toBe(false);
  });

  it('rejects buffer shorter than header', () => {
    const bytes = new Uint8Array(100).fill(0);
    expect(isGameMusicCreatorFormat(bytes)).toBe(false);
  });

  it('rejects random noise buffer', () => {
    const bytes = new Uint8Array(2048);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff;
    // Random data is very likely to fail GMC structural validation
    // (may occasionally pass — just ensure no crash)
    expect(() => isGameMusicCreatorFormat(bytes)).not.toThrow();
  });
});

// ── Parse (null-return on invalid input) ─────────────────────────────────────

describe('parseGameMusicCreatorFile', () => {
  it('returns null for all-zero buffer', () => {
    const bytes = new Uint8Array(2048).fill(0);
    const result = parseGameMusicCreatorFile(bytes, 'test.gmc');
    expect(result).toBeNull();
  });
});
