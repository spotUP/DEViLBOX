/**
 * MusicMakerParser Tests - Format capability analysis
 *
 * Covers both 4V and 8V variants.
 *
 * API:
 *   isMusicMaker4VFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean
 *   parseMusicMaker4VFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 *   isMusicMaker8VFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean
 *   parseMusicMaker8VFile(buffer: ArrayBuffer, filename: string): TrackerSong  (sync, never null)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isMusicMaker4VFormat,
  parseMusicMaker4VFile,
  isMusicMaker8VFormat,
  parseMusicMaker8VFile,
} from "../formats/MusicMakerParser";
import { analyzeFormat, formatReportToString } from "./formatAnalysis";

const REF = resolve(import.meta.dirname, "../../../../Reference Music");

// 4V file from MusicMaker V8/- unknown/
const FILE_4V = resolve(REF, "MusicMaker V8/- unknown/axelf.mm4");
// 8V file from MusicMaker V8/- unknown/
const FILE_8V = resolve(REF, "MusicMaker V8/- unknown/crockett8.mm8");

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe("isMusicMaker4VFormat / isMusicMaker8VFormat", () => {
  it("detects axelf.mm4 as 4V", () => {
    expect(isMusicMaker4VFormat(loadBuf(FILE_4V), "axelf.mm4")).toBe(true);
  });
  it("detects crockett8.mm8 as 8V", () => {
    expect(isMusicMaker8VFormat(loadBuf(FILE_8V), "crockett8.mm8")).toBe(true);
  });
  it("rejects zeroed buffer for 4V", () => {
    expect(isMusicMaker4VFormat(new ArrayBuffer(64))).toBe(false);
  });
  it("rejects zeroed buffer for 8V", () => {
    expect(isMusicMaker8VFormat(new ArrayBuffer(64))).toBe(false);
  });
});

// ── Parse 4V file ─────────────────────────────────────────────────────────────

describe("parseMusicMaker4VFile — axelf.mm4", () => {
  it("parses without throwing", () => {
    expect(() =>
      parseMusicMaker4VFile(loadBuf(FILE_4V), "axelf.mm4")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parseMusicMaker4VFile(loadBuf(FILE_4V), "axelf.mm4");
    const report = analyzeFormat(song, "axelf.mm4");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Parse 8V file ─────────────────────────────────────────────────────────────

describe("parseMusicMaker8VFile — crockett8.mm8", () => {
  it("parses without throwing", () => {
    expect(() =>
      parseMusicMaker8VFile(loadBuf(FILE_8V), "crockett8.mm8")
    ).not.toThrow();
  });
  it("reports format capabilities", () => {
    const song = parseMusicMaker8VFile(loadBuf(FILE_8V), "crockett8.mm8");
    const report = analyzeFormat(song, "crockett8.mm8");
    console.log("\n" + formatReportToString(report));
    expect(typeof report.format).toBe("string");
    expect(report.numChannels).toBeGreaterThan(0);
  });
});
