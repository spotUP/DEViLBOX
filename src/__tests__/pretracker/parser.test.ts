/**
 * PreTrackerParser unit tests
 */

import { describe, it, expect } from 'vitest';
import { isPreTrackerFormat, parsePreTrackerFile } from '../../lib/import/formats/PreTrackerParser';

describe('PreTrackerParser', () => {
  it('should parse a minimal PreTracker buffer', async () => {
    const testData = new ArrayBuffer(1024);
    const song = await parsePreTrackerFile(testData, 'test.prt');

    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.instruments.length).toBeGreaterThan(0);
  });

  it('should reject buffers that are too small', async () => {
    const tooSmall = new ArrayBuffer(10);
    await expect(parsePreTrackerFile(tooSmall, 'tiny.prt')).rejects.toThrow('too small');
  });

  it('should detect format from valid buffer', () => {
    const valid = new ArrayBuffer(1024);
    expect(isPreTrackerFormat(valid)).toBe(true);
  });

  it('should reject tiny buffers in format detection', () => {
    const tiny = new ArrayBuffer(4);
    expect(isPreTrackerFormat(tiny)).toBe(false);
  });

  it('should extract filename as song name', async () => {
    const testData = new ArrayBuffer(1024);
    const song = await parsePreTrackerFile(testData, 'my_cool_song.prt');
    expect(song.name).toBe('my_cool_song [PreTracker]');
  });
});
