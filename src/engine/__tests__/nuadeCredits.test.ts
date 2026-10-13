/**
 * CR-1..CR-3: emoon and nuade are credited where DEViLBOX credits third-party engines. Fails when the licence text
 * or the notices section is dropped, when the format list drifts from the table, or when the README loses the credit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NUADE_FORMAT_LIST } from '@/engine/nuade/nuadeFormats';
import { nuadeNoticesFormatBlock, withNuadeNoticesBlock, nuadeSongCredit } from '@/engine/nuade/nuadeCredits';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('CR-1 the licence travels with the vendored tree', () => {
  it('keeps the full MIT grant and the upstream notices naming NostalgicPlayer', () => {
    const lic = read('third-party/nuade/LICENSE');
    expect(lic).toMatch(/Copyright \(c\) 2026 Daniel Collin/);
    expect(lic).toContain('Permission is hereby granted, free of charge');
    expect(lic).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(read('third-party/nuade/THIRD_PARTY_NOTICES.md')).toContain('NostalgicPlayer');
  });
});

describe('CR-2 THIRD_PARTY_NOTICES.md', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  const section = notices.slice(notices.indexOf('### nuade'), notices.indexOf('### Hively Tracker'));

  it('has a nuade section next to UADE with author, source at the pinned SHA, licence text', () => {
    expect(notices.indexOf('### UADE')).toBeLessThan(notices.indexOf('### nuade'));
    expect(section).toContain('Daniel Collin (emoon)');
    expect(section).toContain('https://github.com/emoon/nuade');
    expect(section).toContain('4900e597e6718d523e50bbaf6e1fc6ca41ebe683');
    expect(section).toContain('Permission is hereby granted, free of charge');
    expect(section).toContain('NostalgicPlayer');
  });

  it('lists exactly the formats the table defaults to nuade (regenerate: npx tsx tools/nuade/write-notices.ts)', () => {
    expect(notices).toContain(nuadeNoticesFormatBlock());
    expect(withNuadeNoticesBlock(notices)).toBe(notices);
    for (const r of NUADE_FORMAT_LIST.filter((x) => x.defaultEngine === 'nuade')) expect(section).toContain(`  - ${r.label}\n`);
  });

  it('is regenerated when a row changes its default', () => {
    const stale = notices.replace('  - Tim Follin\n', '');
    expect(withNuadeNoticesBlock(stale)).toBe(notices);
  });
});

describe('CR-3 README', () => {
  it('names nuade and emoon beside UADE in the licence paragraph', () => {
    const readme = read('README.md');
    const para = readme.slice(readme.indexOf('## Licence'));
    expect(para).toContain('UADE');
    expect(para).toContain('nuade');
    expect(para).toContain('emoon');
  });
});

describe('CR-4 per-song credit text', () => {
  it('names the engine author, the row and the player id', () => {
    const t = nuadeSongCredit('OctaMED MMDC', 'mmdc');
    expect(t).toContain('Daniel Collin / emoon');
    expect(t).toContain('OctaMED MMDC');
    expect(t).toContain('"mmdc"');
  });
});
