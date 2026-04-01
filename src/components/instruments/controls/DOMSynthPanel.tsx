/**
 * DOMSynthPanel — DOM equivalent of PixiSynthPanel.
 * Renders SynthPanelLayout descriptors as React DOM controls with compact 2-column layout.
 * Used for synths that have declarative layouts but no dedicated *Controls component.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import type { SynthPanelLayout, SectionDescriptor, ControlDescriptor } from '@/pixi/views/instruments/synthPanelTypes';

interface DOMSynthPanelProps {
  layout: SynthPanelLayout;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}

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

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Tab bar */}
      {layout.tabs && layout.tabs.length > 1 && (
        <div className="flex gap-1 mb-1">
          {layout.tabs.map((tab: { id: string; label: string; sections: SectionDescriptor[] }) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40'
                  : 'bg-dark-bgSecondary text-text-muted border border-dark-border hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 3-column section grid */}
      <div className="grid grid-cols-4 gap-2">
        {sections.map((section, sIdx) => (
          <DOMSynthSection
            key={`${activeTab}-${sIdx}`}
            section={section}
            getValue={getValue}
            updateParam={updateParam}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Section renderer ──────────────────────────────────────────────────────

interface SectionProps {
  section: SectionDescriptor;
  getValue: (key: string) => unknown;
  updateParam: (key: string, value: unknown) => void;
}

const DOMSynthSection: React.FC<SectionProps> = ({ section, getValue, updateParam }) => {
  // Sort controls: knobs first, then sliders, then toggles/switches
  const knobs = section.controls.filter((c: ControlDescriptor) => c.type === 'knob' || c.type === 'slider');
  const toggles = section.controls.filter((c: ControlDescriptor) => c.type === 'toggle' || c.type === 'switch3way');

  return (
    <div className="bg-dark-bgSecondary/50 rounded-lg border border-dark-border/30 p-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
        {section.label}
      </div>
      {/* Row 1: Knobs + sliders */}
      {knobs.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {knobs.map((ctrl: ControlDescriptor) => (
            <DOMSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
            />
          ))}
        </div>
      )}
      {/* Row 2: Toggles + switches */}
      {toggles.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1.5 pt-1.5 border-t border-dark-border/20">
          {toggles.map((ctrl: ControlDescriptor) => (
            <DOMSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
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
}

const DOMSynthControl: React.FC<ControlProps> = ({ descriptor, value, onChange }) => {
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
            color={descriptor.color ?? '#ffaa00'}
            formatValue={descriptor.formatValue}
          />
        </div>
      );
    }

    case 'toggle': {
      const active = Boolean(value);
      return (
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => onChange(!active)}
            className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded border transition-colors ${
              active
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
                : 'bg-dark-bgTertiary text-text-muted border-dark-border'
            }`}
          >
            {active ? (descriptor.labels?.[1] ?? 'ON') : (descriptor.labels?.[0] ?? 'OFF')}
          </button>
          <div className="text-[7px] text-text-muted uppercase">{descriptor.label}</div>
        </div>
      );
    }

    case 'slider': {
      const numVal = typeof value === 'number' ? value : 0.5;
      const min = descriptor.min ?? 0;
      const max = descriptor.max ?? 1;
      return (
        <div className="flex flex-col items-center gap-0.5">
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={numVal}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 accent-accent-primary"
            style={{ maxWidth: '60px' }}
          />
          <div className="text-[7px] text-text-muted uppercase">{descriptor.label}</div>
        </div>
      );
    }

    case 'switch3way': {
      const numVal = (typeof value === 'number' ? value : 0) as 0 | 1 | 2;
      return (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex gap-px">
            {descriptor.labels.map((label: string, i: number) => (
              <button
                key={i}
                onClick={() => onChange(i)}
                className={`px-1.5 py-0.5 text-[7px] font-bold uppercase rounded-sm transition-colors ${
                  numVal === i
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-dark-bgTertiary text-text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-[7px] text-text-muted uppercase">{descriptor.label}</div>
        </div>
      );
    }

    default:
      return null;
  }
};
