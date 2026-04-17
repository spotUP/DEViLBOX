/**
 * MpkStatusBar — gig-readable status strip for the drumpad view.
 *
 * Always visible, always high-contrast. Shows:
 *   - Slot 1-8 indicator with editable program name (matches the MPK PROG
 *     that's currently active)
 *   - Bank A / B selector (matches the MPK PAD BANK toggle)
 *   - The 8 knob labels for the currently active knob bank (so the user
 *     can read what each physical knob does without looking away)
 *
 * Slot switching from the MPK happens via MIDI Program Change (PROG SELECT
 * + pad on the controller). No MIDI learn here — the PC handler in
 * useMIDIPadRouting does all the work.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { MPK_SLOT_COUNT, mpkSlotId } from '@/types/drumpad';
import { KNOB_BANKS } from '@/midi/knobBanks';

export const MpkStatusBar: React.FC = () => {
  const programs = useDrumPadStore((s) => s.programs);
  const currentProgramId = useDrumPadStore((s) => s.currentProgramId);
  const currentBank = useDrumPadStore((s) => s.currentBank);
  const setBank = useDrumPadStore((s) => s.setBank);
  const loadProgram = useDrumPadStore((s) => s.loadProgram);
  const renameProgram = useDrumPadStore((s) => s.renameProgram);

  const knobBank = useMIDIStore((s) => s.knobBank);

  const current = programs.get(currentProgramId);
  const activeSlot = useMemo(() => {
    for (let n = 1; n <= MPK_SLOT_COUNT; n++) {
      if (mpkSlotId(n) === currentProgramId) return n;
    }
    return null;
  }, [currentProgramId]);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  const beginEditName = useCallback(() => {
    if (!current) return;
    setDraftName(current.name);
    setEditingName(true);
  }, [current]);

  const commitName = useCallback(() => {
    if (current && draftName.trim() && draftName !== current.name) {
      renameProgram(currentProgramId, draftName.trim());
    }
    setEditingName(false);
  }, [current, currentProgramId, draftName, renameProgram]);

  const knobLabels = useMemo(() => {
    const flat = KNOB_BANKS[knobBank];
    return flat ? flat.map((a) => a.label) : [];
  }, [knobBank]);

  return (
    <div className="flex items-stretch gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgSecondary shrink-0">
      {/* Slots 1-8: program switcher that mirrors the MPK PROG button. */}
      <div className="flex items-center gap-1">
        {Array.from({ length: MPK_SLOT_COUNT }, (_, i) => {
          const n = i + 1;
          const id = mpkSlotId(n);
          const isActive = activeSlot === n;
          const prog = programs.get(id);
          return (
            <button
              key={id}
              onClick={() => loadProgram(id)}
              title={prog ? prog.name : `Slot ${n}`}
              className={`min-w-[32px] px-2 py-1 text-[10px] font-mono font-bold rounded border transition-colors
                ${isActive
                  ? 'bg-accent-primary text-text-inverse border-accent-primary'
                  : 'bg-dark-bgTertiary text-text-muted border-dark-border hover:text-text-primary hover:border-accent-primary/50'}`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Active program name — click to rename. */}
      <div className="flex items-center gap-2 px-3 border-l border-dark-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {activeSlot !== null ? `MPK ${activeSlot}` : 'Program'}
        </span>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              else if (e.key === 'Escape') setEditingName(false);
            }}
            className="w-36 px-2 py-1 text-xs font-mono bg-dark-bgTertiary border border-accent-primary rounded text-text-primary focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={beginEditName}
            onClick={beginEditName}
            className="text-sm font-mono font-bold text-accent-primary hover:text-text-primary truncate max-w-[200px]"
            title="Click to rename"
          >
            {current?.name ?? '—'}
          </button>
        )}
      </div>

      {/* Bank A / B toggle — mirrors the MPK PAD BANK button. */}
      <div className="flex items-center gap-1 px-3 border-l border-dark-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Bank</span>
        {(['A', 'B'] as const).map((b) => (
          <button
            key={b}
            onClick={() => setBank(b)}
            className={`min-w-[28px] px-2 py-1 text-[10px] font-mono font-bold rounded border transition-colors
              ${currentBank === b
                ? 'bg-accent-highlight text-text-inverse border-accent-highlight'
                : 'bg-dark-bgTertiary text-text-muted border-dark-border hover:text-text-primary hover:border-accent-highlight/50'}`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* 8 knob labels — what each MPK knob does right now. */}
      <div className="flex items-center gap-1 px-3 border-l border-dark-border flex-1 min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted shrink-0">
          Knobs · {knobBank}
        </span>
        <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
          {Array.from({ length: 8 }, (_, i) => {
            const label = knobLabels[i] ?? '—';
            return (
              <div
                key={i}
                className="flex flex-col items-center shrink-0 min-w-[54px] px-1 py-0.5 rounded bg-dark-bgTertiary border border-dark-border"
                title={`Knob ${i + 1}: ${label}`}
              >
                <span className="text-[8px] font-mono text-text-muted">K{i + 1}</span>
                <span className="text-[9px] font-mono text-text-primary truncate max-w-[60px]">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
