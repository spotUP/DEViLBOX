/**
 * The "ROM Required" dialog reported "ROMs loaded successfully" for an MU2000 (MAMESWP30) upload although
 * nothing was saved: cacheUploadedRom resolves false for a synth type with no ROM cache config, and the
 * dialog ignored the result, so the next session asked for the ROM again. Success now means the ROM is
 * also saved for the next session; otherwise the dialog says it is loaded for this session only.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react';

const loadSynthROM = vi.fn();
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({ loadSynthROM }) }));

import { RomUploadDialog } from '../RomUploadDialog';
import { useRomDialogStore } from '@/stores/useRomDialogStore';
import { TR707_ROM_CONFIG } from '@engine/mame/MAMEROMLoader';

function openFor(synthType: string) {
  useRomDialogStore.getState().showRomDialog({ instrumentId: 1, synthType, chipName: synthType, requiredZip: 'x.zip', bankCount: 1 });
  render(<RomUploadDialog />);
}

function upload(name: string, bytes: Uint8Array<ArrayBuffer>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([bytes], name)] } });
}

describe('ROM upload dialog reports whether the ROM is saved for next time', () => {
  afterEach(() => { cleanup(); useRomDialogStore.getState().dismissRomDialog(); loadSynthROM.mockClear(); });

  it('an upload for a synth with no ROM cache loads for the session and says it is not saved', async () => {
    openFor('MAMESWP30');
    upload('mu100.bin', new Uint8Array([1, 2, 3, 4]));
    await waitFor(() => expect(screen.getByText(/not saved for next time/)).toBeTruthy());
    expect(loadSynthROM).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/loaded successfully/)).toBeNull();
  });

  it('an upload that is cached reports success', async () => {
    openFor('MAMETR707');
    upload('tr707.bin', new Uint8Array(TR707_ROM_CONFIG.combinedSize ?? 0x20000));
    await waitFor(() => expect(screen.getByText(/loaded successfully/)).toBeTruthy());
    expect(screen.queryByText(/not saved for next time/)).toBeNull();
  });
});
