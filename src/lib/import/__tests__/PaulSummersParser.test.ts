/**
 * PaulSummersParser Tests - Format capability analysis
 *
 * API: isPaulSummersFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *      parsePaulSummersFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isPaulSummersFormat,
  parsePaulSummersFile,
} from "../formats/PaulSummersParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Paul Summers/Mick Chilton/p-47thefreedomfighter.snk");
const FILE2 = resolve(REF, "Paul Summers/Paul Summers/fightingsoccer.snk");

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isPaulSummersFormat", () => {
  it("detects p-47thefreedomfighter.snk", () => {
    expect(isPaulSummersFormat(loadBuf(FILE1))).toBe(true);
  });
  it("detects fightingsoccer.snk", () => {
    expect(isPaulSummersFormat(loadBuf(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isPaulSummersFormat(new ArrayBuffer(1024))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parsePaulSummersFile — p-47thefreedomfighter.snk", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulSummersFile(loadBuf(FILE1), "p-47thefreedomfighter.snk")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulSummersFile(
      loadBuf(FILE1),
      "p-47thefreedomfighter.snk"
    );
    const report = analyzeFormat(song, "p-47thefreedomfighter.snk");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parsePaulSummersFile — fightingsoccer.snk", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulSummersFile(loadBuf(FILE2), "fightingsoccer.snk")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulSummersFile(loadBuf(FILE2), "fightingsoccer.snk");
    const report = analyzeFormat(song, "fightingsoccer.snk");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
