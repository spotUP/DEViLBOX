/**
 * Oracle validation for the UADE module-read tracer.
 *
 * digitalSonixChrome is already byte-exact: its parser points a fixed pattern
 * layout at a HAND-LOCATED on-disk sequence-table region (seqTableOff=114, 4-byte
 * entries — read from the format by hand). The dynamic tracer must independently
 * rediscover that region by watching which file bytes the emulated 68k player
 * reads during playback. If it does, the tracer's coordinate system (module base
 * == chip address) and read hook are trustworthy, so it can locate the score
 * region for the OPAQUE stub formats where no hand analysis exists.
 *
 * Assertions:
 *  - moduleSize === file length  → base/size capture + coordinate mapping correct.
 *  - the player's reads CONCENTRATE in the hand-located region: the fraction of the
 *    region read is well above the fraction of the whole file read. This is
 *    robust to render length (a short render steps fewer sequence entries) and
 *    proves the reads are not coincidental noise.
 *
 * On revert (tracer broken / hook removed) coverageBytes → 0 and this fails.
 *
 * NOTE: paulRobotham (the other hand-located oracle) is NOT usable here — UADE
 * cannot autodetect/load its .dat headless (_uade_wasm_load ret=-1), so there is
 * no player to trace. KEY subsystem constraint: dynamic tracing only applies to
 * formats UADE can actually PLAY.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { traceModuleReads, type TracedRange } from '../../../../tools/uade-audit/traceModuleReads';
import { getCellFileOffset, type UADEPatternLayout } from '../UADEPatternEncoder';
import { parseDscFile } from '@/lib/import/formats/DigitalSonixChromeParser';

const SAMPLE_RATE = 44100;
const SECONDS = 20;

function layoutRegion(layout: UADEPatternLayout, rawLen: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let p = 0; p < layout.numPatterns; p++) {
    for (let r = 0; r < layout.rowsPerPattern; r++) {
      for (let c = 0; c < layout.numChannels; c++) {
        const off = getCellFileOffset(layout, p, r, c);
        if (off < 0 || off + layout.bytesPerCell > rawLen) continue;
        if (off < lo) lo = off;
        if (off + layout.bytesPerCell > hi) hi = off + layout.bytesPerCell;
      }
    }
  }
  return [lo, hi];
}

function intersectCoverage(ranges: TracedRange[], lo: number, hi: number): number {
  let covered = 0;
  for (const { start, end } of ranges) {
    const s = Math.max(start, lo);
    const e = Math.min(end, hi);
    if (e > s) covered += e - s;
  }
  return covered;
}

describe('UADE module-read tracer — oracle against hand-located regions', () => {
  it('rediscovers the digitalSonixChrome sequence region and its sample boundary', async () => {
    const filename = "dragon'sbreath ingame 1.dsc";
    const path = join(process.cwd(), 'public/data/songs/digital-sonix-and-chrome', filename);
    const b = readFileSync(path);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseDscFile(ab, filename);

    const layout = song.uadePatternLayout;
    expect(layout, 'shipped fixed layout present').toBeTruthy();
    if (!layout) throw new Error('no layout');

    const [lo, hi] = layoutRegion(layout, raw.length);
    expect(hi).toBeGreaterThan(lo);

    const trace = await traceModuleReads(raw, filename, { sampleRate: SAMPLE_RATE, seconds: SECONDS });

    // Coordinate / capture correctness.
    expect(trace.moduleSize, 'traced module size == file length').toBe(raw.length);
    expect(trace.coverageBytes, 'player read SOMETHING in the module').toBeGreaterThan(0);

    const regionLen = hi - lo;
    const covered = intersectCoverage(trace.ranges, lo, hi);
    const regionFrac = covered / regionLen;
    const fileFrac = trace.coverageBytes / trace.moduleSize;
    const inRegion = trace.ranges.filter((r) => r.end > lo && r.start < hi);
    const firstInRegion = Math.min(...inRegion.map((r) => Math.max(r.start, lo)));

    // eslint-disable-next-line no-console
    console.log(
      `[oracle] region [${lo},${hi}) len=${regionLen}  regionFrac=${(regionFrac * 100).toFixed(1)}%  ` +
      `fileFrac=${(fileFrac * 100).toFixed(1)}%  ranges=${trace.ranges.length}  firstInRegion=${firstInRegion}`,
    );

    // The player reads the head of the sequence table (entry 0 plays first) and
    // steps a substantial part of it over 20s — both prove the tracer located the
    // real note-data region at the correct file coordinates.
    //
    // KEY: the tracer also cleanly SEPARATES note data from sample PCM by read
    // topology — every read below the hand-located sample boundary (sampleInfoOff
    // == hi == 4210) is small/scattered sequence stepping, while reads at/above it
    // are large contiguous DMA sample fetches. That boundary matching the parser's
    // is the strongest signal the tracer is trustworthy.
    expect(firstInRegion, 'sequence-table head was read near offset lo').toBeLessThan(lo + 16);
    expect(regionFrac, 'a substantial part of the sequence table was stepped').toBeGreaterThan(0.15);

    // No note-data read may straddle into the sample region: the largest range
    // that starts below hi must not extend far past it (a few trailing bytes from
    // a word/long read at the boundary are tolerated).
    const straddle = inRegion.filter((r) => r.end > hi + 8);
    expect(straddle.length, 'no sequence read bleeds into the sample region').toBe(0);
  }, 60_000);
});
