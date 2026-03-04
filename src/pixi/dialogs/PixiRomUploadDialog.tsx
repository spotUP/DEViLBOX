/**
 * PixiRomUploadDialog — GL-native version of DOM RomUploadDialog.
 * ROM file upload for synth emulators (MAME, etc.).
 * Accepts .zip, .bin, .rom, .vsm files with ZIP extraction via JSZip.
 * DOM reference: src/components/ui/RomUploadDialog.tsx
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { pickFile } from '../services/glFilePicker';
import { useRomDialogStore } from '@/stores/useRomDialogStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';
import JSZip from 'jszip';

const MODAL_W = 460;
const MODAL_H = 380;

export const PixiRomUploadDialog: React.FC = () => {
  const { pendingRomRequest, dismissRomDialog } = useRomDialogStore();
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const instruments = useInstrumentStore((s) => s.instruments);
  const theme = usePixiTheme();

  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    if (!pendingRomRequest || uploading) return;

    const file = await pickFile({ accept: '.zip,.bin,.rom,.vsm' });
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const engine = getToneEngine();
      const { instrumentId, synthType } = pendingRomRequest;

      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        const files: { name: string; entry: JSZip.JSZipObject }[] = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const isMetadata = relativePath.toLowerCase().match(/\.(txt|md|pdf|url|inf)$/);
          if (!zipEntry.dir && !isMetadata) {
            files.push({ name: relativePath, entry: zipEntry });
          }
        });

        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        for (let i = 0; i < files.length; i++) {
          const fileData = await files[i].entry.async('uint8array');
          engine.loadSynthROM(instrumentId, synthType, i, fileData);
          console.log(`[RomUpload] Loaded ${files[i].name} into bank ${i} (${fileData.length} bytes)`);
        }
      } else {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        engine.loadSynthROM(instrumentId, synthType, 0, data);
        console.log(`[RomUpload] Loaded ${file.name} (${data.length} bytes)`);
      }

      // Update instrument store to reflect ROM loaded
      const inst = instruments.find(i => i.id === instrumentId);
      if (inst) {
        updateInstrument(instrumentId, {
          parameters: { ...inst.parameters, _romsLoaded: 1 },
        });
      }

      setSuccess(true);
      setTimeout(() => {
        dismissRomDialog();
        setSuccess(false);
        setUploading(false);
      }, 1200);
    } catch (err) {
      console.error('[RomUpload] Failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ROM file');
      setUploading(false);
    }
  }, [pendingRomRequest, uploading, instruments, updateInstrument, dismissRomDialog]);

  const handleDismiss = useCallback(() => {
    dismissRomDialog();
    setSuccess(false);
    setError(null);
    setUploading(false);
  }, [dismissRomDialog]);

  const chipName = pendingRomRequest?.chipName ?? '';
  const requiredZip = pendingRomRequest?.requiredZip ?? '';

  return (
    <PixiModal isOpen={!!pendingRomRequest} onClose={handleDismiss} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="ROM Required" onClose={handleDismiss} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        {/* Chip name subtitle */}
        <PixiLabel text={`${chipName} needs ROM data to produce sound`} size="sm" color="warning" />

        {/* Warning box */}
        <layoutContainer
          layout={{
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: 0x2A1A00,
            borderColor: 0x7F5F00,
            flexDirection: 'column',
            gap: 6,
            width: MODAL_W - 26,
          }}
        >
          <PixiLabel
            text="This synth requires ROM files that couldn't be loaded automatically."
            size="xs"
            color="text"
            layout={{ maxWidth: MODAL_W - 50 }}
          />
          <PixiLabel
            text="Without ROMs, the synth will be silent. Upload the ROM file below, or place it in /public/roms/ for auto-loading."
            size="xs"
            color="textSecondary"
            layout={{ maxWidth: MODAL_W - 50 }}
          />
        </layoutContainer>

        {/* Expected file */}
        <layoutContainer
          layout={{
            padding: 10,
            borderRadius: 6,
            backgroundColor: theme.bgTertiary.color,
            flexDirection: 'column',
            gap: 4,
            width: MODAL_W - 26,
          }}
        >
          <PixiLabel text="EXPECTED ROM FILE" size="xs" color="textMuted" />
          <PixiLabel text={requiredZip} size="sm" font="mono" weight="semibold" color="warning" />
        </layoutContainer>

        {/* Upload area */}
        {success ? (
          <layoutContainer
            layout={{
              width: MODAL_W - 26,
              height: 56,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <PixiLabel text="✓" size="lg" color="success" />
            <PixiLabel text="ROMs loaded successfully!" size="sm" weight="semibold" color="success" />
          </layoutContainer>
        ) : (
          <layoutContainer
            layout={{
              width: MODAL_W - 26,
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: 16,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: uploading ? 0x7F5F00 : theme.border.color,
              backgroundColor: uploading ? 0x1A1400 : 0x000000,
            }}
          >
            <PixiLabel
              text={uploading ? 'Loading ROM...' : 'Click Browse to upload ROM file (.zip or raw ROM)'}
              size="xs"
              color="textSecondary"
            />
            <PixiButton
              label={uploading ? 'Loading...' : 'Browse...'}
              variant="primary"
              disabled={uploading}
              loading={uploading}
              onClick={handleBrowse}
              width={120}
            />
          </layoutContainer>
        )}

        {/* Error message */}
        {error && (
          <layoutContainer
            layout={{
              padding: 8,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x3B1515,
              borderColor: 0x7F2020,
              width: MODAL_W - 26,
            }}
          >
            <PixiLabel text={error} size="xs" color="error" layout={{ maxWidth: MODAL_W - 50 }} />
          </layoutContainer>
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label={success ? 'Close' : 'Skip'} variant="default" onClick={handleDismiss} />
      </PixiModalFooter>
    </PixiModal>
  );
};
