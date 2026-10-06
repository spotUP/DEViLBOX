/**
 * The Dub Deck channel card's role dropdown is the design-system CustomSelect,
 * not a native <select> (project rule: UI component allowlist). Source contract:
 * the role control sits between its own comment and the shaping slot's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Dub Deck channel role dropdown', () => {
  const src = readFileSync(resolve(__dirname, '../DubDeckStrip.tsx'), 'utf8');
  const a = src.indexOf('Role override');
  const b = src.indexOf('Per-channel sound-shaping slot on the send');
  const block = src.slice(a, b);
  it('is a CustomSelect that sets the channel role', () => {
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(block).toContain('<CustomSelect');
    expect(block).toContain('setChannelDubRole(i, v || null)');
  });
  it('is not a native select', () => {
    expect(block).not.toMatch(/<select[\s>]/);
  });
  it('offers the auto role plus the six override roles', () => {
    for (const v of ['percussion', 'bass', 'lead', 'skank', 'pad', 'empty']) expect(block).toContain(`value: '${v}'`);
  });
});
