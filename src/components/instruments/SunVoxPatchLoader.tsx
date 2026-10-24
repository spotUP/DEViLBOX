/**
 * SunVoxPatchLoader — Load Patch action for the SunVox instrument editor.
 * Applies a .sunsynth file to THIS instrument (SunVoxImportDialog creates a new one).
 */
import React from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';
import { notify } from '@stores/useNotificationStore';
import { sunvoxPatchConfigFromFile } from '@/engine/sunvox/sunvoxPatchConfig';
import { PatchLoadButton } from './controls/PatchLoadButton';

export interface SunVoxPatchLoaderProps {
  hasPatch: boolean;
  onLoad: (config: SunVoxConfig) => void;
}

export const SunVoxPatchLoader: React.FC<SunVoxPatchLoaderProps> = ({ hasPatch, onLoad }) => {
  const handleFile = async (buffer: ArrayBuffer, fileName: string) => {
    try {
      const { config } = await sunvoxPatchConfigFromFile(new File([buffer], fileName));
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
      <PatchLoadButton synthType="SunVoxSynth" variant="primary" onLoad={handleFile} />
    </div>
  );
};
