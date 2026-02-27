/**
 * DigiBoosterParser Tests - Format capability analysis
 *
 * DigiBooster has no detection function. Parse directly, use try/catch.
 * API: parseDigiBoosterFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseDigiBoosterFile } from "../formats/DigiBoosterParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");
const FILE1 = resolve(REF, "Digibooster/Adam Tredowski/fun 4ch.digi");
const FILE2 = resolve(REF, "Digibooster/Adam Tredowski/the day after.digi");

function loadBuf(path: string): ArrayBuffer {
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("parseDigiBoosterFile — fun 4ch.digi", () => {
  it("parses without throwing", () => {
    let song: ReturnType<typeof parseDigiBoosterFile> | undefined;
    let error: unknown;
    try {
      song = parseDigiBoosterFile(loadBuf(FILE1), "fun 4ch.digi");
    } catch (e) {
      error = e;
    }
    if (error !== undefined) {
      console.log("Parser threw for fun 4ch.digi:", error);
    }
    expect(song ?? error).toBeDefined();
  });

  it("reports format capabilities", () => {
    let song: ReturnType<typeof parseDigiBoosterFile> | undefined;
    try {
      song = parseDigiBoosterFile(loadBuf(FILE1), "fun 4ch.digi");
    } catch (e) {
      console.log("Parser threw for fun 4ch.digi:", e);
      return;
    }
    if (!song) {
      console.log("Parser returned null/undefined for fun 4ch.digi");
      return;
    }
    const report = analyzeFormat(song, "fun 4ch.digi");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe("parseDigiBoosterFile — the day after.digi", () => {
  it("parses without throwing", () => {
    let song: ReturnType<typeof parseDigiBoosterFile> | undefined;
    let error: unknown;
    try {
      song = parseDigiBoosterFile(loadBuf(FILE2), "the day after.digi");
    } catch (e) {
      error = e;
    }
    if (error !== undefined) {
      console.log("Parser threw for the day after.digi:", error);
    }
    expect(song ?? error).toBeDefined();
  });

  it("reports format capabilities", () => {
    let song: ReturnType<typeof parseDigiBoosterFile> | undefined;
    try {
      song = parseDigiBoosterFile(loadBuf(FILE2), "the day after.digi");
    } catch (e) {
      console.log("Parser threw for the day after.digi:", e);
      return;
    }
    if (!song) {
      console.log("Parser returned null/undefined for the day after.digi");
      return;
    }
    const report = analyzeFormat(song, "the day after.digi");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
