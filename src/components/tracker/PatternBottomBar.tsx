/**
 * PatternBottomBar — Renoise-style control bar at the bottom of the pattern editor.
 * Consolidates all editing-related controls close to where the user works:
 * edit step, octave, column visibility, paste mode/mask.
 */

import React from 'react';
import { useEditorStore, MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2 } from '@stores/useEditorStore';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { DropdownButton, type MenuItemType } from '@components/common/ContextMenu';
import type { ColumnVisibility } from '@typedefs/tracker';

const COLUMN_TOGGLES: { key: keyof ColumnVisibility; label: string; title: string }[] = [
  { key: 'note', label: 'Not', title: 'Note column' },
  { key: 'instrument', label: 'Ins', title: 'Instrument column' },
  { key: 'volume', label: 'Vol', title: 'Volume column' },
  { key: 'effect', label: 'Fx1', title: 'Effect column' },
  { key: 'effect2', label: 'Fx2', title: 'Effect 2 column' },
  { key: 'probability', label: 'Prb', title: 'Probability column' },
];

export const PatternBottomBar: React.FC = () => {
  const editStep = useEditorStore(s => s.editStep);
  const setEditStep = useEditorStore(s => s.setEditStep);
  const columnVisibility = useEditorStore(s => s.columnVisibility);
  const setColumnVisibility = useEditorStore(s => s.setColumnVisibility);
  const octave = useEditorStore(s => s.currentOctave);
  const setOctave = useEditorStore(s => s.setCurrentOctave);
  const recordMode = useEditorStore(s => s.recordMode);
  const pasteMode = useEditorStore(s => s.pasteMode);
  const setPasteMode = useEditorStore(s => s.setPasteMode);
  const pasteMask = useEditorStore(s => s.pasteMask);
  const toggleMaskBit = useEditorStore(s => s.toggleMaskBit);

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-2 h-[26px] bg-ft2-bg border-t border-dark-border select-none">
      {/* Edit Step */}
      <div className="flex items-center gap-1" title="Edit step — rows to advance after entering a note">
        <span className="text-[9px] font-mono text-ft2-textDim uppercase">Step</span>
        <div className="flex items-center">
          <button
            onClick={() => setEditStep(editStep - 1)}
            disabled={editStep <= 0}
            className="px-0.5 text-ft2-textDim hover:text-text-primary disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={10} />
          </button>
          <span className={`text-[11px] font-mono font-bold w-4 text-center ${recordMode ? 'text-accent-error' : 'text-accent-primary'}`}>
            {editStep}
          </span>
          <button
            onClick={() => setEditStep(editStep + 1)}
            disabled={editStep >= 16}
            className="px-0.5 text-ft2-textDim hover:text-text-primary disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={10} />
          </button>
        </div>
      </div>

      <div className="w-px h-3 bg-dark-border" />

      {/* Octave */}
      <div className="flex items-center gap-1" title="Base octave for note input">
        <span className="text-[9px] font-mono text-ft2-textDim uppercase">Oct</span>
        <div className="flex items-center">
          <button
            onClick={() => setOctave(octave - 1)}
            disabled={octave <= 1}
            className="px-0.5 text-ft2-textDim hover:text-text-primary disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={10} />
          </button>
          <span className="text-[11px] font-mono font-bold w-3 text-center text-accent-primary">
            {octave}
          </span>
          <button
            onClick={() => setOctave(octave + 1)}
            disabled={octave >= 7}
            className="px-0.5 text-ft2-textDim hover:text-text-primary disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={10} />
          </button>
        </div>
      </div>

      <div className="w-px h-3 bg-dark-border" />

      {/* Column Visibility Toggles */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] font-mono text-ft2-textDim uppercase mr-1">Cols</span>
        {COLUMN_TOGGLES.map(({ key, label, title }) => (
          <button
            key={key}
            onClick={() => setColumnVisibility({ [key]: !columnVisibility[key] })}
            className={`px-1 h-[18px] text-[9px] font-mono rounded transition-colors ${
              columnVisibility[key]
                ? 'bg-accent-primary/25 text-accent-primary'
                : 'bg-dark-bgSecondary/50 text-ft2-textDim hover:text-text-secondary'
            }`}
            title={`${title} — ${columnVisibility[key] ? 'visible' : 'hidden'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-3 bg-dark-border" />

      {/* Paste Mode & Mask (moved from EditorControlsBar) */}
      <div className="flex items-center gap-1">
        <DropdownButton
          items={([
            { id: 'overwrite', label: 'Overwrite', radio: true, checked: pasteMode === 'overwrite', onClick: () => setPasteMode('overwrite') },
            { id: 'mix', label: 'Mix paste', radio: true, checked: pasteMode === 'mix', onClick: () => setPasteMode('mix') },
            { id: 'flood', label: 'Flood fill', radio: true, checked: pasteMode === 'flood', onClick: () => setPasteMode('flood') },
            { id: 'insert', label: 'Insert rows', radio: true, checked: pasteMode === 'insert', onClick: () => setPasteMode('insert') },
          ] as MenuItemType[])}
          className="h-[18px] px-1.5 bg-dark-bgSecondary/50 text-ft2-textDim text-[9px] font-mono border border-dark-border rounded cursor-pointer hover:text-text-primary hover:border-accent-highlight/50 transition-colors"
        >
          {pasteMode === 'overwrite' ? 'Paste' : pasteMode === 'mix' ? 'Mix' : pasteMode === 'flood' ? 'Flood' : 'Insert'} ▾
        </DropdownButton>
        <div className="flex gap-px" title="Paste mask — toggle columns affected by paste">
          {([
            ['N', MASK_NOTE],
            ['I', MASK_INSTRUMENT],
            ['V', MASK_VOLUME],
            ['E', MASK_EFFECT],
            ['E2', MASK_EFFECT2],
          ] as const).map(([label, bit]) => (
            <button
              key={label}
              className={`px-1 h-[18px] text-[9px] font-mono rounded transition-colors ${
                pasteMask & (bit as number)
                  ? 'bg-accent-primary/25 text-accent-primary'
                  : 'bg-dark-bgSecondary/50 text-ft2-textDim hover:text-text-secondary'
              }`}
              onClick={() => toggleMaskBit('paste', bit as number)}
              title={`Toggle ${label} in paste`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
