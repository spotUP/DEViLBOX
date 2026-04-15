/**
 * DOMSynthPanel — DOM equivalent of PixiSynthPanel.
 * Renders SynthPanelLayout descriptors as React DOM controls styled like effect pedals.
 * Used for synths that have declarative layouts but no dedicated *Controls component.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import type { SynthPanelLayout, SectionDescriptor, ControlDescriptor } from '@/pixi/views/instruments/synthPanelTypes';

interface DOMSynthPanelProps {
  layout: SynthPanelLayout;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}

// ─── Enclosure color system (matches effect pedal styling) ─────────────────
interface EnclosureColors { bg: string; bgEnd: string; accent: string; border: string }

// Section accent colors — cycling palette for visual variety
const SECTION_ACCENTS = [
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#10b981', // emerald
  '#f97316', // orange
  '#3b82f6', // blue
  '#ef4444', // red
];

function getSynthEnclosure(synthName: string): EnclosureColors {
  const name = synthName.toLowerCase();
  if (name.includes('bass') || name.includes('wobble'))
    return { bg: '#1a0a22', bgEnd: '#100618', accent: '#a855f7', border: '#2a1430' };
  if (name.includes('drum') || name.includes('808') || name.includes('membrane'))
    return { bg: '#2a1008', bgEnd: '#1a0a04', accent: '#ef4444', border: '#3a1a0a' };
  if (name.includes('fm') || name.includes('dx') || name.includes('dexed'))
    return { bg: '#081420', bgEnd: '#040e18', accent: '#22d3ee', border: '#0a1e30' };
  if (name.includes('pad') || name.includes('ambient') || name.includes('space'))
    return { bg: '#0e0a20', bgEnd: '#080618', accent: '#6366f1', border: '#1a1430' };
  if (name.includes('lead') || name.includes('mono'))
    return { bg: '#200a18', bgEnd: '#180614', accent: '#ec4899', border: '#301428' };
  if (name.includes('organ') || name.includes('piano') || name.includes('key'))
    return { bg: '#081a0a', bgEnd: '#041204', accent: '#10b981', border: '#0a2a0e' };
  if (name.includes('pluck') || name.includes('string') || name.includes('guitar'))
    return { bg: '#201408', bgEnd: '#180e04', accent: '#f59e0b', border: '#301e0a' };
  if (name.includes('noise') || name.includes('metal'))
    return { bg: '#141414', bgEnd: '#0a0a0a', accent: '#94a3b8', border: '#282828' };
  // Default — deep purple
  return { bg: '#120a1a', bgEnd: '#0a0612', accent: '#8b5cf6', border: '#1e1430' };
}

const ENCLOSURE_SHADOW = [
  '0 6px 16px rgba(0,0,0,0.5)',
  '0 2px 4px rgba(0,0,0,0.7)',
  'inset 0 1px 0 rgba(255,255,255,0.06)',
  'inset 0 -1px 0 rgba(0,0,0,0.4)',
].join(', ');

// Deep-get a value from a nested object using dot-notation path
const deepGet = (obj: unknown, path: string): unknown => {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

// Deep-set a value at a dot-notation path, returning a shallow copy
const deepSet = (container: unknown, pathParts: string[], value: unknown): unknown => {
  if (pathParts.length === 0) return value;
  const [k, ...rest] = pathParts;
  const copy = { ...(container as Record<string, unknown>) };
  copy[k] = deepSet(copy[k], rest, value);
  return copy;
};

export const DOMSynthPanel: React.FC<DOMSynthPanelProps> = ({ layout, config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  const [activeTab, setActiveTab] = useState(layout.tabs?.[0]?.id ?? '');
  const enc = getSynthEnclosure(layout.name);

  const resolveKey = (key: string): string => {
    if (key.startsWith('~')) return key.slice(1);
    return layout.configKey ? `${layout.configKey}.${key}` : key;
  };

  const updateParam = useCallback((key: string, value: unknown) => {
    const full = resolveKey(key);
    const parts = full.split('.');
    if (parts.length === 1) {
      onChange({ [parts[0]]: value });
    } else {
      const [root, ...rest] = parts;
      const newRoot = deepSet(configRef.current[root], rest, value);
      onChange({ [root]: newRoot });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, layout.configKey]);

  const getValue = (key: string): unknown => deepGet(config, resolveKey(key));

  // Get sections for current view
  const sections: SectionDescriptor[] = layout.tabs
    ? (layout.tabs.find((t: { id: string; label: string; sections: SectionDescriptor[] }) => t.id === activeTab)?.sections ?? layout.tabs[0]?.sections ?? [])
    : (layout.sections ?? []);

  // Knob width ~80px (56px knob + label padding). Per-section flex-basis
  // is driven by how many knobs fit in one row (capped at 3).
  const KNOB_W = 80;
  const SECTION_PAD = 32; // p-3 * 2 + border
  const sectionBases = sections.map(s => {
    const knobCount = s.controls.filter(c => c.type === 'knob' || c.type === 'slider').length;
    const knobsPerRow = Math.min(knobCount, 3);
    return knobsPerRow * KNOB_W + SECTION_PAD;
  });

  return (
    <div
      className="synth-editor-container rounded-xl overflow-hidden select-none"
      style={{
        background: `linear-gradient(170deg, ${enc.bg} 0%, ${enc.bgEnd} 100%)`,
        border: `2px solid ${enc.border}`,
        boxShadow: ENCLOSURE_SHADOW,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center gap-3"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
          borderBottom: `1px solid ${enc.border}`,
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black"
          style={{
            background: `linear-gradient(135deg, ${enc.accent}40, ${enc.accent}20)`,
            border: `1px solid ${enc.accent}30`,
            boxShadow: `0 0 12px ${enc.accent}15`,
            color: enc.accent,
          }}
        >
          ♪
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-text-primary tracking-wide truncate">{layout.name}</div>
        </div>
        {/* LED */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: '#22ff44',
            boxShadow: '0 0 4px 1px rgba(34,255,68,0.5), 0 0 10px 3px rgba(34,255,68,0.15)',
          }}
        />
      </div>

      {/* Tab bar */}
      {layout.tabs && layout.tabs.length > 1 && (
        <div className="flex gap-0 border-b" style={{ borderColor: enc.border }}>
          {layout.tabs.map((tab: { id: string; label: string; sections: SectionDescriptor[] }) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                activeTab === tab.id
                  ? 'text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              style={activeTab === tab.id ? {
                background: `linear-gradient(180deg, ${enc.accent}15, transparent)`,
                borderBottom: `2px solid ${enc.accent}`,
              } : {
                borderBottom: '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Sections — flex-wrap, each section sized to its knob content */}
      <div className="p-3 flex flex-wrap gap-3">
        {sections.map((section, sIdx) => (
          <DOMSynthSection
            key={`${activeTab}-${sIdx}`}
            section={section}
            flexBasis={sectionBases[sIdx]}
            getValue={getValue}
            updateParam={updateParam}
            accent={SECTION_ACCENTS[sIdx % SECTION_ACCENTS.length]}
            enclosure={enc}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Section renderer ──────────────────────────────────────────────────────

interface SectionProps {
  section: SectionDescriptor;
  flexBasis: number;
  getValue: (key: string) => unknown;
  updateParam: (key: string, value: unknown) => void;
  accent: string;
  enclosure: EnclosureColors;
}

const DOMSynthSection: React.FC<SectionProps> = ({ section, flexBasis, getValue, updateParam, accent, enclosure }) => {
  const knobs = section.controls.filter((c: ControlDescriptor) => c.type === 'knob' || c.type === 'slider');
  const toggles = section.controls.filter((c: ControlDescriptor) => c.type === 'toggle' || c.type === 'switch3way' || c.type === 'select');

  return (
    <div
      className="rounded-lg p-3 backdrop-blur-sm"
      style={{
        flex: `1 1 ${flexBasis}px`,
        minWidth: flexBasis,
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${enclosure.border}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Section header with glowing dot */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-1.5 h-4 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}60` }}
        />
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/90">
          {section.label}
        </span>
      </div>

      {/* Knobs + sliders — auto-sized columns, centered so they don't stretch */}
      {knobs.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {knobs.map((ctrl: ControlDescriptor) => (
            <DOMSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
              accent={accent}
            />
          ))}
        </div>
      )}

      {/* Toggles + switches */}
      {toggles.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${enclosure.border}` }}>
          {toggles.map((ctrl: ControlDescriptor) => (
            <DOMSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
              accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Control renderer ───────────────────────────────────────────────────────

interface ControlProps {
  descriptor: ControlDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
  accent: string;
}

const DOMSynthControl: React.FC<ControlProps> = ({ descriptor, value, onChange, accent }) => {
  switch (descriptor.type) {
    case 'knob': {
      const numVal = typeof value === 'number' ? value : (descriptor.defaultValue ?? 0.5);
      return (
        <div className="flex flex-col items-center">
          <Knob
            value={numVal}
            min={descriptor.min ?? 0}
            max={descriptor.max ?? 1}
            onChange={(v) => onChange(v)}
            label={descriptor.label}
            color={descriptor.color ?? accent}
            formatValue={descriptor.formatValue}
          />
        </div>
      );
    }

    case 'toggle': {
      const active = Boolean(value);
      return (
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => onChange(!active)}
            className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded transition-colors"
            style={active ? {
              background: `${accent}25`,
              color: accent,
              border: `1px solid ${accent}50`,
              boxShadow: `0 0 6px ${accent}20`,
            } : {
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text-muted)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {active ? (descriptor.labels?.[1] ?? 'ON') : (descriptor.labels?.[0] ?? 'OFF')}
          </button>
          <div className="text-[8px] text-text-muted uppercase tracking-wider">{descriptor.label}</div>
        </div>
      );
    }

    case 'slider': {
      const numVal = typeof value === 'number' ? value : 0.5;
      const min = descriptor.min ?? 0;
      const max = descriptor.max ?? 1;
      return (
        <div className="flex flex-col items-center gap-1">
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={numVal}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1"
            style={{ maxWidth: '64px', accentColor: accent }}
          />
          <div className="text-[8px] text-text-muted uppercase tracking-wider">{descriptor.label}</div>
        </div>
      );
    }

    case 'switch3way': {
      const numVal = (typeof value === 'number' ? value : 0) as 0 | 1 | 2;
      return (
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-px rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {descriptor.labels.map((label: string, i: number) => (
              <button
                key={i}
                onClick={() => onChange(i)}
                className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors"
                style={numVal === i ? {
                  background: `${accent}25`,
                  color: accent,
                } : {
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-[8px] text-text-muted uppercase tracking-wider">{descriptor.label}</div>
        </div>
      );
    }

    case 'select': {
      const strVal = typeof value === 'string' ? value : String(value ?? '');
      return (
        <div className="flex flex-col gap-1">
          <div className="text-[8px] text-text-muted uppercase tracking-wider">{descriptor.label}</div>
          <CustomSelect
            value={strVal}
            onChange={(v) => onChange(v)}
            options={descriptor.options.map((opt) => ({ value: opt.value, label: opt.label }))}
            className="px-2 py-1 text-[10px] rounded border transition-colors focus:outline-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      );
    }

    default:
      return null;
  }
};
