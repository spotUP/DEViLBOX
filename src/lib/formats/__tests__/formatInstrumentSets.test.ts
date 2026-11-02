/**
 * N14: the per-format instrument sets. Every New Song template is parsed with the
 * product parser; the song's formatId must resolve to its descriptor and every
 * instrument the parser produced must be inside that descriptor's allowed set.
 */
import { describe, it, expect } from 'vitest';
import { listNewSongFormats, getEditableFormat, allowedSynthTypes, isSynthAllowed, lockFormatId } from '@lib/formats/EditableFormatRegistry';
import '@lib/formats/EditableFormatRegistry.builtins';
import { parseAs, readFixture } from '@lib/export/__tests__/exporterHarness.shared';

describe('allowedSynthTypes / isSynthAllowed', () => {
  it('sample-only format holds samplers only', () => {
    expect(allowedSynthTypes('mod')).toEqual(['Sampler', 'Player']);
    expect(isSynthAllowed('mod', 'Sampler')).toBe(true);
    expect(isSynthAllowed('mod', 'TB303')).toBe(false);
  });
  it('synth format holds samplers plus its own engine (a set, not one kind)', () => {
    expect(isSynthAllowed('hippelCoSo', 'HippelCoSoSynth')).toBe(true);
    expect(isSynthAllowed('hippelCoSo', 'Sampler')).toBe(true);
    expect(isSynthAllowed('hippelCoSo', 'Synth')).toBe(false);
  });
  it('generic project and unclassified formats are unlocked', () => {
    expect(isSynthAllowed(null, 'TB303')).toBe(true);
    expect(isSynthAllowed('no-such-format', 'TB303')).toBe(true);
    expect(getEditableFormat('mod')?.instruments?.allowed).toContain('Sampler');
  });
});

describe('every locked New Song template parses to instruments inside its allowed set', () => {
  const locked = listNewSongFormats().filter((f) => allowedSynthTypes(f.formatId) && f.formatId !== 'davidWhittaker'); // DW: WASM parse, covered by its own tests
  it.each(locked.map((f) => [f.formatId, f.template] as const))('%s', async (formatId, template) => {
    const song = await parseAs(template, readFixture(`public/${template}`));
    const bad = song.instruments.map((i) => i.synthType).filter((t) => !isSynthAllowed(formatId, t));
    expect([...new Set(bad)]).toEqual([]);
    expect(lockFormatId(song)).not.toBe('');
    expect(allowedSynthTypes(lockFormatId(song))).not.toBeNull();
  });
});
