/**
 * sunTestUtil.ts — shared helpers for SunTronic V1.3 codec tests.
 *
 * readFixture: load a raw fixture file from the SunTronic corpus as ArrayBuffer.
 * Re-exports parseSunTronicFile for convenience.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export { parseSunTronicFile } from '../SunTronicParser';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

export function readFixture(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}
