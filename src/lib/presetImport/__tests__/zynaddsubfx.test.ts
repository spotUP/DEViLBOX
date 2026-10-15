import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import * as zyn from '../parsers/zynaddsubfx';
import { gunzip, gzipStored, isGzip } from '../gzip';
import { bytes, expectParseError, filesIn, read } from './helpers';

const xiz = (name: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ZynAddSubFX-data>
<ZynAddSubFX-data version-major="3" version-minor="0">
<BASE_PARAMETERS><par name="max_midi_parts" value="16"/></BASE_PARAMETERS>
<INSTRUMENT>
<INFO><string name="name">${name}</string><string name="author">me &amp; you</string></INFO>
<par name="volume" value="90"/>${extra}
</INSTRUMENT>
</ZynAddSubFX-data>`;

describe('ZynAddSubFX .xiz / .xmz parser', () => {
  it('sniff accepts gzip with a Zyn extension and plain Zyn XML, rejects other data', () => {
    expect(zyn.sniff(new Uint8Array(gzipSync(Buffer.from(xiz('A')))), 'a.xiz')).toBe(true);
    expect(zyn.sniff(bytes(xiz('A')), 'a.xml')).toBe(true);
    expect(zyn.sniff(new Uint8Array(gzipSync(Buffer.from('x'.repeat(40)))), 'a.txt')).toBe(false);
    expect(zyn.sniff(bytes('<other/>'), 'a.xml')).toBe(false);
  });

  it('decompresses a real zlib-compressed .xiz and keeps the instrument XML', () => {
    const [p] = zyn.parse(new Uint8Array(gzipSync(Buffer.from(xiz('Warm Pad')))), 'Warm Pad.xiz');
    expect(p.name).toBe('Warm Pad');
    expect(p.synthType).toBe('ZynAddSubFX');
    const xml = p.config.zynaddsubfxXml as string;
    expect(xml).toContain('<INSTRUMENT>');
    expect(xml).toContain('<par name="volume" value="90"/>');
    expect(xml).toContain('me &amp; you');
  });

  it('a master file yields one preset per instrument found (layout unverified, reported)', () => {
    const master = `<ZynAddSubFX-data version-major="3"><MASTER><PART id="0"><INSTRUMENT><INFO><string name="name">One</string></INFO></INSTRUMENT></PART>` +
      `<PART id="1"><INSTRUMENT><INFO><string name="name"></string></INFO></INSTRUMENT></PART></MASTER></ZynAddSubFX-data>`;
    const presets = zyn.parse(new Uint8Array(gzipSync(Buffer.from(master))), 'song.xmz');
    expect(presets.map((p) => p.name)).toEqual(['One', 'song part 2']);
    expect(presets[0].warnings.join('\n')).toMatch(/instrument 1 of 2/);
  });

  it('gunzip handles stored, fixed and dynamic deflate blocks and checks the CRC', () => {
    const text = Buffer.from(Array.from({ length: 4000 }, (_, i) => `row ${i % 37} value ${(i * 7919) % 1000}\n`).join(''));
    const dynamic = new Uint8Array(gzipSync(text, { level: 9 }));
    const fixed = new Uint8Array(gzipSync(Buffer.from('aaaaaaaaaabbbbbbbbbbaaaaaaaaaa'), { level: 1 }));
    expect(Buffer.from(gunzip(dynamic, 't')).equals(text)).toBe(true);
    expect(Buffer.from(gunzip(fixed, 't')).toString()).toBe('aaaaaaaaaabbbbbbbbbbaaaaaaaaaa');
    const big = new Uint8Array(200000).map((_, i) => (i * 31) & 255);
    const stored = gzipStored(big);
    expect(isGzip(stored)).toBe(true);
    expect(Buffer.from(gunzip(stored, 't')).equals(Buffer.from(big))).toBe(true);
    expect(Buffer.from(gunzip(new Uint8Array(gzipSync(Buffer.from(big))), 't')).equals(Buffer.from(big))).toBe(true);
    const bad = dynamic.slice();
    bad[bad.length - 6] ^= 0xff; // flip a CRC byte
    expectParseError(() => gunzip(bad, 't'));
  });

  it('the shipped plain-XML presets parse into instruments (skipped when public/zynaddsubfx is absent)', () => {
    const files = filesIn('public/zynaddsubfx/presets', '.xml');
    if (files.length === 0) return;
    for (const f of files) {
      const presets = zyn.parse(read(f), f);
      expect(presets.length).toBe(1);
      expect(presets[0].name.length).toBeGreaterThan(0);
    }
  });

  it('round trip serialize -> parse keeps the XML', () => {
    const [a] = zyn.parse(bytes(xiz('RT')), 'rt.xiz');
    const [b] = zyn.parse(zyn.serialize(a.config), 'rt2.xiz');
    expect(b.name).toBe('RT');
    expect(b.config.zynaddsubfxXml).toBe(a.config.zynaddsubfxXml);
  });

  it('malformed input throws ParseError (including a truncated and a corrupt gzip)', () => {
    const good = new Uint8Array(gzipSync(Buffer.from(xiz('A'))));
    expectParseError(() => zyn.parse(good.slice(0, 20), 'a.xiz'));
    expectParseError(() => zyn.parse(good.slice(0, good.length - 10), 'a.xiz'));
    const corrupt = good.slice();
    corrupt[14] ^= 0x55;
    expectParseError(() => zyn.parse(corrupt, 'a.xiz'));
    expectParseError(() => zyn.parse(bytes('<ZynAddSubFX-data><MASTER/></ZynAddSubFX-data>'), 'a.xmz'));
    expectParseError(() => zyn.parse(bytes('<notzyn/>'), 'a.xml'));
    expectParseError(() => zyn.parse(bytes('<ZynAddSubFX-data><INSTRUMENT>'), 'a.xml'));
    expectParseError(() => zyn.parse(new Uint8Array(0), 'a.xiz'));
    expectParseError(() => zyn.serialize({}));
  });
});
