/**
 * MedleyParser Tests - Format capability analysis
 *
 * API: isMedleyFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *      parseMedleyFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { isMedleyFormat, parseMedleyFile } from "../formats/MedleyParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Medley/Paul Van Der Valk/atmos.mso");
const FILE2 = resolve(REF, "Medley/Paul Van Der Valk/combat.mso");

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isMedleyFormat", () => {
  it("detects atmos.mso", () => {
    expect(isMedleyFormat(loadBuf(FILE1))).toBe(true);
  });
  it("detects combat.mso", () => {
    expect(isMedleyFormat(loadBuf(FILE2))).toBe(true);
  });
  it("rejects zeroed buffer", () => {
    expect(isMedleyFormat(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse FILE1 ───────────────────────────────────────────────────────────────

describe("parseMedleyFile — atmos.mso", () => {
  it("parses without throwing", () => {
    expect(() => parseMedleyFile(loadBuf(FILE1), "atmos.mso")).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parseMedleyFile(loadBuf(FILE1), "atmos.mso");
    const report = analyzeFormat(song, "atmos.mso");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse FILE2 ───────────────────────────────────────────────────────────────

describe("parseMedleyFile — combat.mso", () => {
  it("parses without throwing", () => {
    expect(() => parseMedleyFile(loadBuf(FILE2), "combat.mso")).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parseMedleyFile(loadBuf(FILE2), "combat.mso");
    const report = analyzeFormat(song, "combat.mso");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
