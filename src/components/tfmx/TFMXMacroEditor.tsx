/**
 * TFMXMacroEditor — Comprehensive editor for TFMX (Huelsbeck) instrument macros.
 *
 * TFMX instruments are 4-byte command streams. Each command has an opcode (0x00-0x29)
 * + parameter bytes whose meaning depends on the command. This editor exposes
 * EVERY editable value: opcode selection, all parameter bytes, with named fields
 * matching the command's parameter layout (TFMXMacroParamLayout).
 *
 * Layout:
 *   ┌──────────┬──────────┬──────────────────┬─────────────┐
 *   │ Macros   │ Steps    │ Detail editor    │ Samples     │
 *   │ (list)   │ (list)   │ (opcode + params)│ (toggleable)│
 *   └──────────┴──────────┴──────────────────┴─────────────┘
 *
 * Features:
 *   • All 42 Huelsbeck command opcodes (0x00-0x29) selectable per step
 *   • Named parameter fields per layout (addr24, env, vibrato, note_detune, …)
 *   • Raw byte editing fallback for any non-standard cases
 *   • Insert / delete / duplicate steps within macro capacity
 *   • Macro usage labels (bass / mid / lead / fx, derived from pattern scan)
 *   • Sample browser pane (SetBegin/SetLen pair scanning across all macros)
 *   • Reload Audio button + auto-reload toggle for live preview
 *
 * Edits write through the store (setTFMXMacroByte / setTFMXMacroCommand /
 * insertTFMXMacroStep etc.) which patches BOTH the in-memory native data AND
 * the tfmxFileData ArrayBuffer for export. The Reload Audio button pushes the
 * patched buffer to the running TFMX WASM via TFMXEngine.reloadModule().
 *
 * ─── Audition options ────────────────────────────────────────────────────────
 *
 * The editor exposes TWO ways to hear a macro:
 *
 * 1. **Preview button** — triggers the selected macro on voice 0 at the
 *    note you set in the spinner next to the button. Hits the C export
 *    `tfmx_module_preview_macro` (added to our forked copy of
 *    libtfmxaudiodecoder under tfmx-wasm/lib/) which sets up the
 *    sequencer's `cmd` struct and runs the regular noteCmd path; the next
 *    render tick produces audio. Requires playback to be RUNNING because
 *    the worklet only renders while `_modulePlaying` is true. The preview
 *    note plays on top of the song; if voice 0 is also being used by the
 *    song, the next pattern step will overwrite it after a few ticks.
 *
 * 2. **Find Usage button** — locates a real song position where this macro
 *    is referenced and seeks playback there, so you hear the macro in its
 *    natural musical context with all the surrounding notes/effects.
 *    Useful for "what does this sound like in the song" rather than the
 *    isolated note that Preview gives you.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useFormatStore } from '@stores';
import { TFMX_MACRO_COMMANDS } from '@/types/tfmxNative';
import { CustomSelect } from '@components/common/CustomSelect';
import type {
  TFMXMacroCommand,
  TFMXMacroCommandDef,
  TFMXMacroParamLayout,
} from '@/types/tfmxNative';
import { TFMXEngine } from '@/engine/tfmx/TFMXEngine';
import { useTrackerStore } from '@stores';

// ── Helpers ──────────────────────────────────────────────────────────────────

function findCmdDef(opcode: number): TFMXMacroCommandDef | undefined {
  return TFMX_MACRO_COMMANDS.find(c => c.opcode === opcode);
}

function hex2(v: number): string {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hex8(v: number): string {
  return (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function s16(v: number): number {
  return v > 0x7FFF ? v - 0x10000 : v;
}

// ── Param layout helpers ─────────────────────────────────────────────────────

interface ParamField {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  /** Apply a new numeric value -> [b1, b2, b3] for the command */
  apply: (cmd: TFMXMacroCommand, newVal: number) => [number, number, number];
}

/** Build the editable parameter fields for a command, based on its layout. */
function buildParamFields(cmd: TFMXMacroCommand, layout: TFMXMacroParamLayout): ParamField[] {
  const { byte1: b1, byte2: b2, byte3: b3 } = cmd;
  const w16 = (b2 << 8) | b3;
  const w24 = (b1 << 16) | (b2 << 8) | b3;

  switch (layout) {
    case 'none':
      return [];

    case 'byte':
      return [{
        label: 'Param', value: b1, display: hex2(b1), min: 0, max: 255,
        apply: (_c, v) => [v & 0xFF, b2, b3],
      }];

    case 'word16':
      return [{
        label: 'Word16', value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
        apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF],
      }];

    case 'addr24':
      return [{
        label: 'Addr24', value: w24, display: hex2(b1) + hex2(b2) + hex2(b3),
        min: 0, max: 0xFFFFFF,
        apply: (_c, v) => [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF],
      }];

    case 'byte_word':
      return [
        {
          label: 'Count', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3],
        },
        {
          label: 'Step', value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
          apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF],
        },
      ];

    case 'note_detune':
      return [
        {
          label: 'Note', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3],
        },
        {
          label: 'Detune', value: s16(w16), display: s16(w16).toString(),
          min: -32768, max: 32767,
          apply: (_c, v) => {
            const u = (v < 0 ? v + 0x10000 : v) & 0xFFFF;
            return [b1, (u >> 8) & 0xFF, u & 0xFF];
          },
        },
      ];

    case 'env':
      return [
        { label: 'Speed',  value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Count',  value: b2, display: hex2(b2), min: 0, max: 255,
          apply: (_c, v) => [b1, v & 0xFF, b3] },
        { label: 'Target', value: b3, display: hex2(b3), min: 0, max: 0x3F,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];

    case 'vibrato':
      return [
        { label: 'Speed',     value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Intensity', value: b3, display: hex2(b3), min: 0, max: 255,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];

    case 'volume':
      return [{
        label: 'Volume', value: b3, display: hex2(b3), min: 0, max: 0x3F,
        apply: (_c, v) => [b1, b2, v & 0xFF],
      }];

    case 'addvol_note':
      return [
        { label: 'Note', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Flag', value: b2, display: hex2(b2), min: 0, max: 255,
          apply: (_c, v) => [b1, v & 0xFF, b3] },
        { label: 'Vol',  value: b3, display: hex2(b3), min: 0, max: 0x3F,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];

    case 'wave':
      return [{
        label: 'Sample', value: b3, display: hex2(b3), min: 0, max: 255,
        apply: (_c, v) => [b1, b2, v & 0xFF],
      }];

    case 'wave_mod':
      return [
        { label: 'Sample', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Arg',    value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
          apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
      ];

    case 'split':
      return [
        { label: 'Threshold', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Step',      value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
          apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
      ];

    case 'random':
      return [
        { label: 'Macro', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Speed', value: b2, display: hex2(b2), min: 0, max: 255,
          apply: (_c, v) => [b1, v & 0xFF, b3] },
        { label: 'Mode',  value: b3, display: hex2(b3), min: 0, max: 255,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];

    case 'play_macro':
      return [
        { label: 'Macro',   value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Ch|Vol',  value: b2, display: hex2(b2), min: 0, max: 255,
          apply: (_c, v) => [b1, v & 0xFF, b3] },
        { label: 'Detune',  value: b3, display: hex2(b3), min: 0, max: 255,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];

    case 'sid_speed':
      return [
        { label: 'Speed', value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'Delta', value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
          apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
      ];

    case 'sid_op1':
      return [
        { label: 'Speed',     value: b1, display: hex2(b1), min: 0, max: 255,
          apply: (_c, v) => [v & 0xFF, b2, b3] },
        { label: 'InterMod',  value: b2, display: hex2(b2), min: 0, max: 255,
          apply: (_c, v) => [b1, v & 0xFF, b3] },
        { label: 'InterDelta',value: b3, display: hex2(b3), min: 0, max: 255,
          apply: (_c, v) => [b1, b2, v & 0xFF] },
      ];
  }
  return [];
}

// ── Style helpers ────────────────────────────────────────────────────────────

const macroBtn: React.CSSProperties = {
  fontSize: '10px', padding: '1px 6px', cursor: 'pointer',
  background: 'var(--color-bg)', color: '#88c0c0',
  border: '1px solid #88c0c0', borderRadius: '2px',
  fontFamily: 'inherit', minWidth: '16px',
};

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  width?: number;
  height?: number;
  /** When set, the editor opens with this macro pre-selected (used by EditInstrumentModal). */
  initialMacroIndex?: number;
}

export const TFMXMacroEditor: React.FC<Props> = ({ height = 360, initialMacroIndex }) => {
  const native = useFormatStore(s => s.tfmxNative);
  const setMacroCommand = useFormatStore(s => s.setTFMXMacroCommand);
  const insertStep = useFormatStore(s => s.insertTFMXMacroStep);
  const deleteStep = useFormatStore(s => s.deleteTFMXMacroStep);
  const duplicateStep = useFormatStore(s => s.duplicateTFMXMacroStep);
  const tfmxFileData = useFormatStore(s => s.tfmxFileData);
  const tfmxSmplData = useFormatStore(s => s.tfmxSmplData);

  // Reload the running TFMX WASM with the patched mdat so edits are audible.
  // Called manually via the Reload button (avoids restarting playback on every keystroke).
  const reloadAudio = useCallback(() => {
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
  }, [tfmxFileData, tfmxSmplData]);

  // Preview the currently selected macro on voice 0 at note C-3 / vol 15.
  // Hits the C export tfmx_module_preview_macro added to the forked
  // libtfmxaudiodecoder. Requires the song to be playing for audio to render
  // (the worklet only renders while _modulePlaying is true).
  const [previewNote, setPreviewNote] = useState(24); // ~C-3 in TFMX note range
  const previewMacro = useCallback((macroTableIdx: number) => {
    if (!TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().previewMacro(macroTableIdx, previewNote, 15, 0);
  }, [previewNote]);

  // Seek the song player to the first trackstep that contains a pattern that
  // references the currently selected macro. This is the "audition" path —
  // since libtfmxaudiodecoder has no per-macro preview API, we instead jump
  // playback to a real song position where this macro is heard naturally.
  const seekToUsage = useCallback((macroTableIdx: number) => {
    if (!native) return false;
    // Build pattern → uses-this-macro lookup
    const patternsUsing = new Set<number>();
    for (let p = 0; p < native.patterns.length; p++) {
      if (native.patterns[p].some(c => c.macro === macroTableIdx)) {
        patternsUsing.add(p);
      }
    }
    if (patternsUsing.size === 0) return false;
    // Walk visible (non-EFFE) tracksteps for the active subsong, find one whose
    // voice references one of those patterns
    const activeSteps = native.tracksteps
      .filter(s => !s.isEFFE && s.stepIndex >= native.firstStep && s.stepIndex <= native.lastStep);
    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i];
      for (const v of step.voices) {
        if (v.patternNum >= 0 && !v.isStop && patternsUsing.has(v.patternNum)) {
          // i is the song position index relative to subsong start
          useTrackerStore.getState().setCurrentPosition(i, false);
          return true;
        }
      }
    }
    return false;
  }, [native]);

  // Resolve a real macro array index from a TFMX pointer-table index (instrument id - 1)
  const resolveArrayIdx = useCallback((tableIdx: number | undefined): number => {
    if (tableIdx === undefined || !native) return 0;
    const found = native.macros.findIndex(m => m.index === tableIdx);
    return found >= 0 ? found : 0;
  }, [native]);

  const [selectedMacroIdx, setSelectedMacroIdx] = useState(() => resolveArrayIdx(initialMacroIndex));
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [autoReload, setAutoReload] = useState(false);

  // When auto-reload is on, debounce-push the patched buffer to the running WASM.
  // 200ms gives the user a moment to keep typing without thrashing the worklet.
  React.useEffect(() => {
    if (!autoReload) return;
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    const handle = window.setTimeout(() => {
      TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
    }, 200);
    return () => window.clearTimeout(handle);
    // tfmxFileData identity changes only when the file is replaced — to detect
    // edits we also depend on the macros array content. Read it once for that.
  }, [autoReload, tfmxFileData, tfmxSmplData, native?.macros]);

  // Sync selection when the host (e.g. instrument modal) changes which instrument is open
  React.useEffect(() => {
    if (initialMacroIndex === undefined) return;
    const idx = resolveArrayIdx(initialMacroIndex);
    setSelectedMacroIdx(idx);
    setSelectedStepIdx(0);
  }, [initialMacroIndex, resolveArrayIdx]);

  const macros = native?.macros ?? [];
  const macro = macros[selectedMacroIdx];
  const cmd = macro?.commands[selectedStepIdx];
  const cmdDef = cmd ? findCmdDef(cmd.opcode) : undefined;

  // Build a macroIndex → usage info map by scanning all pattern commands.
  // TFMX pattern commands carry an embedded macro reference for note/noteWait/
  // portamento. Counting references gives a quick "how often used" hint and
  // collecting the highest pattern lets us label what each macro is for.
  const macroUsage = useMemo(() => {
    const map = new Map<number, { count: number; patterns: Set<number>; notes: Set<number> }>();
    if (!native) return map;
    for (let p = 0; p < native.patterns.length; p++) {
      for (const c of native.patterns[p]) {
        if (c.macro === undefined) continue;
        let entry = map.get(c.macro);
        if (!entry) {
          entry = { count: 0, patterns: new Set(), notes: new Set() };
          map.set(c.macro, entry);
        }
        entry.count++;
        entry.patterns.add(p);
        if (c.note !== undefined) entry.notes.add(c.note);
      }
    }
    return map;
  }, [native]);

  // Sample reference table — every TFMX macro can call SetBegin (0x02) to set
  // the sample chip-RAM start address and SetLen (0x03) to set the length in
  // words. Walking each macro pairs the most recent SetBegin with the next
  // SetLen, giving a list of unique (addr, lenWords) sample references and
  // which macros use them. There is no central sample directory in the mdat
  // format — this scan IS the sample browser.
  const sampleRefs = useMemo(() => {
    const seen = new Map<string, { addr: number; lenWords: number; macros: Set<number> }>();
    if (!native) return [] as Array<{ addr: number; lenWords: number; macros: number[] }>;
    for (const m of native.macros) {
      let pendingAddr: number | null = null;
      for (const c of m.commands) {
        if (c.opcode === 0x02) {
          // SetBegin: bb:cd:ee = 24-bit chip RAM address
          pendingAddr = ((c.byte1 << 16) | (c.byte2 << 8) | c.byte3) >>> 0;
        } else if (c.opcode === 0x03 && pendingAddr !== null) {
          // SetLen: cd:ee = 16-bit length in words
          const lenWords = (c.byte2 << 8) | c.byte3;
          const key = `${pendingAddr.toString(16)}:${lenWords}`;
          let entry = seen.get(key);
          if (!entry) {
            entry = { addr: pendingAddr, lenWords, macros: new Set() };
            seen.set(key, entry);
          }
          entry.macros.add(m.index);
          pendingAddr = null;
        }
      }
    }
    return Array.from(seen.values())
      .map(e => ({ addr: e.addr, lenWords: e.lenWords, macros: Array.from(e.macros).sort((a, b) => a - b) }))
      .sort((a, b) => a.addr - b.addr);
  }, [native]);

  const [showSamplePane, setShowSamplePane] = useState(false);

  // Heuristic label from note range — bass / mid / lead / fx, plus a unique
  // indicator if the macro is referenced in only one pattern.
  const labelForMacro = useCallback((macroTableIndex: number): string => {
    const usage = macroUsage.get(macroTableIndex);
    if (!usage || usage.count === 0) return '';
    const noteValues = Array.from(usage.notes);
    const minNote = Math.min(...noteValues);
    const maxNote = Math.max(...noteValues);
    // TFMX notes are 0..63 mapping ~3 octaves; treat <16 as bass, >40 as lead
    let category: string;
    if (maxNote < 16) category = 'bass';
    else if (minNote > 40) category = 'lead';
    else if (usage.notes.size <= 2) category = 'fx';
    else category = 'mid';
    return `${category}·×${usage.count}`;
  }, [macroUsage]);

  const paramFields = useMemo<ParamField[]>(() => {
    if (!cmd || !cmdDef) return [];
    return buildParamFields(cmd, cmdDef.layout);
  }, [cmd, cmdDef]);

  const handleOpcodeChange = useCallback((newOpcode: number) => {
    if (!cmd) return;
    // Preserve flag bits in byte0; replace opcode bits
    const newB0 = (cmd.byte0 & 0xC0) | (newOpcode & 0x3F);
    setMacroCommand(selectedMacroIdx, selectedStepIdx, newB0, cmd.byte1, cmd.byte2, cmd.byte3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);

  const handleFlagsChange = useCallback((newFlags: number) => {
    if (!cmd) return;
    const newB0 = (cmd.byte0 & 0x3F) | (newFlags & 0xC0);
    setMacroCommand(selectedMacroIdx, selectedStepIdx, newB0, cmd.byte1, cmd.byte2, cmd.byte3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);

  const handleParamChange = useCallback((field: ParamField, raw: string) => {
    if (!cmd) return;
    let v: number;
    if (raw.startsWith('$') || raw.startsWith('0x')) {
      v = parseInt(raw.replace(/^(\$|0x)/, ''), 16);
    } else {
      v = parseInt(raw, 10);
    }
    if (!Number.isFinite(v)) return;
    v = Math.max(field.min, Math.min(field.max, v));
    const [nb1, nb2, nb3] = field.apply(cmd, v);
    setMacroCommand(selectedMacroIdx, selectedStepIdx, cmd.byte0, nb1, nb2, nb3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);

  const handleRawByteChange = useCallback((byteIdx: 0 | 1 | 2 | 3, raw: string) => {
    if (!cmd) return;
    let v = parseInt(raw, 16);
    if (!Number.isFinite(v)) return;
    v = Math.max(0, Math.min(255, v));
    const bytes = [cmd.byte0, cmd.byte1, cmd.byte2, cmd.byte3];
    bytes[byteIdx] = v;
    setMacroCommand(selectedMacroIdx, selectedStepIdx, bytes[0], bytes[1], bytes[2], bytes[3]);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);

  if (!native || macros.length === 0) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-muted)', fontSize: '11px',
      }}>
        No TFMX macros loaded
      </div>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: `${height}px`, width: '100%',
      backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '11px',
      borderTop: '1px solid var(--color-border)',
    }}>
      {/* Macro list sidebar */}
      <div style={{
        width: '120px', borderRight: '1px solid var(--color-border)',
        overflowY: 'auto', backgroundColor: 'var(--color-bg-tertiary)',
      }}>
        <div style={{
          padding: '4px 8px', fontWeight: 'bold', color: '#e0a050',
          borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0,
          backgroundColor: 'var(--color-bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>MACROS ({macros.length})</span>
          <button
            onClick={() => setShowSamplePane(!showSamplePane)}
            title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
            style={{
              fontSize: '9px', padding: '1px 4px', cursor: 'pointer',
              background: showSamplePane ? 'rgba(136,192,192,0.2)' : 'var(--color-bg)',
              color: '#88c0c0', border: '1px solid #88c0c0', borderRadius: '2px',
            }}
          >SMP</button>
        </div>
        {macros.map((m, i) => {
          const usageLabel = labelForMacro(m.index);
          return (
            <div
              key={m.index}
              onClick={() => { setSelectedMacroIdx(i); setSelectedStepIdx(0); }}
              style={{
                padding: '3px 8px', cursor: 'pointer',
                backgroundColor: i === selectedMacroIdx ? 'rgba(224,160,80,0.2)' : 'transparent',
                color: i === selectedMacroIdx ? '#e0a050' : 'var(--color-text-secondary)',
                borderLeft: i === selectedMacroIdx ? '2px solid #e0a050' : '2px solid transparent',
              }}
              title={usageLabel ? `Used ${usageLabel.split('·')[1]}` : 'Unused in any pattern'}
            >
              <div>{hex2(m.index)} : {m.length}st</div>
              {usageLabel && (
                <div style={{ fontSize: '9px', color: '#88c0c0', marginTop: '1px' }}>
                  {usageLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Command list */}
      <div style={{
        width: '260px', borderRight: '1px solid var(--color-border)',
        overflowY: 'auto', backgroundColor: 'var(--color-bg-secondary)',
      }}>
        <div style={{
          padding: '4px 8px', fontWeight: 'bold', color: '#88c0c0',
          borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0,
          backgroundColor: 'var(--color-bg-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px',
        }}>
          <span>STEPS</span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              onClick={() => {
                const ok = insertStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn('[TFMX] insert refused — macro is full');
              }}
              title="Insert NOP at selected step"
              style={macroBtn}
            >+</button>
            <button
              onClick={() => {
                const ok = duplicateStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn('[TFMX] duplicate refused — macro is full');
              }}
              title="Duplicate selected step"
              style={macroBtn}
            >×2</button>
            <button
              onClick={() => {
                const ok = deleteStep(selectedMacroIdx, selectedStepIdx);
                if (!ok) console.warn('[TFMX] delete refused — last step');
                else setSelectedStepIdx(Math.max(0, selectedStepIdx - 1));
              }}
              title="Delete selected step"
              style={macroBtn}
            >−</button>
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
            @{hex8(macro?.fileOffset ?? 0)}
          </span>
        </div>
        {macro?.commands.map((c, i) => {
          const def = findCmdDef(c.opcode);
          const isSel = i === selectedStepIdx;
          return (
            <div
              key={i}
              onClick={() => setSelectedStepIdx(i)}
              style={{
                padding: '2px 8px', cursor: 'pointer',
                backgroundColor: isSel ? 'rgba(136,192,192,0.2)' : 'transparent',
                color: isSel ? '#88c0c0' : 'var(--color-text-secondary)',
                borderLeft: isSel ? '2px solid #88c0c0' : '2px solid transparent',
                display: 'flex', gap: '6px', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', width: '24px' }}>
                {i.toString().padStart(3, '0')}
              </span>
              <span style={{ color: '#a0a0d0', width: '70px' }}>
                {hex2(c.byte0)} {hex2(c.byte1)} {hex2(c.byte2)} {hex2(c.byte3)}
              </span>
              <span style={{ flex: 1 }}>{def?.mnemonic ?? `?${hex2(c.opcode)}`}</span>
            </div>
          );
        })}
      </div>

      {/* Detail editor */}
      <div style={{
        flex: 1, padding: '8px 12px', overflowY: 'auto',
      }}>
        {cmd && cmdDef && (
          <>
            <div style={{
              marginBottom: '10px', display: 'flex',
              alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
            }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                  MACRO {hex2(macro!.index)} · STEP {selectedStepIdx} · @{hex8(cmd.fileOffset)}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#e0a050' }}>
                  {cmdDef.mnemonic}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {cmdDef.description}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    max={63}
                    value={previewNote}
                    onChange={(e) => setPreviewNote(Math.max(0, Math.min(63, parseInt(e.target.value) || 0)))}
                    title="Note value (0-63) for preview audition"
                    style={{
                      width: '40px', fontSize: '10px', padding: '3px 4px',
                      background: 'var(--color-bg)', color: '#c084fc',
                      border: '1px solid #c084fc', borderRadius: '3px',
                      fontFamily: 'inherit', textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => previewMacro(macro!.index)}
                    title="Trigger this macro on voice 0 at the chosen note. Requires playback to be running so the WASM renders audio."
                    style={{
                      fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
                      background: 'rgba(192,132,252,0.15)', color: '#c084fc',
                      border: '1px solid #c084fc', borderRadius: '3px',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    ♪ Preview
                  </button>
                  <button
                    onClick={() => {
                      const ok = seekToUsage(macro!.index);
                      if (!ok) console.warn('[TFMX] selected macro is unused — nothing to seek to');
                    }}
                    title="Find a song position where this macro is used and seek the player there"
                    style={{
                      fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
                      background: 'rgba(136,192,192,0.15)', color: '#88c0c0',
                      border: '1px solid #88c0c0', borderRadius: '3px',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    ▶ Find Usage
                  </button>
                  <button
                    onClick={reloadAudio}
                    title="Reload the running TFMX WASM with edited mdat — applies all macro edits to live playback"
                    style={{
                      fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
                      background: 'rgba(224,160,80,0.15)', color: '#e0a050',
                      border: '1px solid #e0a050', borderRadius: '3px',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    ⟳ Reload Audio
                  </button>
                </div>
                <label
                  style={{
                    fontSize: '9px', color: 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  title="Push every edit to the running WASM after a 200ms debounce"
                >
                  <input
                    type="checkbox"
                    checked={autoReload}
                    onChange={(e) => setAutoReload(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  auto-reload
                </label>
              </div>
            </div>

            {/* Opcode selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <label style={{ width: '70px', color: 'var(--color-text-muted)' }}>Opcode</label>
              <CustomSelect
                value={String(cmd.opcode)}
                onChange={(v) => handleOpcodeChange(Number(v))}
                options={TFMX_MACRO_COMMANDS.map(d => ({ value: String(d.opcode), label: `${hex2(d.opcode)} — ${d.mnemonic}` }))}
              />
            </div>

            {/* Flag bits */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <label style={{ width: '70px', color: 'var(--color-text-muted)' }}>Flags</label>
              <CustomSelect
                value={String(cmd.flags)}
                onChange={(v) => handleFlagsChange(Number(v))}
                options={[
                  { value: String(0x00), label: '00 — none' },
                  { value: String(0x40), label: '40 — keyup wait' },
                  { value: String(0x80), label: '80 — pause flag' },
                  { value: String(0xC0), label: 'C0 — both' },
                ]}
              />
            </div>

            {/* Named parameter fields */}
            {paramFields.length === 0 && (
              <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', marginBottom: '8px' }}>
                No parameters
              </div>
            )}
            {paramFields.map((field, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px',
              }}>
                <label style={{ width: '70px', color: 'var(--color-text-muted)' }}>{field.label}</label>
                <input
                  type="text"
                  defaultValue={field.display}
                  key={`${selectedMacroIdx}-${selectedStepIdx}-${i}-${field.value}`}
                  onBlur={(e) => handleParamChange(field, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  style={{
                    width: '100px', fontSize: '11px', padding: '2px 4px',
                    fontFamily: 'inherit',
                    background: 'var(--color-bg)', color: '#e0e0e0',
                    border: '1px solid var(--color-border)', borderRadius: '2px',
                  }}
                />
                <span style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                  [{field.min}..{field.max}]
                </span>
              </div>
            ))}

            {/* Raw bytes view (toggle) */}
            <div style={{ marginTop: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
              <div
                onClick={() => setShowRaw(!showRaw)}
                style={{
                  cursor: 'pointer', color: 'var(--color-text-muted)',
                  fontSize: '10px', marginBottom: '4px',
                }}
              >
                {showRaw ? '▼' : '▶'} RAW BYTES
              </div>
              {showRaw && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {([0, 1, 2, 3] as const).map(i => {
                    const b = [cmd.byte0, cmd.byte1, cmd.byte2, cmd.byte3][i];
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>b{i}</span>
                        <input
                          type="text"
                          defaultValue={hex2(b)}
                          key={`raw-${selectedMacroIdx}-${selectedStepIdx}-${i}-${b}`}
                          onBlur={(e) => handleRawByteChange(i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          style={{
                            width: '36px', fontSize: '11px', padding: '2px 4px',
                            textAlign: 'center', fontFamily: 'inherit',
                            background: 'var(--color-bg)', color: '#a0a0d0',
                            border: '1px solid var(--color-border)', borderRadius: '2px',
                          }}
                        />
                      </div>
                    );
                  })}
                  <div style={{ alignSelf: 'flex-end', color: 'var(--color-text-muted)', fontSize: '10px' }}>
                    raw=${hex8(cmd.raw)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Sample browser pane (4th column, toggle via SMP button) */}
      {showSamplePane && (
        <div style={{
          width: '220px', borderLeft: '1px solid var(--color-border)',
          overflowY: 'auto', backgroundColor: 'var(--color-bg-tertiary)',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '4px 8px', fontWeight: 'bold', color: '#88c0c0',
            borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0,
            backgroundColor: 'var(--color-bg-tertiary)',
          }}>
            SAMPLES ({sampleRefs.length})
          </div>
          {sampleRefs.length === 0 && (
            <div style={{ padding: '8px', fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              No SetBegin/SetLen pairs found in any macro.
            </div>
          )}
          {sampleRefs.map((s, i) => (
            <div
              key={i}
              style={{
                padding: '4px 8px', borderBottom: '1px solid var(--color-border)',
                fontSize: '10px',
              }}
              title={`Used by macros: ${s.macros.map(m => hex2(m)).join(', ')}`}
            >
              <div style={{ color: '#e0e0e0', fontFamily: 'inherit' }}>
                ${hex8(s.addr)}
              </div>
              <div style={{ color: 'var(--color-text-muted)', marginTop: '1px' }}>
                {s.lenWords * 2} bytes ({s.lenWords}w)
              </div>
              <div style={{ color: '#88c0c0', marginTop: '2px', fontSize: '9px' }}>
                {s.macros.length} macro{s.macros.length === 1 ? '' : 's'}: {s.macros.slice(0, 6).map(m => hex2(m)).join(' ')}
                {s.macros.length > 6 && '…'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
