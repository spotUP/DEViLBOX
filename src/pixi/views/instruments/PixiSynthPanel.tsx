/**
 * PixiSynthPanel — Generic synth panel renderer.
 * Reads a SynthPanelLayout descriptor and renders sections of knobs/toggles/sliders.
 * Uses the configRef pattern for stale-state prevention (CLAUDE.md: Knob/Control Handling Pattern).
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiKnob, PixiToggle, PixiSlider, PixiSwitch3Way, PixiLabel } from '../../components';
import type { SynthPanelLayout, SectionDescriptor, ControlDescriptor } from './synthPanelTypes';

interface PixiSynthPanelProps {
  layout: SynthPanelLayout;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}

export const PixiSynthPanel: React.FC<PixiSynthPanelProps> = ({ layout: panelLayout, config, onChange }) => {
  const theme = usePixiTheme();

  // Stale-ref pattern per CLAUDE.md
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  const [activeTab, setActiveTab] = useState<string | null>(
    panelLayout.tabs?.[0]?.id ?? null,
  );

  // Update a single key in config
  const updateParam = useCallback((key: string, value: unknown) => {
    // Support nested keys like 'filter.cutoff'
    const parts = key.split('.');
    if (parts.length === 1) {
      onChange({ [key]: value });
    } else {
      const [root, ...rest] = parts;
      const current = (configRef.current[root] as Record<string, unknown>) || {};
      let obj = { ...current };
      let target = obj;
      for (let i = 0; i < rest.length - 1; i++) {
        const next = (target[rest[i]] as Record<string, unknown>) || {};
        target[rest[i]] = { ...next };
        target = target[rest[i]] as Record<string, unknown>;
      }
      target[rest[rest.length - 1]] = value;
      onChange({ [root]: obj });
    }
  }, [onChange]);

  // Get value from config supporting dot-notation
  const getValue = (key: string): unknown => {
    const parts = key.split('.');
    let current: unknown = config;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  // Determine which sections to show
  const activeSections = panelLayout.tabs
    ? panelLayout.tabs.find(t => t.id === activeTab)?.sections ?? []
    : panelLayout.sections ?? [];

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
      }}
    >
      {/* Synth name */}
      <PixiLabel text={panelLayout.name} size="md" weight="bold" color="accent" />

      {/* Tab bar */}
      {panelLayout.tabs && (
        <pixiContainer layout={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
          {panelLayout.tabs.map(tab => (
            <pixiContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => setActiveTab(tab.id)}
              layout={{
                height: 24,
                paddingLeft: 8,
                paddingRight: 8,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <pixiGraphics
                draw={(g: GraphicsType) => {
                  g.clear();
                  g.roundRect(0, 0, 60, 22, 4);
                  if (activeTab === tab.id) {
                    g.fill({ color: theme.accent.color, alpha: 0.15 });
                    g.roundRect(0, 0, 60, 22, 4);
                    g.stroke({ color: theme.accent.color, alpha: 0.5, width: 1 });
                  } else {
                    g.fill({ color: theme.bgTertiary.color });
                    g.roundRect(0, 0, 60, 22, 4);
                    g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 });
                  }
                }}
                layout={{ position: 'absolute', width: 60, height: 22 }}
              />
              <pixiBitmapText
                text={tab.label}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9 }}
                tint={activeTab === tab.id ? theme.accent.color : theme.textMuted.color}
              />
            </pixiContainer>
          ))}
        </pixiContainer>
      )}

      {/* Sections */}
      {activeSections.map((section, sIdx) => (
        <PixiSynthSection
          key={`${activeTab}-${sIdx}`}
          section={section}
          getValue={getValue}
          updateParam={updateParam}
        />
      ))}
    </pixiContainer>
  );
};

// ─── Section renderer ───────────────────────────────────────────────────────

interface SynthSectionProps {
  section: SectionDescriptor;
  getValue: (key: string) => unknown;
  updateParam: (key: string, value: unknown) => void;
}

const PixiSynthSection: React.FC<SynthSectionProps> = ({ section, getValue, updateParam }) => {
  const theme = usePixiTheme();

  const drawBorder = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 9999, 1);
    g.fill({ color: theme.border.color, alpha: 0.15 });
  }, [theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 6 }}>
      {/* Section label */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <pixiBitmapText
          text={section.label}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9 }}
          tint={theme.textMuted.color}
        />
        <pixiGraphics draw={drawBorder} layout={{ flex: 1, height: 1 }} />
      </pixiContainer>

      {/* Controls grid */}
      <pixiContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {section.controls.map(ctrl => (
          <PixiSynthControl
            key={ctrl.key}
            descriptor={ctrl}
            value={getValue(ctrl.key)}
            onChange={(v) => updateParam(ctrl.key, v)}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── Individual control renderer ────────────────────────────────────────────

interface SynthControlProps {
  descriptor: ControlDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
}

const PixiSynthControl: React.FC<SynthControlProps> = ({ descriptor, value, onChange }) => {
  switch (descriptor.type) {
    case 'knob':
      return (
        <PixiKnob
          value={typeof value === 'number' ? value : descriptor.defaultValue ?? 0.5}
          min={descriptor.min ?? 0}
          max={descriptor.max ?? 1}
          defaultValue={descriptor.defaultValue ?? 0.5}
          label={descriptor.label}
          size={descriptor.size ?? 'sm'}
          bipolar={descriptor.bipolar}
          formatValue={descriptor.formatValue}
          onChange={(v) => onChange(v)}
        />
      );

    case 'toggle':
      return (
        <PixiToggle
          label={descriptor.label}
          value={Boolean(value)}
          onChange={(v) => onChange(v)}
          size="sm"
        />
      );

    case 'slider':
      return (
        <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <PixiLabel text={descriptor.label} size="xs" color="textMuted" />
          <PixiSlider
            value={typeof value === 'number' ? value : 0.5}
            min={descriptor.min ?? 0}
            max={descriptor.max ?? 1}
            orientation={descriptor.orientation ?? 'vertical'}
            length={60}
            detent={descriptor.centerDetent ? (((descriptor.min ?? 0) + (descriptor.max ?? 1)) / 2) : undefined}
            onChange={(v) => onChange(v)}
          />
        </pixiContainer>
      );

    case 'switch3way':
      return (
        <pixiContainer layout={{ flexDirection: 'column', gap: 2, alignItems: 'center' }}>
          <PixiLabel text={descriptor.label} size="xs" color="textMuted" />
          <PixiSwitch3Way
            value={(typeof value === 'number' ? value : 0) as 0 | 1 | 2}
            labels={descriptor.labels}
            onChange={(v) => onChange(v)}
          />
        </pixiContainer>
      );

    default:
      return null;
  }
};
