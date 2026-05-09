/**
 * Contract tests: DJPlaylistAnalyzer must download companion files BEFORE
 * rendering, and pass them to the pipeline. Without this, TFMX mdat files
 * fail with "file not found /uade/smpl.*" and FRED files 422 on the server.
 *
 * Regression: 2026-05-09 — companion download happened AFTER the render,
 * and was never forwarded to loadOrEnqueue.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../DJPlaylistAnalyzer.ts'),
  'utf-8',
);

// Extract the remote-track analysis section (starts at "Remote track" comment)
const remoteSection = SRC.slice(SRC.indexOf('── Remote track'));

describe('DJPlaylistAnalyzer companion handling', () => {
  it('downloads TFMX companions BEFORE the render in the remote section', () => {
    // The companion download ("downloadTFMXCompanion") must appear before
    // any "loadOrEnqueue" call in the remote-track analysis section.
    const companionIdx = remoteSection.indexOf('downloadTFMXCompanion');
    const firstEnqueue = remoteSection.indexOf('loadOrEnqueue');
    expect(companionIdx).toBeGreaterThan(0);
    expect(firstEnqueue).toBeGreaterThan(0);
    expect(companionIdx).toBeLessThan(firstEnqueue);
  });

  it('passes companions to the local pipeline loadOrEnqueue', () => {
    // The needsLocalPipeline branch must pass companions (not undefined).
    const localPipelineMatch = remoteSection.match(
      /needsLocalPipeline[\s\S]*?loadOrEnqueue\(buffer,\s*filename,\s*undefined,\s*'low',\s*(\w+)/,
    );
    expect(localPipelineMatch).not.toBeNull();
    expect(localPipelineMatch![1]).toBe('companions');
  });

  it('passes companions to the piggyback render loadOrEnqueue', () => {
    // The piggyback render call must also pass companions.
    const piggybackMatch = remoteSection.match(
      /piggybackResult.*=.*loadOrEnqueue\(buffer,\s*filename,\s*undefined,\s*'low',\s*(\w+)/,
    );
    expect(piggybackMatch).not.toBeNull();
    expect(piggybackMatch![1]).toBe('companions');
  });

  it('routes FRED files through local pipeline (not server)', () => {
    expect(SRC).toMatch(/needsLocalPipeline.*'fred'/s);
  });

  it('routes TFMX mdat files through local pipeline', () => {
    expect(SRC).toMatch(/needsLocalPipeline.*mdat/s);
  });
});
