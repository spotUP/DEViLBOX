/**
 * PatchLoadButton - the one "Load Patch" control for every synth with a bundled patch folder.
 *
 * Opens the in-app FileBrowser in pick-file mode at the synth's own folder (SYNTH_PATCH_DIRS, one map for
 * every synth); its From Disk button reaches the OS picker with the same extension list. Both routes hand
 * the file's bytes and name to onLoad; the synth panel decides how to parse and apply them.
 */
import React from 'react';
import type { SynthType } from '@typedefs/instrument';
import { Button } from '@components/ui/Button';
import { usePatchPicker } from './usePatchPicker';

export interface PatchLoadButtonProps {
  synthType: SynthType;
  onLoad: (buffer: ArrayBuffer, fileName: string) => void | Promise<void>;
  busy?: boolean;
  label?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
}

export const PatchLoadButton: React.FC<PatchLoadButtonProps> = ({
  synthType, onLoad, busy = false, label = 'Load Patch', variant,
}) => {
  const { openPicker, picker } = usePatchPicker(synthType, onLoad);
  return (
    <>
      <Button size="sm" variant={variant} loading={busy} onClick={openPicker}>
        {label}
      </Button>
      {picker}
    </>
  );
};
