/**
 * TFMXMacroEditor — Comprehensive editor for TFMX (Huelsbeck) instrument macros.
 *
 * TFMX instruments are 4-byte command streams. Each command has an opcode (0x00-0x29)
 * + parameter bytes whose meaning depends on the command. This editor exposes
 * EVERY editable value: opcode selection, all parameter bytes, with named fields
 * matching the command's parameter layout (TFMXMacroParamLayout).
 *
 * Layout:
 *   ┌───────────────────────────────────────────────────────┐
 *   │  Macro selector (sidebar)  │  Command list + editor   │
 *   └───────────────────────────────────────────────────────┘
 *
 * Edits write through the store (setTFMXMacroByte / setTFMXMacroCommand) which
 * patches both the in-memory native data AND the tfmxFileData ArrayBuffer for
 * export. To take effect during playback the file must be reloaded.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useFormatStore } from '@stores';
import { TFMX_MACRO_COMMANDS } from '@/types/tfmxNative';
import type {
  TFMXMacroCommand,
  TFMXMacroCommandDef,
  TFMXMacroParamLayout,
} from '@/types/tfmxNative';
import { TFMXEngine } from '@/engine/tfmx/TFMXEngine';

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
  const tfmxFileData = useFormatStore(s => s.tfmxFileData);
  const tfmxSmplData = useFormatStore(s => s.tfmxSmplData);

  // Reload the running TFMX WASM with the patched mdat so edits are audible.
  // Called manually via the Reload button (avoids restarting playback on every keystroke).
  const reloadAudio = useCallback(() => {
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
  }, [tfmxFileData, tfmxSmplData]);

  // Resolve a real macro array index from a TFMX pointer-table index (instrument id - 1)
  const resolveArrayIdx = useCallback((tableIdx: number | undefined): number => {
    if (tableIdx === undefined || !native) return 0;
    const found = native.macros.findIndex(m => m.index === tableIdx);
    return found >= 0 ? found : 0;
  }, [native]);

  const [selectedMacroIdx, setSelectedMacroIdx] = useState(() => resolveArrayIdx(initialMacroIndex));
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

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
        }}>
          MACROS ({macros.length})
        </div>
        {macros.map((m, i) => (
          <div
            key={m.index}
            onClick={() => { setSelectedMacroIdx(i); setSelectedStepIdx(0); }}
            style={{
              padding: '3px 8px', cursor: 'pointer',
              backgroundColor: i === selectedMacroIdx ? 'rgba(224,160,80,0.2)' : 'transparent',
              color: i === selectedMacroIdx ? '#e0a050' : 'var(--color-text-secondary)',
              borderLeft: i === selectedMacroIdx ? '2px solid #e0a050' : '2px solid transparent',
            }}
          >
            {hex2(m.index)} : {m.length}st
          </div>
        ))}
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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>STEPS</span>
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

            {/* Opcode selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <label style={{ width: '70px', color: 'var(--color-text-muted)' }}>Opcode</label>
              <select
                value={cmd.opcode}
                onChange={(e) => handleOpcodeChange(Number(e.target.value))}
                style={{
                  flex: 1, fontSize: '11px', padding: '2px 4px',
                  background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)', borderRadius: '2px',
                }}
              >
                {TFMX_MACRO_COMMANDS.map(d => (
                  <option key={d.opcode} value={d.opcode}>
                    {hex2(d.opcode)} — {d.mnemonic}
                  </option>
                ))}
              </select>
            </div>

            {/* Flag bits */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <label style={{ width: '70px', color: 'var(--color-text-muted)' }}>Flags</label>
              <select
                value={cmd.flags}
                onChange={(e) => handleFlagsChange(Number(e.target.value))}
                style={{
                  flex: 1, fontSize: '11px', padding: '2px 4px',
                  background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)', borderRadius: '2px',
                }}
              >
                <option value={0x00}>00 — none</option>
                <option value={0x40}>40 — keyup wait</option>
                <option value={0x80}>80 — pause flag</option>
                <option value={0xC0}>C0 — both</option>
              </select>
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
    </div>
  );
};
