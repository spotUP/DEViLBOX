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
 * The slot and name live in useDrumPadStore (mpk-N slots). Knob labels
 * live in useMIDIStore (knobBank) + KNOB_BANKS dictionary.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { MPK_SLOT_COUNT, mpkSlotId } from '@/types/drumpad';
import { KNOB_BANKS } from '@/midi/knobBanks';
import {
  startLearnSlotBinding,
  cancelLearnSlotBinding,
  clearSlotBinding,
  getSlotBinding,
  getLearnSlotTarget,
  subscribeSlotBindings,
} from '@/hooks/drumpad/useMIDIPadRouting';

export const MpkStatusBar: React.FC = () => {
  const programs = useDrumPadStore((s) => s.programs);
  const currentProgramId = useDrumPadStore((s) => s.currentProgramId);
  const currentBank = useDrumPadStore((s) => s.currentBank);
  const setBank = useDrumPadStore((s) => s.setBank);
  const loadProgram = useDrumPadStore((s) => s.loadProgram);
  const renameProgram = useDrumPadStore((s) => s.renameProgram);

  const knobBank = useMIDIStore((s) => s.knobBank);

  // Re-render whenever slot bindings change or learn mode toggles so slot
  // buttons accurately show tooltip + pulsing learn state.
  const [, forceBindingsRender] = useState(0);
  useEffect(() => subscribeSlotBindings(() => forceBindingsRender((n) => n + 1)), []);
  const learnTarget = getLearnSlotTarget();

  // Active program and its slot number (1-8) if it's one of the MPK slots
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

  // Knob labels from the active bank. Pagination is synth-driven and
  // orthogonal to this readout, so we surface the flat 8-knob assignments.
  const knobLabels = useMemo(() => {
    const flat = KNOB_BANKS[knobBank];
    return flat ? flat.map((a) => a.label) : [];
  }, [knobBank]);

  const knobPageLabel = knobBank;

  return (
    <div className="flex items-stretch gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgSecondary shrink-0">
      {/* Slots 1-8: program switcher that mirrors the MPK PROG button. */}
      <div className="flex items-center gap-1">
        {Array.from({ length: MPK_SLOT_COUNT }, (_, i) => {
          const n = i + 1;
          const id = mpkSlotId(n);
          const isActive = activeSlot === n;
          const isLearning = learnTarget === n;
          const prog = programs.get(id);
          const binding = getSlotBinding(n);
          const bindingDesc = binding
            ? ` · MIDI ${binding.type} ${binding.value} ch${binding.channel + 1}`
            : '';
          const tip = isLearning
            ? 'Learning — press any MPK pad/key/button'
            : `${prog ? prog.name : `Slot ${n}`}${bindingDesc}\nRight-click: Learn / Clear MIDI trigger`;
          return (
            <button
              key={id}
              onClick={() => { if (isLearning) { cancelLearnSlotBinding(); } else { loadProgram(id); } }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (binding) {
                  // Cycle: bound → clear → (next right-click starts learn)
                  clearSlotBinding(n);
                } else if (isLearning) {
                  cancelLearnSlotBinding();
                } else {
                  startLearnSlotBinding(n);
                }
              }}
              title={tip}
              className={`min-w-[32px] px-2 py-1 text-[10px] font-mono font-bold rounded border transition-colors relative
                ${isLearning
                  ? 'bg-accent-warning text-text-inverse border-accent-warning animate-pulse'
                  : isActive
                    ? 'bg-accent-primary text-text-inverse border-accent-primary'
                    : 'bg-dark-bgTertiary text-text-muted border-dark-border hover:text-text-primary hover:border-accent-primary/50'}`}
            >
              {n}
              {binding && !isLearning && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-accent-success" />
              )}
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
          Knobs · {knobPageLabel}
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
