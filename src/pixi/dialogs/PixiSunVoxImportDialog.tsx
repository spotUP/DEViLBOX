/**
 * PixiSunVoxImportDialog — GL-native SunSynth patch import dialog.
 * (.sunvox song files are loaded directly via UnifiedFileLoader, no dialog needed.)
 * DOM reference: src/components/instruments/SunVoxImportDialog.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import type { SunVoxConfig } from '@typedefs/instrument';

interface PendingImport {
  name: string;
  config: SunVoxConfig;
}

interface PixiSunVoxImportDialogProps {
  onClose: () => void;
  onImport: (name: string, config: SunVoxConfig) => void;
  initialFile?: File;
}

const MODAL_W = 380;
const MODAL_H = 200;

export const PixiSunVoxImportDialog: React.FC<PixiSunVoxImportDialogProps> = ({
  onClose,
  onImport,
  initialFile,
}) => {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Auto-load the initial file when provided (drag-drop path)
  useEffect(() => {
    if (!initialFile) return;
    const name = initialFile.name.replace(/\.sunsynth$/i, '');
    setFilename(initialFile.name);

    const load = async () => {
      try {
        const buffer = await initialFile.arrayBuffer();
        const config: SunVoxConfig = { patchData: buffer, patchName: name, isSong: false, controlValues: {} };
        setPending({ name, config });
        setError(null);
      } catch (err) {
        setPending(null);
        setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void load();
  }, [initialFile]);

  const handleImport = useCallback(() => {
    if (!pending) return;
    onImport(pending.name, pending.config);
    onClose();
  }, [pending, onImport, onClose]);

  return (
    <PixiModal isOpen={true} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import SunSynth Patch" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 8 }}>
        {filename && !error && (
          <PixiLabel text={filename} size="xs" color="textSecondary" />
        )}
        {filename && !error && (
          <PixiLabel text="SunSynth patch file detected" size="xs" color="textMuted" />
        )}
        {error && (
          <PixiLabel text={error} size="xs" color="error" layout={{ maxWidth: MODAL_W - 26 }} />
        )}
        {!filename && !error && (
          <PixiLabel text="No file provided." size="xs" color="textMuted" />
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton
          label="Import"
          variant="primary"
          disabled={pending === null}
          onClick={handleImport}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
