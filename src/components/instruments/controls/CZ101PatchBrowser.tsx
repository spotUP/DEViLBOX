/**
 * The CZ-101's patch handling in one place: the factory bank and the User patches imported from Casio SysEx dumps.
 * The Hardware UI and the Simple UI both use it, so the load button is in either view.
 */
import React, { useRef, useState } from 'react';
import { CZ101_PRESET_BANK, cz101PresetParameters, cz101PatchParameters } from '@engine/cz101/cz101Presets';
import { decodeCzSysexFile } from '@engine/cz101/cz101Sysex';
import type { CZPatch } from '@engine/cz101/cz101Types';
import { useCz101UserPatchStore } from '@stores/useCz101UserPatchStore';
import { notify } from '@stores/useNotificationStore';
import { Button } from '@components/ui/Button';

export function useCz101Patches(parameters: Record<string, number>, onParamChange: (key: string, value: number) => void) {
  const program = typeof parameters._program === 'number' ? parameters._program : 0;
  const userPatchId = typeof parameters._userPatch === 'number' ? parameters._userPatch : 0;
  const userPatches = useCz101UserPatchStore((state) => state.patches);
  const addPatches = useCz101UserPatchStore((state) => state.addPatches);
  const removePatch = useCz101UserPatchStore((state) => state.removePatch);
  const activeUser = userPatchId > 0 ? userPatches.find((entry) => entry.id === userPatchId) : undefined;
  const current = activeUser ? { patch: activeUser.patch } : (CZ101_PRESET_BANK[program] ?? CZ101_PRESET_BANK[0]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const chooseFactory = (index: number) => {
    // _program first (the synth swaps its patch), then the knob values the preset implies
    const implied = cz101PresetParameters(index);
    onParamChange('_userPatch', 0);
    onParamChange('_program', index);
    for (const [key, value] of Object.entries(implied)) {
      if (key !== '_program') onParamChange(key, value);
    }
  };

  const chooseUser = (id: number) => {
    const entry = userPatches.find((candidate) => candidate.id === id);
    if (!entry) return;
    onParamChange('_userPatch', id);
    for (const [key, value] of Object.entries(cz101PatchParameters(entry.patch))) onParamChange(key, value);
  };

  const importFiles = async (files: File[]) => {
    const decoded: CZPatch[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const result = decodeCzSysexFile(new Uint8Array(await file.arrayBuffer()), file.name);
      result.patches.forEach((entry) => decoded.push(entry.patch));
      errors.push(...result.errors);
    }
    if (errors.length > 0) notify.error(`Not loaded: ${errors.join('; ')}`);
    if (decoded.length === 0) return;
    const ids = addPatches(decoded);
    notify.success(`Loaded ${decoded.length} CZ patch${decoded.length === 1 ? '' : 'es'} into User`);
    // The last imported patch becomes the sound, so the import is audible straight away
    const last = decoded[decoded.length - 1];
    onParamChange('_userPatch', ids[ids.length - 1]);
    for (const [key, value] of Object.entries(cz101PatchParameters(last))) onParamChange(key, value);
  };

  const onFilesPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) void importFiles(files);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void importFiles(files);
  };


  return { program, userPatchId, userPatches, activeUser, current, fileInput, dragOver, setDragOver, chooseFactory, chooseUser, onFilesPicked, onDrop, removePatch };
}

/** The Factory and User patch picker with the SysEx load button, in the design-system look (the Simple UI). */
export const CZ101PatchBrowser: React.FC<{
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}> = ({ parameters, onParamChange }) => {
  const p = useCz101Patches(parameters, onParamChange);
  return (
    <div className="flex flex-col gap-2 rounded border border-dark-border bg-dark-bgSecondary p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Factory</div>
      <div className="flex flex-wrap gap-1">
        {CZ101_PRESET_BANK.map((entry, index) => (
          <Button key={entry.patch.name} size="sm" variant={!p.activeUser && index === p.program ? 'primary' : 'default'} onClick={() => p.chooseFactory(index)}>
            {entry.patch.name}
          </Button>
        ))}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">User</div>
      <div
        data-sample-drop-zone
        onDragOver={(event) => { event.preventDefault(); p.setDragOver(true); }}
        onDragLeave={() => p.setDragOver(false)}
        onDrop={p.onDrop}
        className={`rounded border border-dashed p-2 ${p.dragOver ? 'border-accent-primary bg-accent-primary/10' : 'border-dark-borderLight'}`}
      >
        {p.userPatches.length === 0 ? (
          <div className="mb-2 text-center text-[10px] font-mono text-text-secondary">
            No user patches yet. Load Casio CZ single-patch SysEx files (.syx from a CZ-101, CZ-1000, CZ-3000 or CZ-5000), or drop them here.
          </div>
        ) : (
          <div className="mb-2 flex flex-wrap gap-1">
            {p.userPatches.map((entry) => (
              <Button key={entry.id} size="sm" variant={entry.id === p.userPatchId ? 'primary' : 'default'} onClick={() => p.chooseUser(entry.id)}>
                {entry.name}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-1">
          <Button size="sm" variant="primary" onClick={() => p.fileInput.current?.click()}>Load SysEx File(s)</Button>
          {p.activeUser && (
            <Button size="sm" onClick={() => { p.removePatch(p.activeUser!.id); p.chooseFactory(0); }}>Remove This Patch</Button>
          )}
        </div>
        <input ref={p.fileInput} type="file" accept=".syx,audio/sysex,application/octet-stream" multiple className="hidden" onChange={p.onFilesPicked} />
      </div>
    </div>
  );
};
