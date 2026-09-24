import { describe, it, expect } from 'vitest';
import { FORMAT_REGISTRY, detectFormat, isSupportedFormat } from '@/lib/import/FormatRegistry';

/**
 * The Amiga scene names the same module from either end. Both spellings live
 * side by side in one directory of the corpus: `mdat.rocknroll` next to
 * `primemover_01.hot`, `jpn.virocop-14` next to `gyroscope.mon`.
 *
 * "all formats in devilbox needs to support both extension and prefix"
 * (2026-09-24). 121 registry entries declared prefixes; 75 declared only an
 * extension and so did not answer to their own name written first — an audit
 * found 192 spellings resolving to nothing.
 */

/** Literal tokens of a simple `/\.(a|b|c)$/i` extension regex. */
function extTokens(re: RegExp | undefined): string[] {
  if (!re) return [];
  let s = re.source;
  if (!s.startsWith('\\.') || !s.endsWith('$')) return [];
  s = s.slice(2, -1);
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  const out: string[] = [];
  for (const p of s.split('|')) {
    const range = p.match(/^([a-z0-9_]*)\[(\d)-(\d)\]([a-z0-9_]*)$/i);
    if (range) {
      for (let i = Number(range[2]); i <= Number(range[3]); i++) {
        out.push(`${range[1]}${i}${range[4]}`);
      }
    } else if (/^[a-z0-9_]+$/i.test(p)) {
      out.push(p);
    }
  }
  return out;
}

describe('a format answers to its name written either way round', () => {
  it.each([
    ['mdat.rocknroll', 'rocknroll.mdat'],
    ['hot.primemover_01', 'primemover_01.hot'],
    ['mon.gyroscope', 'gyroscope.mon'],
    ['med.sadman', 'sadman.med'],
    ['jpo.offroad', 'offroad.jpo'],
    // Extension-only entries: these are the 75 that did not answer to their
    // own name written first.
    ['fur.deflemask_tune', 'deflemask_tune.fur'],
    ['xm.flo boarding - level 1', 'flo boarding - level 1.xm'],
    ['dsym.drwho_final4', 'drwho_final4.dsym'],
  ])('%s and %s are the same format', (prefixForm, extForm) => {
    const a = detectFormat(prefixForm);
    const b = detectFormat(extForm);
    expect(a, prefixForm).not.toBeNull();
    expect(b, extForm).not.toBeNull();
    expect(a!.key).toBe(b!.key);
  });

  it('reports both spellings as supported', () => {
    expect(isSupportedFormat('mdat.rocknroll')).toBe(true);
    expect(isSupportedFormat('rocknroll.mdat')).toBe(true);
  });

  it('leaves no extension token unresolvable in prefix form', () => {
    const orphans: string[] = [];
    for (const fmt of FORMAT_REGISTRY) {
      if (fmt.matchMode === 'prefix') continue;
      for (const token of extTokens(fmt.extRegex)) {
        if (detectFormat(`${token}.songname`) === null) orphans.push(`${token} (${fmt.key})`);
      }
    }
    expect(orphans, 'every extension is also a prefix').toEqual([]);
  });

  /**
   * An implicit match must never take a file from a format that asked for it
   * by name. `sun.tune` is the UADE SunTronic prefix entry; `tune.sun` is the
   * native SunTronic parser. Both are deliberate, and both must survive.
   */
  it('lets an explicit declaration win over the implicit spelling', () => {
    expect(detectFormat('sun.song')?.key).toBe('uade_sun');
    expect(detectFormat('song.sun')?.key).toBe('suntronic');
  });
});
