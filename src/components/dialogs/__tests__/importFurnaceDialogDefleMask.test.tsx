/**
 * "drag and dropping them dont work" (2026-09-25) — DefleMask files.
 *
 * A dropped .dmf opens ImportFurnaceDialog. Its preview parsed the file with
 * the TypeScript .fur parser, which refuses DefleMask's magic ("Invalid
 * Furnace file header: .DelekDefleMask."), so the dialog showed that error
 * and kept Import disabled — although the import itself (the Furnace WASM
 * loader) plays the file. The preview now reads through that same loader.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installFurnaceFileOpsWasm, readSong } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { ImportFurnaceDialog } from '../ImportFurnaceDialog';

afterEach(cleanup);

describe('dropping a DefleMask file', { timeout: 60000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('previews the song and imports it', async () => {
    const file = new File([readSong('deflemask/220hertz/Andrew_haggles.dmf')], 'Andrew_haggles.dmf');
    const onImport = vi.fn();
    render(<ImportFurnaceDialog isOpen onClose={() => {}} onImport={onImport} initialFile={file} />);

    await screen.findByText('DefleMask', undefined, { timeout: 20000 });
    expect(screen.queryByText(/Invalid Furnace file header/)).toBeNull();
    // Furnace's own chip names, one per system of a DefleMask Genesis song.
    expect(screen.getByText(/YM2612/)).toBeTruthy();
    expect(screen.getByText(/SN76489/)).toBeTruthy();

    const importButton = screen.getByText('Import Module').closest('button')!;
    await waitFor(() => expect(importButton.disabled).toBe(false));
    fireEvent.click(importButton);
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0].metadata.channels).toBe(10);
  });
});
