/**
 * ImportDialogHost - the one place the song import dialogs are mounted.
 *
 * openSong asks it (a drop or a file browser pick whose file has a real choice:
 * importChoice, owner decision D1) through useImportRequestStore, or the
 * toolbar opens it empty and the person picks a file inside. The dialog's
 * Import hands its choices back to the open that asked, or - opened empty - to
 * a new openSong. It writes no settings (D4). Furnace and MIDI files get their
 * own dialog because they take their own settings.
 */
import React, { useCallback } from 'react';
import { ImportModuleDialog, type ImportOptions } from '@components/dialogs/ImportModuleDialog';
import { ImportFurnaceDialog } from '@components/dialogs/ImportFurnaceDialog';
import { ImportMIDIDialog } from '@components/dialogs/ImportMIDIDialog';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import { openSong } from '@/lib/song/openSong';
import { reportLoadFailure } from '@/lib/song/reportLoadFailure';
import { useImportRequestStore, answerImportRequest } from '@/lib/song/importRequest';
import { notify } from '@stores/useNotificationStore';

export interface ImportDialogHostProps {
  /** The toolbar's "Import module" opened it empty. */
  open: boolean;
  onClose: () => void;
}

export const ImportDialogHost: React.FC<ImportDialogHostProps> = ({ open, onClose }) => {
  const request = useImportRequestStore((state) => state.request);
  const isOpen = open || !!request;
  const fileName = request?.prepared.file.name ?? '';

  const close = useCallback(() => {
    answerImportRequest(null);
    onClose();
  }, [onClose]);

  const importChosen = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    if (useImportRequestStore.getState().request) {
      answerImportRequest({ info, options });
      return;
    }
    const file = info.file;
    if (!file) { notify.error('File reference lost - cannot import'); return; }
    const result = await openSong(
      { kind: 'prepared', file, songKind: 'module', companions: options.companionFiles, info, uadeMetadata: options.uadeMetadata },
      { origin: 'dialog', subsong: options.subsong, useLibopenmpt: options.useLibopenmpt, midiOptions: options.midiOptions },
    );
    // A toast the user can select and copy from, kept until closed (duration 0).
    if (!result.ok && !result.cancelled) reportLoadFailure(`${file.name}: ${result.error}`);
  }, []);

  if (/\.(fur|dmf)$/i.test(fileName)) {
    return <ImportFurnaceDialog isOpen={isOpen} onClose={close} onImport={importChosen} initialFile={request?.prepared.file ?? null} />;
  }
  if (/\.(mid|midi)$/i.test(fileName)) {
    return <ImportMIDIDialog isOpen={isOpen} onClose={close} onImport={importChosen} initialFile={request?.prepared.file ?? null} />;
  }
  return (
    <ImportModuleDialog
      isOpen={isOpen}
      onClose={close}
      onImport={importChosen}
      initialFile={request?.prepared.file ?? null}
      initialPrepared={request?.prepared ?? null}
      companionFiles={request?.companionFiles}
    />
  );
};
