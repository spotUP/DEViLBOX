/**
 * Native-engine persistence round-trip with REAL song fixtures.
 *
 * Guards two data-loss bugs fixed in Phase 0 of the UADE-editability plan:
 *
 *  0.2 — `FILE_DATA_FIELDS` had drifted behind `TrackerSong`, so ~30 formats
 *        (soundMon among them) lost their engine bytes on project save/reload.
 *  0.3 — companion/sidecar files (Sonix .instr/.ss, TFMX smpl, …) were never
 *        serialized, so two-file formats broke on save/reload.
 *
 * These tests exercise the exact serialization functions the project save/load
 * path uses (`getNativeEngineDataForExport` / `getNativeCompanionFilesForExport`
 * → JSON → `restoreNativeEngineData`), driving them with real committed song
 * bytes. This is the persistence round-trip at the layer under test; it avoids
 * the full `loadProjectFromStorage`, which needs a real AudioContext (absent in
 * happy-dom — the existing persistence test tolerates the same limitation).
 *
 * House rule: real song files only — no fabricated bytes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getNativeEngineDataForExport,
  getNativeCompanionFilesForExport,
  restoreNativeEngineData,
} from '@/lib/export/exporters';
import { useFormatStore } from '@stores/useFormatStore';

// Real committed fixtures.
const SOUNDMON_FIXTURE = join(process.cwd(), 'public/data/songs/bp-soundmon-2/nicktune1.bp');
const SONIX_DIR = join(process.cwd(), 'public/data/songs/sonix-smus/ACE II');

function readAsArrayBuffer(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

/** Serialize + deserialize through JSON exactly like a saved .dbx project. */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('native-engine persistence round-trip (real fixtures)', () => {
  it('preserves soundMonFileData across export → JSON → restore (Task 0.2)', () => {
    const original = readAsArrayBuffer(SOUNDMON_FIXTURE);
    expect(original.byteLength).toBeGreaterThan(0);

    // Load the real engine bytes into the format store the way a parser would.
    useFormatStore.getState().applyEditorMode({ soundMonFileData: original } as never);
    expect(useFormatStore.getState().soundMonFileData).toBeTruthy();

    // Save side: collect + JSON round-trip (base64 survives).
    const ned = getNativeEngineDataForExport();
    expect(ned, 'export must produce native engine data').toBeTruthy();
    expect(
      ned!.soundMonFileData,
      'soundMonFileData must be in the export set (was dropped by the stale allowlist)',
    ).toBeTruthy();
    const serialized = jsonRoundTrip(ned!);

    // Simulate a fresh session.
    useFormatStore.getState().reset();
    expect(useFormatStore.getState().soundMonFileData).toBeNull();

    // Load side.
    restoreNativeEngineData(serialized, undefined, false, undefined);

    const restored = useFormatStore.getState().soundMonFileData;
    expect(restored, 'soundMonFileData must survive reload').toBeTruthy();
    expect(bytesEqual(restored as ArrayBuffer, original)).toBe(true);
  });

  it('preserves Sonix sidecar companion files across export → JSON → restore (Task 0.3)', () => {
    const songBytes = readAsArrayBuffer(join(SONIX_DIR, 'ACE II.smus'));
    const sidecars = [
      { path: 'sonix/Instruments/hihat.ss', data: readAsArrayBuffer(join(SONIX_DIR, 'Instruments/hihat.ss')) },
      { path: 'sonix/Instruments/hihat.instr', data: readAsArrayBuffer(join(SONIX_DIR, 'Instruments/hihat.instr')) },
    ];
    expect(songBytes.byteLength).toBeGreaterThan(0);
    expect(sidecars[0].data.byteLength).toBeGreaterThan(0);

    useFormatStore.getState().applyEditorMode({
      sonixFileData: songBytes,
      sonixSidecarFiles: sidecars,
    } as never);
    expect(useFormatStore.getState().sonixSidecarFiles?.length).toBe(2);

    // Save side.
    const ned = getNativeEngineDataForExport();
    const ncf = getNativeCompanionFilesForExport();
    expect(ned?.sonixFileData, 'sonixFileData must be exported').toBeTruthy();
    expect(ncf, 'companion files must be exported (were never serialized before)').toBeTruthy();
    expect(ncf!.sonixSidecarFiles?.length).toBe(2);
    const serializedNed = jsonRoundTrip(ned!);
    const serializedNcf = jsonRoundTrip(ncf!);

    // Fresh session.
    useFormatStore.getState().reset();
    expect(useFormatStore.getState().sonixSidecarFiles).toBeNull();
    expect(useFormatStore.getState().sonixFileData).toBeNull();

    // Load side.
    restoreNativeEngineData(serializedNed, undefined, false, serializedNcf);

    // Song bytes (Task 0.2) survive.
    const restoredSong = useFormatStore.getState().sonixFileData;
    expect(restoredSong, 'sonixFileData must survive reload').toBeTruthy();
    expect(bytesEqual(restoredSong as ArrayBuffer, songBytes)).toBe(true);

    // Companion sidecars (Task 0.3) survive with paths AND bytes intact.
    const restoredSidecars = useFormatStore.getState().sonixSidecarFiles;
    expect(restoredSidecars, 'sonixSidecarFiles must survive reload').toBeTruthy();
    expect(restoredSidecars?.length).toBe(2);
    for (const original of sidecars) {
      const match = restoredSidecars?.find((s) => s.path === original.path);
      expect(match, `sidecar ${original.path} must survive`).toBeTruthy();
      expect(bytesEqual(match!.data, original.data)).toBe(true);
    }
  });
});
