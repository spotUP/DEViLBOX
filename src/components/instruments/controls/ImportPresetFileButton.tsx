/**
 * ImportPresetFileButton - the one "Import Preset File" control for VSTBridge synths.
 *
 * Reads the chosen file and hands its bytes to onImport; the synth panel decides how to load them
 * (Vital: .vital JSON, Odin2: .odin state; both go through the synth's 'loadPreset' command).
 */
import React, { useCallback, useRef } from 'react';
import { Button } from '@components/ui/Button';

export interface ImportPresetFileButtonProps {
  /** File extensions the picker offers, e.g. ".vital". */
  accept: string;
  busy?: boolean;
  onImport: (bytes: Uint8Array, fileName: string) => void | Promise<void>;
  label?: string;
}

export const ImportPresetFileButton: React.FC<ImportPresetFileButtonProps> = ({
  accept, busy = false, onImport, label = 'Import Preset File',
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onImport(new Uint8Array(await file.arrayBuffer()), file.name);
  }, [onImport]);

  return (
    <>
      <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
        {label}
      </Button>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
    </>
  );
};
