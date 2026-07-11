// src/lib/export/__tests__/maxtraxPersistenceRoundtrip.test.ts
/**
 * Regression guard for MaxTrax edits surviving a project SAVE + RELOAD.
 *
 * MaxTrax pattern/sample edits mutate the DECODED `maxTraxData` store model, but
 * project persistence serializes the raw `maxTraxFileData` bytes. Two links were
 * missing (both in exporters.ts):
 *   1. getNativeEngineDataForExport — must re-encode the live `maxTraxData` into
 *      the persisted `maxTraxFileData` bytes (else the pristine loaded bytes are
 *      saved and the edit is lost).
 *   2. restoreNativeEngineData — must re-parse `maxTraxFileData` back into
 *      `maxTraxData` (else applyEditorMode's editor-mode dispatch, which keys on
 *      `maxTraxData`, falls through to `classic` with an empty grid).
 *
 * Reverting either link makes this test fail:
 *   - revert (1): saved bytes are unedited → restored stopTime !== 999.
 *   - revert (2): restored maxTraxData is null / editorMode is not 'maxtrax'.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMaxTrax } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { setNoteDuration } from '@/lib/maxtrax/maxtraxGrid';
import { getNativeEngineDataForExport, restoreNativeEngineData } from '@/lib/export/exporters';
import { useFormatStore } from '@/stores/useFormatStore';

const FIXTURE_PATH = join(process.cwd(), 'public/data/songs/maxtrax', 'contraptionzack-march.mxtx');

function loadFixtureBytes(): Uint8Array {
  const nodeBuffer = readFileSync(FIXTURE_PATH);
  const ab = new ArrayBuffer(nodeBuffer.byteLength);
  new Uint8Array(ab).set(nodeBuffer);
  return new Uint8Array(ab);
}

afterEach(() => {
  useFormatStore.getState().setMaxTraxData(null);
});

describe('MaxTrax project persistence — edits survive save + reload', () => {
  it('re-encodes the live model on save and re-parses it on restore', () => {
    const bytes = loadFixtureBytes();
    const scoreIdx = 0;

    // Edit a note duration to a recognisable sentinel in the live model.
    const edited = parseMaxTrax(bytes);
    const noteIdx = edited.scores[scoreIdx].events.findIndex((e) => e.command <= 0x7f);
    expect(noteIdx).toBeGreaterThanOrEqual(0);
    edited.scores[scoreIdx] = setNoteDuration(edited.scores[scoreIdx], noteIdx, 999);

    // Sentinel must differ from the pristine bytes so a non-re-encoded save fails.
    expect(parseMaxTrax(bytes).scores[scoreIdx].events[noteIdx].stopTime).not.toBe(999);

    // Simulate an in-editor edit sitting in the store.
    useFormatStore.getState().setMaxTraxData(edited);

    // SAVE: collect the persisted native-engine binaries.
    const nativeData = getNativeEngineDataForExport();
    expect(nativeData).not.toBeNull();
    expect(nativeData!.maxTraxFileData).toBeDefined();

    // Clear the store (simulate a fresh session before reload).
    useFormatStore.getState().setMaxTraxData(null);

    // RELOAD: restore from the persisted binaries.
    restoreNativeEngineData(nativeData!, undefined);

    const restored = useFormatStore.getState();
    expect(restored.editorMode).toBe('maxtrax');
    expect(restored.maxTraxData).not.toBeNull();
    expect(restored.maxTraxData!.scores[scoreIdx].events[noteIdx].stopTime).toBe(999);
  });
});
