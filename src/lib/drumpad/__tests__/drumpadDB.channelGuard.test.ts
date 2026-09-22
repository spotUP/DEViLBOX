import { describe, it, expect } from 'vitest';

/**
 * Drum pad samples persisted with no channel data.
 *
 * Fifteen samples in one database failed on every boot with
 * `createBuffer(0, …)` — "The number of channels provided (0) is outside the
 * range [1, 32]" — from `storedToAudioBuffer`. The load continued, so those
 * pads were silently empty, and the console carried fifteen stack traces per
 * session that named an id and nothing else.
 *
 * A store that writes something unreadable has already lost the data. The
 * write is the last place a caller can still do anything about it, so that is
 * where it now fails.
 *
 * Asserted against the source: both functions are module-private and the read
 * path needs a real `BaseAudioContext`, which node has not got. What matters
 * is that neither guard can be removed without this failing.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '../drumpadDB.ts'),
  'utf-8',
);

describe('writing a sample', () => {
  it('refuses a buffer with no channels rather than storing it', () => {
    expect(SOURCE).toMatch(/if \(channels\.length === 0\)/);
    expect(SOURCE).toMatch(/refusing to store sample/);
  });

  it('throws rather than returning a record that cannot be read', () => {
    const write = SOURCE.slice(
      SOURCE.indexOf('function audioBufferToStored'),
      SOURCE.indexOf('function storedToAudioBuffer'),
    );
    // The guard must come before the return, or it guards nothing.
    expect(write.indexOf('channels.length === 0')).toBeLessThan(write.indexOf('return {'));
    expect(write).toMatch(/throw new Error/);
  });
});

describe('reading a sample back', () => {
  it('names the sample and the cause instead of leaking createBuffer text', () => {
    const read = SOURCE.slice(SOURCE.indexOf('function storedToAudioBuffer'));
    expect(read).toMatch(/numChannels === 0/);
    expect(read).toMatch(/holds no channel data/);
    // The message has to carry the id AND the name — an id alone was what made
    // the original fifteen warnings useless.
    expect(read).toMatch(/\$\{stored\.id\}/);
    expect(read).toMatch(/\$\{stored\.name\}/);
  });

  it('checks before calling createBuffer, not after it throws', () => {
    const read = SOURCE.slice(SOURCE.indexOf('function storedToAudioBuffer'));
    // Match the CALL, not the word — the guard's own comment quotes the
    // createBuffer error text and would otherwise satisfy this.
    expect(read.indexOf('numChannels === 0'))
      .toBeLessThan(read.indexOf('audioContext.createBuffer('));
  });
});
