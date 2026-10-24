/**
 * usePatchPicker - the open-state plus the pick-mode FileBrowser behind every patch-load control.
 *
 * PatchLoadButton renders it with a design-system Button; a panel with its own styled button (CZ-101
 * hardware face) or a non-React trigger (the Dexed JUCE cart button) calls openPicker() itself and renders
 * `picker`. One code path for the folder, extensions and byte hand-off (SYNTH_PATCH_DIRS).
 */
import React, { useState } from 'react';
import type { SynthType } from '@typedefs/instrument';
import { FileBrowser } from '@components/dialogs/FileBrowser';
import { SYNTH_PATCH_DIRS } from '@constants/synthPatchDirs';

export function usePatchPicker(
  synthType: SynthType,
  onLoad: (buffer: ArrayBuffer, fileName: string) => void | Promise<void>,
): { openPicker: () => void; picker: React.ReactNode } {
  const [open, setOpen] = useState(false);
  const entry = SYNTH_PATCH_DIRS[synthType];
  if (!entry) throw new Error(`usePatchPicker: no patch folder mapped for ${synthType} (add it to synthPatchDirs.ts)`);
  const picker = open ? (
    <FileBrowser
      isOpen
      mode="load"
      onClose={() => setOpen(false)}
      startDir={entry.dir}
      extensions={entry.extensions}
      onPickFile={onLoad}
    />
  ) : null;
  return { openPicker: () => setOpen(true), picker };
}
