/**
 * ChipSynthControls - Data-driven control renderer for MAME chip synthesizer parameters.
 *
 * Reads parameter metadata from chipParameters.ts and renders appropriate controls
 * (knobs, selects, toggles) grouped by section. Supports operator tabs for FM synths.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { getChipSynthDef, type ChipParameterDef } from '@constants/chipParameters';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import type { SynthType } from '@typedefs/instrument';
import JSZip from 'jszip';

interface ChipSynthControlsProps {
  synthType: SynthType;
  parameters: Record<string, any>;
  instrumentId: number;
  onParamChange: (key: string, value: number) => void;
  onTextChange?: (key: string, value: string) => void;
  onLoadPreset: (program: number) => void;
  onRomUpload?: (bank: number, data: Uint8Array) => void;
}

export const ChipSynthControls: React.FC<ChipSynthControlsProps> = ({
  synthType,
  parameters,
  instrumentId: _instrumentId,
  onParamChange,
  onTextChange,
  onLoadPreset,
  onRomUpload,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const chipDef = useMemo(() => getChipSynthDef(synthType), [synthType]);
  const [activeOpTab, setActiveOpTab] = useState(0); // 0 = Global, 1-N = Operators
  
  // Use ref to prevent stale closures in callbacks
  const parametersRef = useRef(parameters);
  parametersRef.current = parameters;

  if (!chipDef) return null;

  // Group parameters by their group field
  const grouped = useMemo(() => {
    const groups: Record<string, ChipParameterDef[]> = {};
    for (const param of chipDef.parameters) {
      if (!groups[param.group]) groups[param.group] = [];
      groups[param.group].push(param);
    }
    return groups;
  }, [chipDef]);

  const formatValue = useCallback((param: ChipParameterDef, value: number): string => {
    if (param.formatValue === 'percent') return `${Math.round(value * 100)}%`;
    if (param.formatValue === 'int') return String(Math.round(value));
    if (param.formatValue === 'hz') return `${Math.round(value)} Hz`;
    if (param.formatValue === 'db') return `${value.toFixed(1)} dB`;
    if (param.formatValue === 'seconds') return `${value.toFixed(3)}s`;
    if (param.options) {
      const opt = param.options.find(o => o.value === Math.round(value));
      return opt ? opt.label : String(Math.round(value));
    }
    return value.toFixed(2);
  }, []);

  const accentColor = isCyanTheme ? '#00ffff' : chipDef.color;
  const knobColor = isCyanTheme ? '#00ffff' : chipDef.color;
  const bgColor = isCyanTheme ? 'rgba(0, 20, 20, 0.4)' : 'rgba(0,0,0,0.3)';
  const textColor = isCyanTheme ? '#00ffff' : '#e2e8f0';
  const mutedColor = isCyanTheme ? '#006060' : '#94a3b8';
  const panelBorder = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255,255,255,0.08)';

  // ROM upload handler (for ROM-dependent synths)
  const handleRomFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, bank: number) => {
    const file = e.target.files?.[0];
    if (!file || !onRomUpload) return;

    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        const files: { name: string; entry: any }[] = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const isMetadata = relativePath.toLowerCase().match(/\.(txt|md|pdf|url|inf)$/);
          if (!zipEntry.dir && !isMetadata) {
            files.push({ name: relativePath, entry: zipEntry });
          }
        });

        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        console.log(`🎹 ROM: Extracting ${files.length} files from ZIP starting at bank ${bank}...`);

        for (let i = 0; i < files.length; i++) {
          const targetBank = bank + i;
          const fileData = await files[i].entry.async('uint8array');
          onRomUpload(targetBank, fileData);
          console.log(`🎹 ROM: Loaded ${files[i].name} into bank ${targetBank} (${fileData.length} bytes)`);
        }

        onParamChange('_romsLoaded', 1);
      } catch (err) {
        console.error('🎹 ROM: Failed to unzip ROM set:', err);
      }
    } else {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      onRomUpload(bank, data);
      onParamChange('_romsLoaded', 1);
      console.log(`🎹 ROM: Loaded ROM bank ${bank} (${data.length} bytes)`);
    }

    // Reset the input so the same file can be re-uploaded
    e.target.value = '';
  }, [onRomUpload, onParamChange]);

  const renderParam = (param: ChipParameterDef, keyPrefix = '') => {
    const paramKey = keyPrefix ? `${keyPrefix}${param.key}` : param.key;
    const currentValue = parameters[paramKey] ?? param.default;

    if (param.type === 'toggle') {
      return (
        <div key={paramKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => onParamChange(paramKey, currentValue ? 0 : 1)}
            style={{
              width: 48, height: 24, borderRadius: 12,
              background: currentValue ? accentColor : (isCyanTheme ? '#0a1a1a' : '#334155'),
              border: `1px solid ${currentValue ? accentColor : panelBorder}`,
              cursor: 'pointer', position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              background: isCyanTheme ? '#030808' : '#fff',
              position: 'absolute', top: 2,
              left: currentValue ? 27 : 3,
              transition: 'left 0.2s',
              boxShadow: currentValue ? `0 0 6px ${accentColor}` : 'none',
            }} />
          </button>
          <span style={{ fontSize: 10, color: mutedColor }}>{param.label}</span>
        </div>
      );
    }

    if (param.type === 'text') {
      const textValue = parameters[paramKey] ?? param.defaultText ?? '';
      return (
        <div key={paramKey} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 100%' }}>
          <span style={{ fontSize: 10, color: mutedColor, textTransform: 'uppercase', fontWeight: 600 }}>{param.label}</span>
          <input
            type="text"
            value={textValue}
            onChange={(e) => onTextChange?.(paramKey, e.target.value)}
            placeholder={param.placeholder || ''}
            style={{
              background: isCyanTheme ? '#041010' : '#0d1117',
              color: isCyanTheme ? '#00ffff' : accentColor,
              border: `1px solid ${panelBorder}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              fontFamily: 'Monaco, Menlo, monospace',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
      );
    }

    if (param.type === 'select' && param.options) {
      return (
        <div key={paramKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <select
            value={Math.round(currentValue)}
            onChange={(e) => onParamChange(paramKey, Number(e.target.value))}
            style={{
              background: isCyanTheme ? '#041010' : '#1e293b',
              color: textColor,
              border: `1px solid ${panelBorder}`,
              borderRadius: 6, padding: '4px 8px',
              fontSize: 11, cursor: 'pointer',
              minWidth: 80,
            }}
          >
            {param.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: mutedColor }}>{param.label}</span>
        </div>
      );
    }

    // Default: knob
    return (
      <Knob
        key={paramKey}
        value={currentValue}
        min={param.min ?? 0}
        max={param.max ?? 1}
        step={param.step ?? 0.01}
        onChange={(v) => onParamChange(paramKey, v)}
        label={param.label}
        color={knobColor}
        size="sm"
        defaultValue={param.default}
        logarithmic={param.logarithmic}
        bipolar={param.bipolar}
        formatValue={(v) => formatValue(param, v)}
      />
    );
  };

  const renderGroup = (groupName: string, params: ChipParameterDef[], keyPrefix = '') => (
    <div key={groupName} style={{
      background: bgColor,
      border: `1px solid ${panelBorder}`,
      borderRadius: 8,
      padding: '8px 12px',
      marginBottom: 8,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: accentColor,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        {groupName}
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
      }}>
        {params.map(p => renderParam(p, keyPrefix))}
      </div>
    </div>
  );

  // Operator tabs for FM synths (e.g. YMOPQ)
  const hasOperators = chipDef.operatorCount != null && chipDef.operatorCount > 0 && chipDef.operatorParams;

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>
          {chipDef.name}
        </span>
        <span style={{ fontSize: 11, color: mutedColor }}>
          {chipDef.subtitle}
        </span>
      </div>

      {/* ROM Upload (for ROM-dependent synths) */}
      {chipDef.romConfig && onRomUpload && (
        <div style={{
          background: bgColor,
          border: `1px solid ${parameters._romsLoaded ? (isCyanTheme ? 'rgba(0,255,128,0.3)' : 'rgba(34,197,94,0.3)') : (isCyanTheme ? 'rgba(255,100,100,0.3)' : 'rgba(239,68,68,0.3)')}`,
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 600,
              color: accentColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              ROM Banks
            </div>
            <div style={{
              fontSize: 9, fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              background: parameters._romsLoaded
                ? (isCyanTheme ? 'rgba(0,255,128,0.15)' : 'rgba(34,197,94,0.15)')
                : (isCyanTheme ? 'rgba(255,100,100,0.15)' : 'rgba(239,68,68,0.15)'),
              color: parameters._romsLoaded
                ? (isCyanTheme ? '#00ff80' : '#22c55e')
                : (isCyanTheme ? '#ff6464' : '#ef4444'),
            }}>
              {parameters._romsLoaded ? 'ROMS READY' : 'ROMS MISSING'}
            </div>
          </div>
          <div style={{ fontSize: 9, color: mutedColor, marginBottom: 8 }}>
            Expects: <span style={{ fontFamily: 'Monaco, Menlo, monospace', color: accentColor }}>{chipDef.romConfig.requiredZip}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{
              fontSize: 10, fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${accentColor}33`,
              background: `${accentColor}11`,
              color: accentColor,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}>
              UPLOAD ZIP
              <input
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={(e) => handleRomFileUpload(e, 0)}
              />
            </label>
            {Array.from({ length: chipDef.romConfig.bankCount }, (_, i) => (
              <label key={i} style={{
                fontSize: 9,
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${panelBorder}`,
                background: isCyanTheme ? '#041010' : '#1e293b',
                color: accentColor,
                cursor: 'pointer',
              }}>
                BANK {i}
                <input
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => handleRomFileUpload(e, i)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Chip Presets */}
      {chipDef.presetCount > 0 && (
        <div style={{
          background: bgColor,
          border: `1px solid ${panelBorder}`,
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 8,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600,
            color: accentColor,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}>
            Chip Presets
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from({ length: chipDef.presetCount }, (_, i) => (
              <button
                key={i}
                onClick={() => onLoadPreset(i)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${parameters._program === i ? accentColor : panelBorder}`,
                  background: parameters._program === i
                    ? `${accentColor}22`
                    : (isCyanTheme ? '#041010' : '#1e293b'),
                  color: parameters._program === i ? accentColor : textColor,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: parameters._program === i ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {chipDef.presetNames?.[i] ?? `Preset ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Operator tabs for FM synths */}
      {hasOperators && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
          <button
            onClick={() => setActiveOpTab(0)}
            style={{
              padding: '4px 12px', borderRadius: '6px 6px 0 0',
              border: `1px solid ${panelBorder}`,
              borderBottom: activeOpTab === 0 ? `2px solid ${accentColor}` : `1px solid ${panelBorder}`,
              background: activeOpTab === 0 ? bgColor : 'transparent',
              color: activeOpTab === 0 ? accentColor : mutedColor,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Global
          </button>
          {Array.from({ length: chipDef.operatorCount! }, (_, i) => (
            <button
              key={i + 1}
              onClick={() => setActiveOpTab(i + 1)}
              style={{
                padding: '4px 12px', borderRadius: '6px 6px 0 0',
                border: `1px solid ${panelBorder}`,
                borderBottom: activeOpTab === i + 1 ? `2px solid ${accentColor}` : `1px solid ${panelBorder}`,
                background: activeOpTab === i + 1 ? bgColor : 'transparent',
                color: activeOpTab === i + 1 ? accentColor : mutedColor,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Op {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Global parameters (always shown, or only when activeOpTab===0 for FM) */}
      {(!hasOperators || activeOpTab === 0) && (
        Object.entries(grouped).map(([group, params]) => renderGroup(group, params))
      )}

      {/* Operator parameters */}
      {hasOperators && activeOpTab > 0 && chipDef.operatorParams && (() => {
        const opParams = chipDef.operatorParams!;
        const opGroups: Record<string, ChipParameterDef[]> = {};
        for (const p of opParams) {
          if (!opGroups[p.group]) opGroups[p.group] = [];
          opGroups[p.group].push(p);
        }
        return Object.entries(opGroups).map(([group, params]) =>
          renderGroup(group, params, `op${activeOpTab}_`)
        );
      })()}
    </div>
  );
};

export default ChipSynthControls;
