/**
 * SunVoxPatchLoader — Load Patch action for the SunVox instrument editor.
 * Applies a .sunsynth file to THIS instrument (SunVoxImportDialog creates a new one).
 */
import React, { useRef } from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';
import { Button } from '@components/ui/Button';
import { notify } from '@stores/useNotificationStore';
import { sunvoxPatchConfigFromFile, SUNVOX_PATCH_ACCEPT } from '@/engine/sunvox/sunvoxPatchConfig';

export interface SunVoxPatchLoaderProps {
  hasPatch: boolean;
  onLoad: (config: SunVoxConfig) => void;
}

export const SunVoxPatchLoader: React.FC<SunVoxPatchLoaderProps> = ({ hasPatch, onLoad }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { config } = await sunvoxPatchConfigFromFile(file);
      onLoad(config);
    } catch (err) {
      notify.error(`Could not read SunVox patch: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="mt-3">
      {!hasPatch && (
        <p className="mb-2 text-xs text-accent-warning">
          This instrument is silent until a patch is loaded.
        </p>
      )}
      <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}>
        Load Patch
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={SUNVOX_PATCH_ACCEPT}
        onChange={handleFile}
        className="hidden"
        data-testid="sunvox-patch-input"
      />
    </div>
  );
};
