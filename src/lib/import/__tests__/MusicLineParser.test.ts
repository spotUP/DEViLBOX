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

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Musicline Editor/- unknown/pink2.ml");
const FILE2 = resolve(REF, "Musicline Editor/- unknown/rush.ml");

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isMusicLineFile", () => {
  it("detects pink2.ml", () => {
    expect(isMusicLineFile(loadBytes(FILE1))).toBe(true);
  });
  it("detects rush.ml", () => {
    expect(isMusicLineFile(loadBytes(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isMusicLineFile(new Uint8Array(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parseMusicLineFile — pink2.ml", () => {
  it("parses without returning null", () => {
    expect(parseMusicLineFile(loadBytes(FILE1))).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicLineFile(loadBytes(FILE1));
    if (!song) {
      console.log("returned null for pink2.ml");
      return;
    }
    const report = analyzeFormat(song, "pink2.ml");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parseMusicLineFile — rush.ml", () => {
  it("parses without returning null", () => {
    expect(parseMusicLineFile(loadBytes(FILE2))).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicLineFile(loadBytes(FILE2));
    if (!song) {
      console.log("returned null for rush.ml");
      return;
    }
    const report = analyzeFormat(song, "rush.ml");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
