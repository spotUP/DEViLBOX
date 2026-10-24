/**
 * The CZ-101's patch handling in one place: the factory bank and the User patches imported from Casio SysEx dumps.
 * The Hardware UI and the Simple UI both use it, so the load button is in either view.
 */
import React, { useEffect, useState } from 'react';
import { CZ101_PRESET_BANK, cz101PresetParameters, cz101PatchParameters } from '@engine/cz101/cz101Presets';
import { CZ101_TONE_NAME_PARAM, CZ101_TONE_PARAM, czToneFromBase64, czToneToBase64, decodeCzSysexFile, decodeCzTone } from '@engine/cz101/cz101Sysex';
import { adoptCz101Tone, useCz101UserPatchStore } from '@stores/useCz101UserPatchStore';
import { notify } from '@stores/useNotificationStore';
import { Button } from '@components/ui/Button';
import { PatchLoadButton } from '@components/instruments/controls/PatchLoadButton';

/**
 * `onTextParamChange` carries the instrument's own patch (`_cz101Tone`, the 128 tone bytes in base64, and its
 * name): the instrument holds the sound, so a saved song plays it on any browser; the User library only lists it.
 */
export function useCz101Patches(
  parameters: Record<string, number>,
  onParamChange: (key: string, value: number) => void,
  onTextParamChange?: (key: string, value: string) => void,
) {
  const stored = parameters as Record<string, unknown>;
  const program = typeof parameters._program === 'number' ? parameters._program : 0;
  const ownTone = typeof stored[CZ101_TONE_PARAM] === 'string' ? (stored[CZ101_TONE_PARAM] as string) : '';
  const ownName = typeof stored[CZ101_TONE_NAME_PARAM] === 'string' ? (stored[CZ101_TONE_NAME_PARAM] as string) : '';
  const userPatches = useCz101UserPatchStore((state) => state.patches);
  const addTones = useCz101UserPatchStore((state) => state.addTones);
  const removePatch = useCz101UserPatchStore((state) => state.removePatch);
  const activeUser = ownTone ? userPatches.find((entry) => entry.tone === ownTone) : undefined;
  const ownPatch = (() => {
    if (!ownTone) return undefined;
    try { return decodeCzTone(czToneFromBase64(ownTone), ownName).patch; } catch { return undefined; }
  })();
  const current = ownPatch ? { patch: ownPatch } : (CZ101_PRESET_BANK[program] ?? CZ101_PRESET_BANK[0]);
  const [dragOver, setDragOver] = useState(false);

  // A song that carries a patch lists it in this browser's User library
  useEffect(() => {
    if (ownPatch) adoptCz101Tone(ownName || 'CZ patch', ownTone);
  }, [ownPatch, ownName, ownTone]);

  const chooseFactory = (index: number) => {
    // _program first (the synth swaps its patch), then the knob values the preset implies
    const implied = cz101PresetParameters(index);
    onTextParamChange?.(CZ101_TONE_PARAM, '');
    onTextParamChange?.(CZ101_TONE_NAME_PARAM, '');
    onParamChange('_program', index);
    for (const [key, value] of Object.entries(implied)) {
      if (key !== '_program') onParamChange(key, value);
    }
  };

  /** Make a tone the instrument's own sound: the name first (the synth names the patch when the tone arrives), then the knobs it implies. */
  const selectTone = (name: string, tone: string) => {
    onTextParamChange?.(CZ101_TONE_NAME_PARAM, name);
    onTextParamChange?.(CZ101_TONE_PARAM, tone);
    try {
      for (const [key, value] of Object.entries(cz101PatchParameters(decodeCzTone(czToneFromBase64(tone), name).patch))) onParamChange(key, value);
    } catch { /* an unusable tone: the synth ignores it too */ }
  };

  const chooseUser = (id: number) => {
    const entry = userPatches.find((candidate) => candidate.id === id);
    if (entry) selectTone(entry.name, entry.tone);
  };

  const importFiles = async (files: File[]) => {
    const decoded: { name: string; tone: string }[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const result = decodeCzSysexFile(new Uint8Array(await file.arrayBuffer()), file.name);
      result.patches.forEach((entry) => decoded.push({ name: entry.patch.name ?? file.name, tone: czToneToBase64(entry.tone) }));
      errors.push(...result.errors);
    }
    if (errors.length > 0) notify.error(`Not loaded: ${errors.join('; ')}`);
    if (decoded.length === 0) return;
    addTones(decoded);
    notify.success(`Loaded ${decoded.length} CZ patch${decoded.length === 1 ? '' : 'es'} into User`);
    // The last imported patch becomes the sound, so the import is audible straight away
    const last = decoded[decoded.length - 1];
    selectTone(last.name, last.tone);
  };

  const onPatchLoaded = (buffer: ArrayBuffer, name: string) => { void importFiles([new File([buffer], name)]); };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void importFiles(files);
  };


  return { program, ownPatch, userPatches, activeUser, current, dragOver, setDragOver, chooseFactory, chooseUser, onPatchLoaded, onDrop, removePatch };
}

/** The Factory and User patch picker with the SysEx load button, in the design-system look (the Simple UI). */
export const CZ101PatchBrowser: React.FC<{
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
  onTextParamChange?: (key: string, value: string) => void;
}> = ({ parameters, onParamChange, onTextParamChange }) => {
  const p = useCz101Patches(parameters, onParamChange, onTextParamChange);
  // Every patch is a cell of one size in a grid, so rows and columns line up whatever the names are.
  const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1';
  const cell = 'w-full justify-start overflow-hidden text-ellipsis';
  return (
    <div
      data-sample-drop-zone
      onDragOver={(event) => { event.preventDefault(); p.setDragOver(true); }}
      onDragLeave={() => p.setDragOver(false)}
      onDrop={p.onDrop}
      className={`flex flex-col gap-3 rounded border bg-dark-bgSecondary p-3 ${p.dragOver ? 'border-accent-primary bg-accent-primary/10' : 'border-dark-border'}`}
    >
      <section className="flex flex-col gap-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-secondary">Factory</div>
        <div className={grid}>
          {CZ101_PRESET_BANK.map((entry, index) => (
            <Button key={entry.patch.name} size="sm" className={cell} variant={!p.ownPatch && index === p.program ? 'primary' : 'default'} onClick={() => p.chooseFactory(index)}>
              {entry.patch.name}
            </Button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-secondary">User</div>
          <div className="flex items-center gap-1">
            {p.activeUser && (
              <Button size="sm" variant="ghost" onClick={() => { p.removePatch(p.activeUser!.id); p.chooseFactory(0); }}>Remove Selected</Button>
            )}
            <PatchLoadButton synthType="CZ101" label="Load SysEx File" onLoad={p.onPatchLoaded} />
          </div>
        </div>
        {p.userPatches.length === 0 ? (
          <div className="rounded border border-dashed border-dark-borderLight p-3 text-center text-[10px] font-mono text-text-secondary">
            No user patches yet. Load Casio CZ single-patch SysEx files (.syx from a CZ-101, CZ-1000, CZ-3000 or CZ-5000), or drop them here.
          </div>
        ) : (
          <div className={grid}>
            {p.userPatches.map((entry) => (
              <Button key={entry.id} size="sm" className={cell} variant={entry.id === p.activeUser?.id ? 'primary' : 'default'} onClick={() => p.chooseUser(entry.id)}>
                {entry.name}
              </Button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
