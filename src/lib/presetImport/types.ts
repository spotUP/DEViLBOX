/**
 * Shared types and helpers for the pure preset-file parsers in `parsers/`.
 * A parser takes bytes in and returns our instrument parameter objects; it never touches a store,
 * the DOM or an engine. The registry step (not built here) picks a parser by `sniff` and applies the result.
 */

export interface ParsedPreset {
  name: string;
  /** SynthType the config belongs to ('Helm', 'Vital', 'Amsynth', ...). */
  synthType: string;
  /** Exactly the shape the target synth's instrument config / parameter object uses (see each parser's header). */
  config: Record<string, unknown>;
  /**
   * Complete engine state as a flat array (the NativePatch `values` of src/engine/common/NativePatchLoader.ts), for
   * synths whose app config exposes only part of the engine's parameters. Present only where the parser can build it.
   */
  native?: { values: number[] };
  /** Everything that was not carried over: unknown keys, out-of-range values that were clamped, dropped sections. */
  warnings: string[];
}

export interface PresetParser {
  sniff(bytes: Uint8Array, fileName: string): boolean;
  parse(bytes: Uint8Array, fileName: string): ParsedPreset[];
}

/** The one error type every parser throws on malformed input. */
export class ParseError extends Error {
  readonly format: string;
  constructor(format: string, message: string) {
    super(`${format}: ${message}`);
    this.name = 'ParseError';
    this.format = format;
  }
}

const MAX_TEXT_BYTES = 64 * 1024 * 1024;

/** UTF-8 text from bytes (BOM stripped). Throws ParseError on empty or absurdly large input. */
export function bytesToText(bytes: Uint8Array, format: string): string {
  if (bytes.length === 0) throw new ParseError(format, 'empty file');
  if (bytes.length > MAX_TEXT_BYTES) throw new ParseError(format, 'file is larger than 64 MiB');
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i < 0 ? '' : fileName.slice(i).toLowerCase();
}

/** File name without directory and extension, used as a fallback preset name. */
export function baseNameOf(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  const i = leaf.lastIndexOf('.');
  return i > 0 ? leaf.slice(0, i) : leaf;
}

/**
 * Clamp `value` into [min, max] (either bound may be null = open). A change is reported in `warnings`
 * so a clamped value is never silent. Non-finite input returns null and warns.
 */
export function clampReported(
  key: string,
  value: number,
  min: number | null,
  max: number | null,
  warnings: string[],
): number | null {
  if (!Number.isFinite(value)) {
    warnings.push(`${key}: non-numeric value ignored`);
    return null;
  }
  let v = value;
  if (min !== null && v < min) v = min;
  if (max !== null && v > max) v = max;
  if (v !== value) warnings.push(`${key}: ${value} clamped to ${v}`);
  return v;
}

/** JSON.parse that throws ParseError, and only accepts a plain object at the top level. */
export function parseJsonObject(text: string, format: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ParseError(format, `invalid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ParseError(format, 'top level is not a JSON object');
  }
  return data as Record<string, unknown>;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Cheap check used by sniffers: does the text (after whitespace) start with `{`? */
export function looksLikeJsonObject(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length, 64); i++) {
    const c = bytes[i];
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) continue;
    if (i === 0 && c === 0xef) continue; // BOM start
    if (c === 0xef || c === 0xbb || c === 0xbf) continue;
    return c === 0x7b;
  }
  return false;
}

/** Sniffer helper: the top-level JSON object, or null when the bytes are not one. Never throws. */
export function tryJsonObject(bytes: Uint8Array): Record<string, unknown> | null {
  if (!looksLikeJsonObject(bytes) || bytes.length > MAX_TEXT_BYTES) return null;
  try {
    const data: unknown = JSON.parse(new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, ''));
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}
