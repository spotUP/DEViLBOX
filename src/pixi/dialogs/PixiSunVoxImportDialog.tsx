/**
 * PixiSunVoxImportDialog — GL-native SunVox import dialog.
 * Detects .sunsynth (patch) vs .sunvox (song), reads file buffer, calls onImport.
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
    const name = initialFile.name.replace(/\.(sunsynth|sunvox)$/i, '');
    const isSong = initialFile.name.toLowerCase().endsWith('.sunvox');
    setFilename(initialFile.name);

    if (isSong) {
      setPending({ name, config: { patchData: new ArrayBuffer(0), patchName: name, isSong: true, controlValues: {} } });
      return;
    }

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

  const isSong = (initialFile?.name ?? filename).toLowerCase().endsWith('.sunvox');

  const handleImport = useCallback(() => {
    if (isSong && initialFile) {
      const name = initialFile.name.replace(/\.(sunsynth|sunvox)$/i, '');
      onImport(name, { patchData: new ArrayBuffer(0), patchName: name, isSong: true, controlValues: {} });
      onClose();
      return;
    }
    if (!pending) return;
    onImport(pending.name, pending.config);
    onClose();
  }, [isSong, initialFile, pending, onImport, onClose]);

  const title = isSong ? 'Load SunVox Song' : 'Import SunSynth Patch';

  return (
    <PixiModal isOpen={true} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title={title} onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 8 }}>
        {/* Filename */}
        {filename && !error && (
          <PixiLabel text={filename} size="xs" color="textSecondary" />
        )}

        {/* File type info */}
        {filename && !error && (
          <PixiLabel
            text={isSong ? 'SunVox song file detected' : 'SunSynth patch file detected'}
            size="xs"
            color="textMuted"
          />
        )}

        {/* Error display */}
        {error && (
          <PixiLabel text={error} size="xs" color="error" layout={{ maxWidth: MODAL_W - 26 }} />
        )}

        {/* No file prompt */}
        {!filename && !error && (
          <PixiLabel text="No file provided." size="xs" color="textMuted" />
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton
          label="Import"
          variant="primary"
          disabled={!isSong && pending === null}
          onClick={handleImport}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
