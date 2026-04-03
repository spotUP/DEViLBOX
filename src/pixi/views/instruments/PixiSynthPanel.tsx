/**
 * PixiSynthPanel — Generic synth panel renderer.
 * Reads a SynthPanelLayout descriptor and renders sections of knobs/toggles/sliders.
 * Uses the configRef pattern for stale-state prevention (CLAUDE.md: Knob/Control Handling Pattern).
 */

import { useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiKnob, PixiToggle, PixiSlider, PixiSwitch3Way, PixiLabel, PixiSelect } from '../../components';
import type { SelectOption } from '../../components';
import type { SynthPanelLayout, SectionDescriptor, ControlDescriptor } from './synthPanelTypes';

interface PixiSynthPanelProps {
  layout: SynthPanelLayout;
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
  synthType?: string;
}

export const PixiSynthPanel: React.FC<PixiSynthPanelProps> = ({ layout: panelLayout, config, onChange, synthType }) => {
  // Stale-ref pattern per CLAUDE.md
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });

  // Resolve a layout key to a full config path.
  // Keys starting with '~' are absolute (root-level, ignores configKey).
  // All other keys are prefixed with configKey when set.
  const resolveKey = (key: string): string => {
    if (key.startsWith('~')) return key.slice(1);
    return panelLayout.configKey ? `${panelLayout.configKey}.${key}` : key;
  };

  // Deep-set a value at a dot-notation path, correctly handling arrays.
  const deepSet = (container: unknown, pathParts: string[], value: unknown): unknown => {
    if (pathParts.length === 0) return value;
    const k = pathParts[0];
    const copy: Record<string, unknown> | unknown[] = Array.isArray(container)
      ? [...(container as unknown[])]
      : { ...(container as Record<string, unknown>) };
    (copy as Record<string, unknown>)[k] = deepSet(
      (container as Record<string, unknown>)?.[k],
      pathParts.slice(1),
      value,
    );
    return copy;
  };

  // Update a single key in config, supporting nested dot-notation and configKey prefix.
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
  }, [onChange, panelLayout.configKey]);

  // Get value from config supporting dot-notation and configKey prefix.
  const getValue = (key: string): unknown => {
    const parts = resolveKey(key).split('.');
    let current: unknown = config;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };

  // Flatten all sections (tabs are removed — show everything at once like DOM)
  const allSections: SectionDescriptor[] = panelLayout.tabs
    ? panelLayout.tabs.flatMap(t => t.sections)
    : panelLayout.sections ?? [];

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 4,
        padding: 4,
      }}
    >
      {/* Synth name */}
      <PixiLabel text={panelLayout.name} size="md" weight="bold" color="accent" />

      {/* Four-column grid of all sections */}
      <pixiContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 4, width: '100%' }}>
        {allSections.map((section, sIdx) => (
          <pixiContainer key={sIdx} layout={{ width: '24%', flexShrink: 0, flexGrow: 1 }}>
            <PixiSynthSection
              section={section}
              getValue={getValue}
              updateParam={updateParam}
            />
          </pixiContainer>
        ))}
      </pixiContainer>

      {/* Sampler waveform preview */}
      {(synthType === 'Sampler' || synthType === 'Player') && (
        <PixiSamplerWaveform config={config} />
      )}
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

  // Sort controls: knobs/sliders first, then toggles/switches/selects
  const knobs = section.controls.filter(c => c.type === 'knob' || c.type === 'slider');
  const toggles = section.controls.filter(c => c.type === 'toggle' || c.type === 'switch3way' || c.type === 'select');

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4 }}>
      {/* Section label */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <pixiBitmapText
          text={section.label}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <pixiGraphics draw={drawBorder} layout={{ flex: 1, height: 1 }} />
      </pixiContainer>

      {/* Row 1: Knobs + sliders */}
      {knobs.length > 0 && (
        <pixiContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {knobs.map(ctrl => (
            <PixiSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
            />
          ))}
        </pixiContainer>
      )}

      {/* Row 2: Toggles + switches */}
      {toggles.length > 0 && (
        <pixiContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {toggles.map(ctrl => (
            <PixiSynthControl
              key={ctrl.key}
              descriptor={ctrl}
              value={getValue(ctrl.key)}
              onChange={(v) => updateParam(ctrl.key, v)}
            />
          ))}
        </pixiContainer>
      )}
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
          size={descriptor.size ?? 'md'}
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

    case 'select':
      return (
        <pixiContainer layout={{ flexDirection: 'column', gap: 2 }}>
          <PixiLabel text={descriptor.label} size="xs" color="textMuted" />
          <PixiSelect
            options={descriptor.options as SelectOption[]}
            value={typeof value === 'string' ? value : String(value ?? '')}
            onChange={(v) => onChange(v)}
            width={120}
          />
        </pixiContainer>
      );

    default:
      return null;
  }
};

// ─── Sampler waveform preview ────────────────────────────────────────────────

interface PixiSamplerWaveformProps {
  config: Record<string, unknown>;
}

const WAVEFORM_HEIGHT = 60;
const WAVEFORM_BARS = 128;

const PixiSamplerWaveform: React.FC<PixiSamplerWaveformProps> = ({ config }) => {
  const theme = usePixiTheme();

  const sample = config.sample as Record<string, unknown> | undefined;
  const audioBuffer = sample?.audioBuffer as ArrayBuffer | undefined;

  const drawWaveform = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, 9999, WAVEFORM_HEIGHT);
    g.fill({ color: theme.bgTertiary.color });

    // Border
    g.rect(0, 0, 9999, WAVEFORM_HEIGHT);
    g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });

    if (!audioBuffer || audioBuffer.byteLength < 4) {
      return;
    }

    // Interpret as Float32 PCM
    const floats = new Float32Array(audioBuffer);
    const totalSamples = floats.length;
    if (totalSamples === 0) return;

    const samplesPerBar = Math.max(1, Math.floor(totalSamples / WAVEFORM_BARS));
    const centerY = WAVEFORM_HEIGHT / 2;

    for (let bar = 0; bar < WAVEFORM_BARS; bar++) {
      const start = bar * samplesPerBar;
      const end = Math.min(start + samplesPerBar, totalSamples);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(floats[i]);
        if (abs > peak) peak = abs;
      }
      peak = Math.min(1, peak);
      const barH = Math.max(1, peak * centerY);
      // We cannot measure container width inside draw without a ref, so use bar index
      // relative to WAVEFORM_BARS. The container is width:'100%' so bars run left-to-right.
      // Use a large fixed display width (800px) as an upper bound — layout clips overflow.
      const barX = (bar / WAVEFORM_BARS) * 800;
      const barW = Math.max(1, 800 / WAVEFORM_BARS - 1);

      g.rect(barX, centerY - barH, barW, barH * 2);
      g.fill({ color: theme.accent.color, alpha: 0.6 });
    }
  }, [audioBuffer, theme]);

  return (
    <pixiContainer layout={{ flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <pixiBitmapText
        text="WAVEFORM"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{}}
      />
      <pixiContainer layout={{ width: '100%', height: WAVEFORM_HEIGHT, overflow: 'hidden' }}>
        {audioBuffer && audioBuffer.byteLength >= 4 ? (
          <pixiGraphics
            draw={drawWaveform}
            layout={{ width: '100%', height: WAVEFORM_HEIGHT }}
          />
        ) : (
          <pixiContainer
            layout={{
              width: '100%',
              height: WAVEFORM_HEIGHT,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                g.rect(0, 0, 9999, WAVEFORM_HEIGHT);
                g.fill({ color: theme.bgTertiary.color });
                g.rect(0, 0, 9999, WAVEFORM_HEIGHT);
                g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
              }}
              layout={{ position: 'absolute', width: '100%', height: WAVEFORM_HEIGHT }}
            />
            <pixiBitmapText
              text="NO SAMPLE"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
