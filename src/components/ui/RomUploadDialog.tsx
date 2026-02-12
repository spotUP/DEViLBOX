/**
 * RomUploadDialog - Modal for uploading ROM files when auto-load fails
 *
 * Appears when a ROM-dependent MAME synth (TR-707, C352, etc.) can't find
 * its ROM files in /public/roms/. Lets the user upload the ROM ZIP directly.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Modal } from './Modal';
import { ModalHeader } from './ModalHeader';
import { ModalFooter } from './ModalFooter';
import { useRomDialogStore } from '@/stores/useRomDialogStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';
import { HardDrive, Upload, Check, X, AlertTriangle } from 'lucide-react';
import JSZip from 'jszip';

export const RomUploadDialog: React.FC = () => {
  const { pendingRomRequest, dismissRomDialog } = useRomDialogStore();
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const instruments = useInstrumentStore((s) => s.instruments);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingRomRequest) return;

    setUploading(true);
    setError(null);

    try {
      const engine = getToneEngine();
      const { instrumentId, synthType } = pendingRomRequest;

      if (file.name.toLowerCase().endsWith('.zip')) {
        // Extract files from ZIP and load as ROM banks
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
        // Single file upload
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

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [pendingRomRequest, instruments, updateInstrument, dismissRomDialog]);

  const handleDismiss = useCallback(() => {
    dismissRomDialog();
    setSuccess(false);
    setError(null);
    setUploading(false);
  }, [dismissRomDialog]);

  if (!pendingRomRequest) return null;

  const { chipName, requiredZip } = pendingRomRequest;

  return (
    <Modal
      isOpen={true}
      onClose={handleDismiss}
      size="md"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <ModalHeader
        title="ROM Required"
        subtitle={`${chipName} needs ROM data to produce sound`}
        icon={<HardDrive className="w-6 h-6 text-amber-400" />}
      />

      <div className="p-4 space-y-4">
        {/* Explanation */}
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-white">
                This synth requires ROM files that couldn't be loaded automatically.
              </p>
              <p className="mt-2 text-dark-text-secondary">
                Without ROMs, the synth will be silent. You can upload the ROM file
                below, or place it in <code className="text-amber-300 bg-black/30 px-1 rounded">/public/roms/</code> for auto-loading.
              </p>
            </div>
          </div>
        </div>

        {/* Expected file */}
        <div className="bg-dark-surface rounded-lg p-3">
          <div className="text-xs text-dark-text-secondary uppercase tracking-wider mb-1">
            Expected ROM file
          </div>
          <div className="font-mono text-sm text-amber-300">
            {requiredZip}
          </div>
        </div>

        {/* Upload area */}
        <div className="flex flex-col items-center gap-3">
          {success ? (
            <div className="flex items-center gap-2 text-green-400 py-4">
              <Check size={20} />
              <span className="font-medium">ROMs loaded successfully!</span>
            </div>
          ) : (
            <label className="w-full cursor-pointer">
              <div className={`
                border-2 border-dashed rounded-lg p-6
                flex flex-col items-center gap-2 transition-colors
                ${uploading
                  ? 'border-amber-500/50 bg-amber-900/10'
                  : 'border-dark-border hover:border-amber-400/50 hover:bg-amber-900/5'}
              `}>
                <Upload size={24} className={uploading ? 'text-amber-400 animate-pulse' : 'text-dark-text-secondary'} />
                <span className="text-sm text-dark-text-secondary">
                  {uploading ? 'Loading ROM...' : 'Click to upload ROM file (.zip or raw ROM)'}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.bin,.rom,.vsm"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded px-3 py-2 w-full">
              {error}
            </div>
          )}
        </div>
      </div>

      <ModalFooter>
        <div className="flex justify-end w-full">
          <button
            onClick={handleDismiss}
            className="flex items-center gap-2 px-4 py-2 bg-dark-surface hover:bg-dark-hover rounded transition-colors"
          >
            <X size={16} />
            <span>{success ? 'Close' : 'Skip'}</span>
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
