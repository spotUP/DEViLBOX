/**
 * PaulRobothamParser Tests - Format capability analysis
 *
 * API: isPaulRobothamFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *      parsePaulRobothamFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isPaulRobothamFormat,
  parsePaulRobothamFile,
} from "../formats/PaulRobothamParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Paul Robotham/Paul Robotham/Ashes Of Empire/ashes of empire-auto.dat");
const FILE2 = resolve(REF, "Paul Robotham/Paul Robotham/Dawn Patrol/dawnpatrol-happy.dat");

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isPaulRobothamFormat", () => {
  it("detects Ashes Of Empire", () => {
    expect(isPaulRobothamFormat(loadBuf(FILE1))).toBe(true);
  });
  it("detects Dawn Patrol", () => {
    expect(isPaulRobothamFormat(loadBuf(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isPaulRobothamFormat(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parsePaulRobothamFile — ashes of empire-auto.dat", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulRobothamFile(loadBuf(FILE1), "ashes of empire-auto.dat")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulRobothamFile(loadBuf(FILE1), "ashes of empire-auto.dat");
    const report = analyzeFormat(song, "ashes of empire-auto.dat");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parsePaulRobothamFile — dawnpatrol-happy.dat", () => {
  it("parses without throwing", () => {
    expect(() =>
      parsePaulRobothamFile(loadBuf(FILE2), "dawnpatrol-happy.dat")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parsePaulRobothamFile(loadBuf(FILE2), "dawnpatrol-happy.dat");
    const report = analyzeFormat(song, "dawnpatrol-happy.dat");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
