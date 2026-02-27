/**
 * MusicAssemblerParser Tests - Format capability analysis
 *
 * API: isMusicAssemblerFormat(bytes: Uint8Array): boolean
 *      parseMusicAssemblerFile(bytes: Uint8Array, filename: string): TrackerSong | null  (sync, can return null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isMusicAssemblerFormat,
  parseMusicAssemblerFile,
} from "../formats/MusicAssemblerParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Music Assembler/- unknown/baseheads.ma");
const FILE2 = resolve(REF, "Music Assembler/- unknown/ik+.ma");

function loadBytes(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isMusicAssemblerFormat", () => {
  it("detects baseheads.ma", () => {
    expect(isMusicAssemblerFormat(loadBytes(FILE1))).toBe(true);
  });
  it("detects ik+.ma", () => {
    expect(isMusicAssemblerFormat(loadBytes(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isMusicAssemblerFormat(new Uint8Array(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parseMusicAssemblerFile — baseheads.ma", () => {
  it("parses without returning null", () => {
    expect(parseMusicAssemblerFile(loadBytes(FILE1), "baseheads.ma")).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicAssemblerFile(loadBytes(FILE1), "baseheads.ma");
    if (!song) {
      console.log("returned null for baseheads.ma");
      return;
    }
    const report = analyzeFormat(song, "baseheads.ma");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parseMusicAssemblerFile — ik+.ma", () => {
  it("parses without returning null", () => {
    expect(parseMusicAssemblerFile(loadBytes(FILE2), "ik+.ma")).not.toBeNull();
  });
  it("reports format capabilities", () => {
    const song = parseMusicAssemblerFile(loadBytes(FILE2), "ik+.ma");
    if (!song) {
      console.log("returned null for ik+.ma");
      return;
    }
    const report = analyzeFormat(song, "ik+.ma");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
