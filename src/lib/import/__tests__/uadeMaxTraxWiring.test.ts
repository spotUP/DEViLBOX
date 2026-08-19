/**
 * uadeMaxTraxWiring.test.ts — regressions for the UADE MaxTrax / audio.device port.
 *
 * Three defects this locks against, all found by review of the PR that committed the
 * MaxTrax eagleplayer:
 *
 *  1. Extension -> eagleplayer prefix mappings pointing at a prefix no eagleplayer
 *     declares. `mxt` mapped to `mxt`, which appears nowhere in eagleplayer.conf, so a
 *     Modland-named MaxTrax tune was renamed to a prefix UADE cannot resolve.
 *  2. `tryUADEPrefixParse` dropping companion files. Split-file formats (MaxTrax
 *     MXTX.<tune> + SMPL.<tune>, TFMX mdat/smpl) load their sample bank from a sibling
 *     file, and the prefix route never forwarded them to UADE's virtual FS.
 *  3. The 68k score and the host disagreeing about AMIGAMSG_* ids. score.s hardcodes
 *     them as `equ` constants; amigamsg.h used implicit enumerators, so inserting any
 *     enumerator above them silently re-numbered the wire protocol.
 *
 * Playback itself is covered by src/engine/uade/__tests__/maxtraxPlayback.render.test.ts,
 * which renders antmusic.mxtx through the shipped wasm — remove the `MaxTrax
 * prefixes=mxtx` line from eagleplayer.conf and that test fails with ret=-1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

const ROOT = process.cwd();
const EAGLEPLAYER_CONF = join(ROOT, 'third-party/uade-3.05/eagleplayer.conf');
const PREFIX_PARSERS = join(ROOT, 'src/lib/import/parsers/UADEPrefixParsers.ts');
const VERIFY_SCRIPT = join(ROOT, 'uade-wasm/verify_amigamsg.py');

/** Every prefix declared by any eagleplayer in eagleplayer.conf, lower-cased. */
function eagleplayerPrefixes(): Set<string> {
  const conf = readFileSync(EAGLEPLAYER_CONF, 'latin1');
  const out = new Set<string>();
  for (const line of conf.split('\n')) {
    const m = /prefixes=(\S+)/.exec(line);
    if (!m) continue;
    for (const p of m[1].split(',')) out.add(p.trim().toLowerCase());
  }
  return out;
}

/** The EXT_TO_UADE_PREFIX table, read from source so the test sees the real literal. */
function extToUadePrefix(): Array<[string, string]> {
  const src = readFileSync(PREFIX_PARSERS, 'utf8');
  const start = src.indexOf('const EXT_TO_UADE_PREFIX');
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('};', start));
  return [...body.matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]] as [string, string]);
}

// Formats whose comments state they have no eagleplayer entry and are reached by
// content detection instead. Anything else must resolve to a real eagleplayer prefix.
const CONTENT_DETECTED = new Set(['rkl', 'ins', 'ntp1']);

describe('UADE extension -> eagleplayer prefix mapping', () => {
  it('maps every extension to a prefix some eagleplayer actually declares', () => {
    const prefixes = eagleplayerPrefixes();
    const unresolvable = extToUadePrefix()
      .filter(([, target]) => !prefixes.has(target) && !CONTENT_DETECTED.has(target))
      .map(([ext, target]) => `${ext} -> ${target}`);

    expect(unresolvable).toEqual([]);
  });

  it('routes both MaxTrax spellings to the mxtx eagleplayer', () => {
    const mapping = new Map(extToUadePrefix());
    expect(mapping.get('mxtx')).toBe('mxtx');
    expect(mapping.get('mxt')).toBe('mxtx');
    expect(eagleplayerPrefixes().has('mxtx')).toBe(true);
  });

  it('declares the MaxTrax eagleplayer in eagleplayer.conf', () => {
    const conf = readFileSync(EAGLEPLAYER_CONF, 'latin1');
    expect(conf).toMatch(/^MaxTrax\s+prefixes=mxtx\s*$/m);
  });
});

describe('UADE prefix routing — companion files', () => {
  beforeEach(() => vi.resetModules());

  it('forwards companion files to UADE so split-file tunes find their sample bank', async () => {
    const parseUADEFile = vi.fn().mockResolvedValue({ title: 'stub' });
    vi.doMock('@lib/import/formats/UADEParser', () => ({
      parseUADEFile,
      isUADEFormat: () => false,
    }));

    const { tryUADEPrefixParse } = await import('../parsers/UADEPrefixParsers');

    const companions = new Map<string, ArrayBuffer>([['SMPL.tune', new ArrayBuffer(8)]]);
    await tryUADEPrefixParse(
      new ArrayBuffer(16),
      'MXTX.tune',
      'MXTX.tune',
      {} as never,
      0,
      undefined,
      companions,
    );

    expect(parseUADEFile).toHaveBeenCalledTimes(1);
    // signature: (buffer, filename, mode, subsong, preScannedMeta, companionFiles)
    expect(parseUADEFile.mock.calls[0][5]).toBe(companions);
  });
});

describe('fake audio.device message protocol', () => {
  it('keeps score.s and amigamsg.h in lockstep', () => {
    // Throws (non-zero exit) if any shared AMIGAMSG_* id differs between the two sides.
    const out = execFileSync('python3', [VERIFY_SCRIPT], { encoding: 'utf8' });
    expect(out).toMatch(/message ids agree/);
  });
});
