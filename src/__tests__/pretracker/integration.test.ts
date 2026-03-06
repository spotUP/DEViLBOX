/**
 * PreTracker integration tests
 *
 * Verifies the parser → store → engine routing pipeline.
 * Browser-dependent tests (AudioWorklet, WASM) are deferred to E2E.
 */

import { describe, it, expect } from 'vitest';
import { parsePreTrackerFile, isPreTrackerFormat } from '../../lib/import/formats/PreTrackerParser';

describe('PreTracker Integration', () => {
  it('parser returns preTrackerFileData for engine routing', async () => {
    const testData = new ArrayBuffer(1024);
    const song = await parsePreTrackerFile(testData, 'test.prt');

    // preTrackerFileData must be set for NativeEngineRouting to activate the WASM engine
    expect(song.preTrackerFileData).toBeDefined();
    expect(song.preTrackerFileData).toBeInstanceOf(ArrayBuffer);
    expect(song.preTrackerFileData!.byteLength).toBe(1024);
  });

  it('parser creates a defensive copy of file data', async () => {
    const testData = new ArrayBuffer(512);
    const song = await parsePreTrackerFile(testData, 'test.prt');

    // Should be a copy (buffer.slice(0)), not the same reference
    expect(song.preTrackerFileData).not.toBe(testData);
  });

  it('parser sets correct name from filename', async () => {
    const testData = new ArrayBuffer(1024);
    const song = await parsePreTrackerFile(testData, 'my_tune.prt');

    expect(song.name).toBe('my_tune [PreTracker]');
  });

  it('parser creates valid pattern structure', async () => {
    const testData = new ArrayBuffer(1024);
    const song = await parsePreTrackerFile(testData, 'test.prt');

    expect(song.numChannels).toBe(4);
    expect(song.patterns).toHaveLength(1);
    expect(song.patterns[0].channels).toHaveLength(4);
    expect(song.patterns[0].length).toBe(64);
    expect(song.songPositions).toEqual([0]);
  });

  it('format detection rejects tiny files', () => {
    expect(isPreTrackerFormat(new ArrayBuffer(0))).toBe(false);
    expect(isPreTrackerFormat(new ArrayBuffer(35))).toBe(false);
    expect(isPreTrackerFormat(new ArrayBuffer(36))).toBe(true);
  });
});
