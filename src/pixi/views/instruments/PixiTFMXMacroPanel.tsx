/**
 * PixiTFMXMacroPanel — GL-native TFMX macro instrument editor.
 *
 * Mirrors the DOM TFMXMacroEditor (src/components/tfmx/TFMXMacroEditor.tsx)
 * 1:1 in structure: macro list → command list → detail editor with all
 * 42 Huelsbeck command opcodes + parameter layouts.
 *
 * Reads from useFormatStore.tfmxNative and writes through setTFMXMacroCommand,
 * which patches both the in-memory native data and the tfmxFileData buffer.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PixiButton, PixiLabel, PixiList, PixiSelect, type SelectOption, type PixiListItem } from '../../components';
import { PixiPureTextInput } from '../../input/PixiPureTextInput';
import { usePixiTheme } from '../../theme';
import { useFormatStore } from '@stores';
import { TFMX_MACRO_COMMANDS } from '@/types/tfmxNative';
import type { TFMXMacroCommand, TFMXMacroParamLayout } from '@/types/tfmxNative';
import { TFMXEngine } from '@/engine/tfmx/TFMXEngine';
import type { InstrumentConfig } from '@typedefs/instrument';

// ── Helpers (mirror DOM editor) ──────────────────────────────────────────────

function findCmdDef(opcode: number) {
  return TFMX_MACRO_COMMANDS.find(c => c.opcode === opcode);
}
function hex2(v: number): string { return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
function hex8(v: number): string { return (v >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
function s16(v: number): number { return v > 0x7FFF ? v - 0x10000 : v; }

interface ParamField {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  apply: (cmd: TFMXMacroCommand, newVal: number) => [number, number, number];
}

function buildParamFields(cmd: TFMXMacroCommand, layout: TFMXMacroParamLayout): ParamField[] {
  const { byte1: b1, byte2: b2, byte3: b3 } = cmd;
  const w16 = (b2 << 8) | b3;
  const w24 = (b1 << 16) | (b2 << 8) | b3;
  switch (layout) {
    case 'none':       return [];
    case 'byte':       return [{ label: 'Param', value: b1, display: hex2(b1), min: 0, max: 255,
                                  apply: (_c, v) => [v & 0xFF, b2, b3] }];
    case 'word16':     return [{ label: 'Word16', value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535,
                                  apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] }];
    case 'addr24':     return [{ label: 'Addr24', value: w24, display: hex2(b1) + hex2(b2) + hex2(b3), min: 0, max: 0xFFFFFF,
                                  apply: (_c, v) => [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF] }];
    case 'byte_word':  return [
      { label: 'Count', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Step',  value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535, apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
    ];
    case 'note_detune': return [
      { label: 'Note', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Detune', value: s16(w16), display: s16(w16).toString(), min: -32768, max: 32767,
        apply: (_c, v) => { const u = (v < 0 ? v + 0x10000 : v) & 0xFFFF; return [b1, (u >> 8) & 0xFF, u & 0xFF]; } },
    ];
    case 'env': return [
      { label: 'Speed',  value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Count',  value: b2, display: hex2(b2), min: 0, max: 255, apply: (_c, v) => [b1, v & 0xFF, b3] },
      { label: 'Target', value: b3, display: hex2(b3), min: 0, max: 0x3F, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
    case 'vibrato': return [
      { label: 'Speed',     value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Intensity', value: b3, display: hex2(b3), min: 0, max: 255, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
    case 'volume': return [{ label: 'Volume', value: b3, display: hex2(b3), min: 0, max: 0x3F, apply: (_c, v) => [b1, b2, v & 0xFF] }];
    case 'addvol_note': return [
      { label: 'Note', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Flag', value: b2, display: hex2(b2), min: 0, max: 255, apply: (_c, v) => [b1, v & 0xFF, b3] },
      { label: 'Vol',  value: b3, display: hex2(b3), min: 0, max: 0x3F, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
    case 'wave': return [{ label: 'Sample', value: b3, display: hex2(b3), min: 0, max: 255, apply: (_c, v) => [b1, b2, v & 0xFF] }];
    case 'wave_mod': return [
      { label: 'Sample', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Arg',    value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535, apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
    ];
    case 'split': return [
      { label: 'Threshold', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Step',      value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535, apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
    ];
    case 'random': return [
      { label: 'Macro', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Speed', value: b2, display: hex2(b2), min: 0, max: 255, apply: (_c, v) => [b1, v & 0xFF, b3] },
      { label: 'Mode',  value: b3, display: hex2(b3), min: 0, max: 255, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
    case 'play_macro': return [
      { label: 'Macro',  value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Ch|Vol', value: b2, display: hex2(b2), min: 0, max: 255, apply: (_c, v) => [b1, v & 0xFF, b3] },
      { label: 'Detune', value: b3, display: hex2(b3), min: 0, max: 255, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
    case 'sid_speed': return [
      { label: 'Speed', value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'Delta', value: w16, display: hex2(b2) + hex2(b3), min: 0, max: 65535, apply: (_c, v) => [b1, (v >> 8) & 0xFF, v & 0xFF] },
    ];
    case 'sid_op1': return [
      { label: 'Speed',      value: b1, display: hex2(b1), min: 0, max: 255, apply: (_c, v) => [v & 0xFF, b2, b3] },
      { label: 'InterMod',   value: b2, display: hex2(b2), min: 0, max: 255, apply: (_c, v) => [b1, v & 0xFF, b3] },
      { label: 'InterDelta', value: b3, display: hex2(b3), min: 0, max: 255, apply: (_c, v) => [b1, b2, v & 0xFF] },
    ];
  }
  return [];
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  instrument: InstrumentConfig;
}

export const PixiTFMXMacroPanel: React.FC<Props> = ({ instrument }) => {
  const theme = usePixiTheme();
  const native = useFormatStore(s => s.tfmxNative);
  const setMacroCommand = useFormatStore(s => s.setTFMXMacroCommand);
  const insertStep = useFormatStore(s => s.insertTFMXMacroStep);
  const deleteStep = useFormatStore(s => s.deleteTFMXMacroStep);
  const duplicateStep = useFormatStore(s => s.duplicateTFMXMacroStep);
  const tfmxFileData = useFormatStore(s => s.tfmxFileData);
  const tfmxSmplData = useFormatStore(s => s.tfmxSmplData);
  const [autoReload, setAutoReload] = useState(false);

  // Auto-reload (debounced) — same logic as the DOM editor
  useEffect(() => {
    if (!autoReload) return;
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    const handle = window.setTimeout(() => {
      TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [autoReload, tfmxFileData, tfmxSmplData, native?.macros]);

  const initialMacroIndex = (instrument.metadata as { tfmxMacroIndex?: number } | undefined)?.tfmxMacroIndex;

  const resolveArrayIdx = useCallback((tableIdx: number | undefined): number => {
    if (tableIdx === undefined || !native) return 0;
    const found = native.macros.findIndex(m => m.index === tableIdx);
    return found >= 0 ? found : 0;
  }, [native]);

  const [selectedMacroIdx, setSelectedMacroIdx] = useState(() => resolveArrayIdx(initialMacroIndex));
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);

  useEffect(() => {
    if (initialMacroIndex === undefined) return;
    setSelectedMacroIdx(resolveArrayIdx(initialMacroIndex));
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

  // ── Pixi list items ────────────────────────────────────────────────────────

  const macroItems = useMemo<PixiListItem[]>(
    () => macros.map((m) => ({
      id: String(m.index),
      label: `${hex2(m.index)} : ${m.length}st`,
    })),
    [macros],
  );

  const stepItems = useMemo<PixiListItem[]>(
    () => (macro?.commands ?? []).map((c, i) => {
      const def = findCmdDef(c.opcode);
      return {
        id: String(i),
        label: `${i.toString().padStart(3, '0')}  ${hex2(c.byte0)} ${hex2(c.byte1)} ${hex2(c.byte2)} ${hex2(c.byte3)}`,
        sublabel: def?.mnemonic ?? `?${hex2(c.opcode)}`,
      };
    }),
    [macro],
  );

  // ── Mutators ───────────────────────────────────────────────────────────────

  const handleOpcodeChange = useCallback((value: string) => {
    if (!cmd) return;
    const newOp = parseInt(value, 10);
    const newB0 = (cmd.byte0 & 0xC0) | (newOp & 0x3F);
    setMacroCommand(selectedMacroIdx, selectedStepIdx, newB0, cmd.byte1, cmd.byte2, cmd.byte3);
  }, [cmd, selectedMacroIdx, selectedStepIdx, setMacroCommand]);

  const handleFlagsChange = useCallback((value: string) => {
    if (!cmd) return;
    const newFlags = parseInt(value, 10);
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

  const reloadAudio = useCallback(() => {
    if (!tfmxFileData || !TFMXEngine.hasInstance()) return;
    TFMXEngine.getInstance().reloadModule(tfmxFileData, tfmxSmplData);
  }, [tfmxFileData, tfmxSmplData]);

  const opcodeOptions: SelectOption[] = useMemo(
    () => TFMX_MACRO_COMMANDS.map(d => ({ value: String(d.opcode), label: `${hex2(d.opcode)} — ${d.mnemonic}` })),
    [],
  );

  const flagsOptions: SelectOption[] = useMemo(() => [
    { value: '0',   label: '00 — none' },
    { value: '64',  label: '40 — keyup wait' },
    { value: '128', label: '80 — pause flag' },
    { value: '192', label: 'C0 — both' },
  ], []);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!native || macros.length === 0) {
    return (
      <layoutContainer layout={{ flexDirection: 'column', padding: 12, gap: 8 }}>
        <PixiLabel text="TFMX Macro Editor" size="md" weight="bold" color="custom" customColor={theme.accent.color} />
        <PixiLabel text="No TFMX macros loaded" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 6 }}>
      {/* Header */}
      <layoutContainer layout={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 6, borderRadius: 4, backgroundColor: theme.bgTertiary.color,
      }}>
        <PixiLabel text="TFMX MACRO" size="sm" weight="bold" color="custom" customColor={theme.accent.color} />
        <PixiLabel text={`${macros.length} macros`} size="xs" color="textMuted" />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton
          label={autoReload ? 'auto-reload ✓' : 'auto-reload'}
          variant={autoReload ? 'primary' : 'ghost'}
          onClick={() => setAutoReload(!autoReload)}
        />
        <PixiButton label="Reload Audio" variant="ghost" onClick={reloadAudio} />
      </layoutContainer>

      {/* Three-pane body */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 6 }}>
        {/* Macro list */}
        <layoutContainer layout={{
          flexDirection: 'column', gap: 4,
          padding: 4, borderWidth: 1, borderColor: theme.border.color, borderRadius: 4,
          backgroundColor: theme.bgSecondary.color,
        }}>
          <PixiLabel text="MACROS" size="xs" weight="bold" color="textMuted" />
          <PixiList
            items={macroItems}
            width={130}
            height={300}
            itemHeight={22}
            selectedId={macro ? String(macro.index) : null}
            onSelect={(id) => {
              const idx = macros.findIndex(m => String(m.index) === id);
              if (idx >= 0) { setSelectedMacroIdx(idx); setSelectedStepIdx(0); }
            }}
          />
        </layoutContainer>

        {/* Step list */}
        <layoutContainer layout={{
          flexDirection: 'column', gap: 4,
          padding: 4, borderWidth: 1, borderColor: theme.border.color, borderRadius: 4,
          backgroundColor: theme.bgSecondary.color,
        }}>
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <PixiLabel text={`STEPS @ ${hex8(macro?.fileOffset ?? 0)}`} size="xs" weight="bold" color="textMuted" />
            <layoutContainer layout={{ flex: 1 }} />
            <PixiButton label="+" variant="ghost" onClick={() => insertStep(selectedMacroIdx, selectedStepIdx)} />
            <PixiButton label="×2" variant="ghost" onClick={() => duplicateStep(selectedMacroIdx, selectedStepIdx)} />
            <PixiButton label="−" variant="ghost" onClick={() => {
              if (deleteStep(selectedMacroIdx, selectedStepIdx)) {
                setSelectedStepIdx(Math.max(0, selectedStepIdx - 1));
              }
            }} />
          </layoutContainer>
          <PixiList
            items={stepItems}
            width={250}
            height={300}
            itemHeight={22}
            selectedId={String(selectedStepIdx)}
            onSelect={(id) => setSelectedStepIdx(parseInt(id, 10))}
          />
        </layoutContainer>

        {/* Detail editor */}
        <layoutContainer layout={{
          flexDirection: 'column', gap: 6, flex: 1,
          padding: 8, borderWidth: 1, borderColor: theme.border.color, borderRadius: 4,
          backgroundColor: theme.bgSecondary.color,
        }}>
          {cmd && cmdDef ? (
            <>
              <PixiLabel
                text={`MACRO ${hex2(macro!.index)} · STEP ${selectedStepIdx} · @${hex8(cmd.fileOffset)}`}
                size="xs" color="textMuted"
              />
              <PixiLabel text={cmdDef.mnemonic} size="md" weight="bold" color="custom" customColor={theme.accent.color} />
              <PixiLabel text={cmdDef.description} size="xs" color="textMuted" />

              {/* Opcode */}
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <PixiLabel text="Opcode" size="xs" color="textMuted" />
                <PixiSelect
                  options={opcodeOptions}
                  value={String(cmd.opcode)}
                  onChange={handleOpcodeChange}
                  width={220}
                  searchable
                />
              </layoutContainer>

              {/* Flags */}
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PixiLabel text="Flags" size="xs" color="textMuted" />
                <PixiSelect
                  options={flagsOptions}
                  value={String(cmd.flags)}
                  onChange={handleFlagsChange}
                  width={220}
                />
              </layoutContainer>

              {/* Parameter fields */}
              {paramFields.length === 0 && (
                <PixiLabel text="No parameters" size="xs" color="textMuted" />
              )}
              {paramFields.map((field, i) => (
                <layoutContainer
                  key={`${selectedMacroIdx}-${selectedStepIdx}-${i}`}
                  layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <PixiLabel text={field.label} size="xs" color="textMuted" />
                  <PixiPureTextInput
                    value={field.display}
                    onChange={(val) => handleParamChange(field, val)}
                    width={120}
                    height={22}
                  />
                  <PixiLabel text={`[${field.min}..${field.max}]`} size="xs" color="textMuted" />
                </layoutContainer>
              ))}

              {/* Raw bytes (always visible in GL — no toggle) */}
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <PixiLabel text="RAW" size="xs" color="textMuted" />
                <PixiLabel
                  text={`${hex2(cmd.byte0)} ${hex2(cmd.byte1)} ${hex2(cmd.byte2)} ${hex2(cmd.byte3)}`}
                  size="sm"
                  color="custom"
                  customColor={theme.text.color}
                />
                <PixiLabel text={`raw=$${hex8(cmd.raw)}`} size="xs" color="textMuted" />
              </layoutContainer>
            </>
          ) : (
            <PixiLabel text="Select a step" size="sm" color="textMuted" />
          )}
        </layoutContainer>
      </layoutContainer>
    </layoutContainer>
  );
};
