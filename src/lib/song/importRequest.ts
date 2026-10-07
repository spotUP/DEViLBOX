/**
 * importRequest - the question openSong asks a person, and the answer.
 *
 * openSong (interactive origin, a real choice per importChoice) calls
 * askImportDialog and awaits it; the one ImportModuleDialog mount in
 * TrackerView shows the request and answers it. A caller no longer carries a
 * 'pending' state around: it awaits the whole open.
 */
import { create } from 'zustand';
import type { ModuleInfo } from '@lib/import/ModuleLoader';
import type { ImportOptions } from '@components/dialogs/ImportModuleDialog';
import type { PreparedSong } from '@/lib/song/openSong';

/** What the person chose: the dialog's module info (when it read the file itself) and the options. */
export interface ImportAnswer {
  info?: ModuleInfo;
  options: ImportOptions;
}

export interface ImportRequest {
  prepared: PreparedSong;
  /** The partner files in hand, named by their path relative to the song. */
  companionFiles: File[];
  resolve: (answer: ImportAnswer | null) => void;
}

interface ImportRequestState {
  request: ImportRequest | null;
}

export const useImportRequestStore = create<ImportRequestState>(() => ({ request: null }));

/** Ask the person. Resolves with their answer, or null when they cancel (or a newer request replaces this one). */
export function askImportDialog(prepared: PreparedSong): Promise<ImportAnswer | null> {
  useImportRequestStore.getState().request?.resolve(null);
  return new Promise((resolve) => {
    const companionFiles = prepared.companions
      ? Array.from(prepared.companions, ([name, data]) => new File([data], name))
      : [];
    useImportRequestStore.setState({ request: { prepared, companionFiles, resolve } });
  });
}

/** The dialog's answer; null = cancelled. */
export function answerImportRequest(answer: ImportAnswer | null): void {
  const request = useImportRequestStore.getState().request;
  if (!request) return;
  useImportRequestStore.setState({ request: null });
  request.resolve(answer);
}
