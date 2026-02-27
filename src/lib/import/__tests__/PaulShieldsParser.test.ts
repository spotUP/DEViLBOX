/**
 * PaulShieldsParser Tests - Format capability analysis
 *
 * API: isPaulShieldsFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *      parsePaulShieldsFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isPaulShieldsFormat,
  parsePaulShieldsFile,
} from "../formats/PaulShieldsParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Paul Shields/Paul Shields/airball-gameover.ps");
const FILE2 = resolve(REF, "Paul Shields/Paul Shields/airball-ingame.ps");

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isPaulShieldsFormat", () => {
  it("detects airball-gameover.ps", () => {
    expect(isPaulShieldsFormat(loadBuf(FILE1))).toBe(true);
  });
  it("detects airball-ingame.ps", () => {
    expect(isPaulShieldsFormat(loadBuf(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isPaulShieldsFormat(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parsePaulShieldsFile — airball-gameover.ps", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulShieldsFile(loadBuf(FILE1), "airball-gameover.ps")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulShieldsFile(loadBuf(FILE1), "airball-gameover.ps");
    const report = analyzeFormat(song, "airball-gameover.ps");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parsePaulShieldsFile — airball-ingame.ps", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulShieldsFile(loadBuf(FILE2), "airball-ingame.ps")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulShieldsFile(loadBuf(FILE2), "airball-ingame.ps");
    const report = analyzeFormat(song, "airball-ingame.ps");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
