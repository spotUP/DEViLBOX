/**
 * MusicLineParser Tests - Format capability analysis
 *
 * API: isMusicLineFile(data: Uint8Array): boolean
 *      parseMusicLineFile(data: Uint8Array): TrackerSong | null  (sync, Uint8Array only, NO filename arg)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isMusicLineFile,
  parseMusicLineFile,
} from "../formats/MusicLineParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../public/data/songs");
const FILE1 = resolve(REF, "musicline-editor/drax.ml");
const FILE2 = resolve(REF, "formats/harmonic disorder.ml");

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isMusicLineFile", () => {
  it("detects drax.ml", () => {
    expect(isMusicLineFile(loadBytes(FILE1))).toBe(true);
  });
  it("detects harmonic disorder.ml", () => {
    expect(isMusicLineFile(loadBytes(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isMusicLineFile(new Uint8Array(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parseMusicLineFile — drax.ml", () => {
  it("parses without returning null", () => {
    expect(parseMusicLineFile(loadBytes(FILE1))).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicLineFile(loadBytes(FILE1));
    if (!song) {
      console.log("returned null for drax.ml");
      return;
    }
    const report = analyzeFormat(song, "drax.ml");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parseMusicLineFile — harmonic disorder.ml", () => {
  it("parses without returning null", () => {
    expect(parseMusicLineFile(loadBytes(FILE2))).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicLineFile(loadBytes(FILE2));
    if (!song) {
      console.log("returned null for harmonic disorder.ml");
      return;
    }
    const report = analyzeFormat(song, "harmonic disorder.ml");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Channel track table structure ─────────────────────────────────────────────

describe("channelTrackTables structure", () => {
  it("drax.ml: channelTrackTables has 3 channels (numChannels byte of the TUNE chunk)", () => {
    const song = parseMusicLineFile(loadBytes(FILE1))!;
    expect(song.channelTrackTables).toBeDefined();
    expect(song.channelTrackTables!.length).toBe(3);
    // Each channel should have at least one position
    for (const table of song.channelTrackTables!) {
      expect(table.length).toBeGreaterThan(0);
    }
    console.log("drax.ml channelTrackTables lengths:", song.channelTrackTables!.map(t => t.length));
    console.log("drax.ml channelSpeeds:", song.channelSpeeds);
  });

  it("harmonic disorder.ml: channelTrackTables has 8 channels (numChannels byte of the TUNE chunk)", () => {
    const song = parseMusicLineFile(loadBytes(FILE2))!;
    expect(song.channelTrackTables).toBeDefined();
    expect(song.channelTrackTables!.length).toBe(8);
    // Each channel should have at least one position
    for (const table of song.channelTrackTables!) {
      expect(table.length).toBeGreaterThan(0);
    }
    console.log("harmonic disorder.ml channelTrackTables lengths:", song.channelTrackTables!.map(t => t.length));
    console.log("harmonic disorder.ml channelSpeeds:", song.channelSpeeds);
  });
});
